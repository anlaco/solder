//! The digital lines of a task: adding input and output channels of lines (DT-087), and what Timing and Start check of
//! them. Every rule here was measured in LabVIEW with DAQmx on the two simulated devices
//! (`labview-captures/reports/2026-11-15-daqmx-dio.md`, §n below); reading and writing them is in [`crate::digital_io`].

use crate::device::DigitalProfile;
use crate::engine::{ChannelKind, Engine, Task, TaskId};
use crate::error::{codes, DaqError, ErrorDetails};

/// Whether a digital channel reads its lines or drives them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Input,
    Output,
}

/// DAQmx's line grouping: one channel for each line, or one channel for all the lines given (§2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineGrouping {
    OneChannelForEachLine,
    OneChannelForAllLines,
}

/// One line of one port of a device, by its canonical device name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Line {
    pub(crate) device: String,
    pub(crate) port: usize,
    pub(crate) line: usize,
}

pub(crate) struct DigitalChannel {
    pub(crate) name: String,
    pub(crate) direction: Direction,
    pub(crate) lines: Vec<Line>,
}

/// The lines one item of a list names (`Dev1/port0`, `Dev1/port0:1`, `Dev1/port0/line3:0`), each with its physical
/// name, written with the device, `port` and `line` as they were typed (§2: `Dev1/Port0/Line0` keeps its capitals).
struct ItemLines {
    lines: Vec<(Line, String)>,
    /// The name of the item's first port, when the item names whole ports rather than lines.
    whole_port: Option<String>,
}

/// The highest byte a port's lines fill in a value (§4: one byte per port); a 32-bit value holds four ports.
const BITS_PER_PORT: usize = 8;
const PORTS_IN_A_VALUE: usize = 4;

impl DigitalChannel {
    /// The simulated value of the channel when the task's counter is `counter` (§4): the counter masked by the channel's
    /// lines at their bit positions, not shifted, one byte for each port in the order the ports were given.
    pub(crate) fn value_at(&self, counter: u64) -> u32 {
        let mut ports: Vec<(&str, usize)> = Vec::new();
        let mut value = 0u32;
        for line in &self.lines {
            let port_key = (line.device.as_str(), line.port);
            let index = ports.iter().position(|known| *known == port_key).unwrap_or_else(|| {
                ports.push(port_key);
                ports.len() - 1
            });
            let bit = 1u64 << line.line;
            if index < PORTS_IN_A_VALUE && counter & bit != 0 {
                value |= (bit as u32) << (BITS_PER_PORT * index);
            }
        }
        value
    }
}

impl Engine {
    /// Adds digital channels of `lines` to a task, named by `names_to_assign` when it is not empty, and returns their
    /// names (§2, §9). A line or port the device lacks is refused here, not at Start (§1: -200170).
    pub fn add_digital_channels(&mut self, task: TaskId, lines: &str, names_to_assign: &str, grouping: LineGrouping, direction: Direction) -> Result<Vec<String>, DaqError> {
        let task_data = self.task(task)?;
        let kind = match direction {
            Direction::Input => ChannelKind::DigitalInput,
            Direction::Output => ChannelKind::DigitalOutput,
        };
        Self::check_kind_joins(task_data, kind, lines)?;
        let items = lines.split(',').filter(|item| !item.trim().is_empty()).map(|item| self.lines_of_item(item.trim(), task_data)).collect::<Result<Vec<_>, _>>()?;
        if items.is_empty() {
            // UNVERIFIED: an empty list of lines was not measured.
            return Err(channel_error(task_data, codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST, lines));
        }
        let mut channels = group_lines(items, grouping, direction).map_err(|code| channel_error(task_data, code, lines))?;
        let names = assign_names(channels.iter().map(|channel| channel.name.clone()).collect(), names_to_assign);
        for (channel, name) in channels.iter_mut().zip(&names) {
            channel.name = name.clone();
        }
        if channels.iter().any(|channel| already_in_task(task_data, channel)) {
            return Err(channel_error(task_data, codes::CHANNEL_ALREADY_IN_TASK, lines));
        }
        self.task_mut(task)?.digital.extend(channels);
        Ok(names)
    }

    /// The lines one item of the list names, checked against its device.
    fn lines_of_item(&self, item: &str, task_data: &Task) -> Result<ItemLines, DaqError> {
        let missing = || channel_error(task_data, codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST, item);
        let parsed = parse_item(item).ok_or_else(missing)?;
        let Some((device, profile)) = self.devices.find(parsed.device) else {
            let details = ErrorDetails { task_name: Some(task_data.name.clone()), device: Some(parsed.device.to_string()), suggested_devices: self.devices.names(), ..Default::default() };
            return Err(DaqError::new(codes::DEVICE_NOT_VALID, details));
        };
        let profile = &profile.digital;
        let port_name = |port: usize| format!("{}/{}{port}", parsed.device, parsed.port_word);
        let line_of = |port: usize, line: usize, line_word: &str| (Line { device: device.to_string(), port, line }, format!("{}/{line_word}{line}", port_name(port)));
        let Some((line_word, line_numbers)) = parsed.lines else {
            let mut lines = Vec::new();
            for &port in &parsed.ports {
                let count = profile.lines_per_port.get(port).copied().ok_or_else(missing)?;
                lines.extend((0..count).map(|line| line_of(port, line, "line")));
            }
            return Ok(ItemLines { lines, whole_port: Some(port_name(parsed.ports[0])) });
        };
        // UNVERIFIED: lines of a range of ports (`port0:1/line0`) were not measured; they are taken as missing.
        let [port] = parsed.ports[..] else { return Err(missing()) };
        if line_numbers.iter().any(|&line| !profile.has_line(port, line)) {
            return Err(missing());
        }
        Ok(ItemLines { lines: line_numbers.iter().map(|&line| line_of(port, line, line_word)).collect(), whole_port: None })
    }

    /// What Timing checks of a digital task: a device with a digital sample clock, and a rate it reaches (§8: Dev1 has
    /// none, -200077 for SampTimingType at Timing). The slowest rate a digital clock takes was not measured.
    pub(crate) fn check_digital_rate(&self, task_data: &Task, rate: f64) -> Result<(), DaqError> {
        for profile in self.digital_profiles(task_data) {
            let Some(maximum_rate) = profile.max_rate else {
                let details = ErrorDetails { task_name: Some(task_data.name.clone()), property: Some("SampTimingType"), requested_name: Some("Sample Clock"), possible_names: Some("On Demand"), ..Default::default() };
                return Err(DaqError::new(codes::UNSUPPORTED_PROPERTY_VALUE, details));
            };
            if !(rate > 0.0 && rate <= maximum_rate) {
                let details = ErrorDetails { task_name: Some(task_data.name.clone()), property: Some("SampClk.Rate"), requested: Some(rate), maximum: Some(maximum_rate), ..Default::default() };
                return Err(DaqError::new(codes::UNSUPPORTED_PROPERTY_VALUE, details));
            }
        }
        Ok(())
    }

    /// What Start checks of a digital task (§7, §5, §8): lines of one device, none held by another task that was
    /// started, and something written before a timed output starts.
    pub(crate) fn check_digital_can_start(&self, task_data: &Task) -> Result<(), DaqError> {
        let mut lines = task_data.digital.iter().flat_map(|channel| &channel.lines);
        if let Some(first) = lines.next()
            && lines.any(|line| line.device != first.device)
        {
            return Err(Self::task_error(task_data, codes::MULTIDEVICE_TASK_NOT_SUPPORTED));
        }
        if let Some(held) = self.line_held_elsewhere(task_data) {
            let details = ErrorDetails { task_name: Some(task_data.name.clone()), device: Some(held.device.clone()), channel: Some(format!("port{}/line{}", held.port, held.line)), ..Default::default() };
            return Err(DaqError::new(codes::LINES_RESERVED, details));
        }
        let timed_output = task_data.timing.is_some() && task_data.digital.iter().any(|channel| channel.direction == Direction::Output);
        // Measured on Dev2, the only simulated device with a digital clock: -200462 at Start before any Write.
        if timed_output && !task_data.output.has_data {
            return Err(Self::task_error(task_data, codes::OUTPUT_BUFFER_EMPTY));
        }
        Ok(())
    }

    /// A line of the task that another task, started by Start, holds (§5: per line, not per port; freed by Stop or Clear).
    fn line_held_elsewhere<'a>(&'a self, task_data: &'a Task) -> Option<&'a Line> {
        let held_by_others: Vec<&Line> = self
            .tasks()
            .filter(|other| !std::ptr::eq(*other, task_data) && other.holds_lines && other.started_at.is_some())
            .flat_map(|other| other.digital.iter().flat_map(|channel| &channel.lines))
            .collect();
        task_data.digital.iter().flat_map(|channel| &channel.lines).find(|line| held_by_others.contains(line))
    }

    fn digital_profiles<'a>(&'a self, task_data: &'a Task) -> impl Iterator<Item = &'a DigitalProfile> {
        task_data.digital.iter().flat_map(|channel| &channel.lines).filter_map(|line| self.devices.find(&line.device)).map(|(_, profile)| &profile.digital)
    }
}

/// An item split into its parts, as typed.
struct ParsedItem<'a> {
    device: &'a str,
    port_word: &'a str,
    ports: Vec<usize>,
    lines: Option<(&'a str, Vec<usize>)>,
}

/// `Dev1/port0`, `Dev1/port0:1` or `Dev1/port0/line3:0`; `None` for anything else (§2: `port0/line 0` is -200170).
fn parse_item(item: &str) -> Option<ParsedItem<'_>> {
    let mut parts = item.split('/');
    let (device, port_part, line_part) = (parts.next()?, parts.next()?, parts.next());
    if parts.next().is_some() {
        return None;
    }
    let (port_word, ports) = numbers_after(port_part, "port")?;
    let lines = match line_part {
        Some(line_part) => Some(numbers_after(line_part, "line")?),
        None => None,
    };
    Some(ParsedItem { device, port_word, ports, lines })
}

/// The word `prefix` as typed and the numbers after it, `N` or `N:M` in the order given (§2: `line3:0` is line3 first).
fn numbers_after<'a>(text: &'a str, prefix: &str) -> Option<(&'a str, Vec<usize>)> {
    let word = text.get(..prefix.len()).filter(|word| word.eq_ignore_ascii_case(prefix))?;
    let numbers = &text[prefix.len()..];
    let (first, last) = numbers.split_once(':').unwrap_or((numbers, numbers));
    let (first, last): (usize, usize) = (first.parse().ok()?, last.parse().ok()?);
    let range: Vec<usize> = if first <= last { (first..=last).collect() } else { (last..=first).rev().collect() };
    Some((word, range))
}

/// The channels the items make under the grouping (§2), or the code that refuses them.
fn group_lines(items: Vec<ItemLines>, grouping: LineGrouping, direction: Direction) -> Result<Vec<DigitalChannel>, i32> {
    let has_repeats = |lines: &[(Line, String)]| lines.iter().enumerate().any(|(index, (line, _))| lines[..index].iter().any(|(earlier, _)| earlier == line));
    if grouping == LineGrouping::OneChannelForEachLine {
        if items.iter().any(|item| item.whole_port.is_some()) {
            return Err(codes::PORT_NEEDS_ONE_CHANNEL);
        }
        let lines: Vec<(Line, String)> = items.into_iter().flat_map(|item| item.lines).collect();
        if has_repeats(&lines) {
            return Err(codes::CHANNEL_ALREADY_IN_TASK);
        }
        return Ok(lines.into_iter().map(|(line, name)| DigitalChannel { name, direction, lines: vec![line] }).collect());
    }
    let name = grouped_name(&items);
    let lines: Vec<(Line, String)> = items.into_iter().flat_map(|item| item.lines).collect();
    if has_repeats(&lines) {
        return Err(codes::LINE_TWICE_IN_DIGITAL_TASK);
    }
    Ok(vec![DigitalChannel { name, direction, lines: lines.into_iter().map(|(line, _)| line).collect() }])
}

/// The name of one channel of all the lines (§2): a single line's or a single whole port's own, otherwise the first one
/// followed by `...` (`Dev1/port0/line0...`, `Dev1/port0...`).
fn grouped_name(items: &[ItemLines]) -> String {
    let first = &items[0];
    let first_name = first.whole_port.clone().unwrap_or_else(|| first.lines[0].1.clone());
    let line_count: usize = items.iter().map(|item| item.lines.len()).sum();
    let one_whole_port = items.len() == 1 && first.whole_port.is_some() && first.lines.iter().all(|(line, _)| line.port == first.lines[0].0.port);
    if one_whole_port || line_count == 1 { first_name } else { format!("{first_name}...") }
}

/// The names the channels take from "name to assign" (§9): one for each channel in order, and the last name, when
/// channels remain, numbered for each of them from 0 (`myLine` over two lines is `myLine0, myLine1`; `a,b` over three
/// is `a, b0, b1`; extra names are ignored). The rule is inferred from those cases.
fn assign_names(physical_names: Vec<String>, names_to_assign: &str) -> Vec<String> {
    let given: Vec<&str> = names_to_assign.split(',').map(str::trim).filter(|name| !name.is_empty()).collect();
    if given.is_empty() {
        return physical_names;
    }
    let count = physical_names.len();
    let mut names = Vec::with_capacity(count);
    for (index, name) in given.iter().enumerate().take(count) {
        let remaining = count - index;
        if index == given.len() - 1 && remaining > 1 {
            names.extend((0..remaining).map(|number| format!("{name}{number}")));
        } else {
            names.push((*name).to_string());
        }
    }
    names
}

/// Whether a channel's name or one of its lines is already in the task (§2: a second Create of the same line, or a
/// duplicate name, is -200489).
fn already_in_task(task_data: &Task, channel: &DigitalChannel) -> bool {
    task_data.digital.iter().any(|present| present.name.eq_ignore_ascii_case(&channel.name) || present.lines.iter().any(|line| channel.lines.contains(line)))
}

fn channel_error(task_data: &Task, code: i32, channel: &str) -> DaqError {
    DaqError::new(code, ErrorDetails { task_name: Some(task_data.name.clone()), channel: Some(channel.trim().to_string()), ..Default::default() })
}
