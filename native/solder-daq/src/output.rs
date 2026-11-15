//! The analog outputs of a task: adding voltage channels and writing them (DT-087). Every rule here was measured in
//! LabVIEW with DAQmx on the two simulated devices (`labview-captures/reports/2026-11-15-daqmx-ao.md`, §n below); a
//! simulated output goes nowhere, so the engine only keeps the last values written, for whoever wants to look.

use crate::device::{AnalogOutputProfile, OutputRangeRule};
use crate::engine::{ChannelKind, Engine, SampleMode, Task, TaskId};
use crate::error::{codes, DaqError, ErrorDetails};
use crate::input::missing_channel;

pub(crate) struct AnalogOutput {
    pub(crate) name: String,
    pub(crate) device: String,
    pub(crate) minimum: f64,
    pub(crate) maximum: f64,
}

/// What a task's outputs were given.
#[derive(Default)]
pub(crate) struct OutputState {
    /// The last values written, `[channel][sample]`.
    pub(crate) last_written: Vec<Vec<f64>>,
    /// Whether anything was ever written, which a timed start on some devices needs (§5).
    pub(crate) has_data: bool,
    /// A continuous generation that ran and was stopped takes no more writes (§6, measured through the C API).
    pub(crate) stopped_after_continuous_run: bool,
    /// The last value written to a digital line (a simulated line drives nothing, and reads never show it).
    pub(crate) last_line_written: Option<bool>,
}

/// What a write did: how many samples per channel it wrote, which DAQmx reports even beside an error (§4: 1 for a
/// single sample out of range), and its error.
#[derive(Debug, PartialEq)]
pub struct WriteOutcome {
    pub written: usize,
    pub result: Result<(), DaqError>,
}

impl WriteOutcome {
    pub(crate) fn failed(error: DaqError) -> Self {
        Self { written: 0, result: Err(error) }
    }
}

/// How a physical output channel is written: `Dev1/ao0`.
const OUTPUT_PREFIX: &str = "ao";

impl Engine {
    /// Adds voltage outputs to a task (`Dev1/ao0`, `Dev1/ao0:1`), and returns their names. A line the device lacks is
    /// refused here (§2); the range is not checked until Start (§2, §3). A task of another kind refuses them
    /// (`2026-11-15-daqmx-dio.md` §7: AI with AO is -200559).
    pub fn add_ao_voltage_channels(&mut self, task: TaskId, physical_channels: &str, minimum: f64, maximum: f64) -> Result<Vec<String>, DaqError> {
        let task_data = self.task(task)?;
        Self::check_kind_joins(task_data, ChannelKind::AnalogOutput, physical_channels)?;
        let task_name = task_data.name.clone();
        let mut added = Vec::new();
        for item in physical_channels.split(',').filter(|item| !item.trim().is_empty()) {
            let (device, first, last) = self.find_channel_device(item, OUTPUT_PREFIX, &task_name)?;
            let channel_count = self.devices.find(&device).map_or(0, |(_, profile)| profile.analog_output.channel_count);
            for index in first..=last {
                let name = format!("{device}/{OUTPUT_PREFIX}{index}");
                if index >= channel_count {
                    return Err(missing_channel(&device, name, &task_name));
                }
                added.push(AnalogOutput { name, device: device.clone(), minimum, maximum });
            }
        }
        let names = added.iter().map(|channel| channel.name.clone()).collect();
        self.task_mut(task)?.outputs.extend(added);
        Ok(names)
    }

    /// What Start checks of the outputs: a range with its minimum below its maximum (§2: -200082), inside the device's
    /// on a device that holds to it (§3: -200077), and something written before a timed start where the device needs
    /// it (§5: -200462 on Dev1).
    pub(crate) fn check_outputs_can_start(&self, task_data: &Task) -> Result<(), DaqError> {
        for channel in &task_data.outputs {
            let Some((_, profile)) = self.devices.find(&channel.device) else { continue };
            let profile = &profile.analog_output;
            if channel.minimum >= channel.maximum {
                return Err(channel_error(task_data, channel, codes::MINIMUM_NOT_BELOW_MAXIMUM));
            }
            if profile.range_rule == OutputRangeRule::WithinDevice {
                outside_device(task_data, channel, profile)?;
            }
            if task_data.timing.is_some() && profile.start_needs_data && !task_data.output.has_data {
                return Err(Engine::task_error(task_data, codes::OUTPUT_BUFFER_EMPTY));
            }
        }
        Ok(())
    }

    /// Writes `data`, a row of samples per output channel. With no timing the values go out at once and the task is
    /// left as it was (§4); with timing they fill the generation, which `auto_start` starts (§5, §6).
    pub fn write_f64(&mut self, task: TaskId, data: &[Vec<f64>], auto_start: bool) -> WriteOutcome {
        let task_data = match self.task(task) {
            Ok(task_data) => task_data,
            Err(error) => return WriteOutcome::failed(error),
        };
        if let Err(error) = self.check_writable(task_data, data) {
            return WriteOutcome::failed(error);
        }
        let samples = data.first().map_or(0, Vec::len);
        if samples == 0 {
            return WriteOutcome { written: 0, result: Ok(()) }; // §7: 0 x 0 is no error (whether it starts: UNVERIFIED)
        }
        if let Err(error) = self.check_values(task_data, data) {
            // §4: a single sample out of range still counts as written; a longer write out of range, UNVERIFIED.
            return WriteOutcome { written: usize::from(samples == 1), result: Err(error) };
        }
        if let Err(error) = self.check_state_for_write(task_data, auto_start) {
            return WriteOutcome::failed(error);
        }
        self.keep_written(task, data, auto_start)
    }

    /// The last values written to a task's outputs, `[channel][sample]`.
    pub fn last_written(&self, task: TaskId) -> Result<Vec<Vec<f64>>, DaqError> {
        Ok(self.task(task)?.output.last_written.clone())
    }

    /// A task with output channels, and a row of data for each (§8, §9, §7).
    fn check_writable(&self, task_data: &Task, data: &[Vec<f64>]) -> Result<(), DaqError> {
        if !task_data.has_channels() {
            return Err(Engine::task_error(task_data, codes::NO_DEVICES_IN_TASK));
        }
        match task_data.kind() {
            Some(ChannelKind::AnalogInput | ChannelKind::DigitalInput) => return Err(Engine::task_error(task_data, codes::NO_OUTPUT_CHANNELS)),
            // UNVERIFIED: measured the other way round, a digital write to an analog-output task (-200526).
            Some(ChannelKind::DigitalOutput) => return Err(Engine::task_error(task_data, codes::WRITE_TYPE_MISMATCH)),
            _ => {}
        }
        let all_empty = data.iter().all(Vec::is_empty);
        if data.len() != task_data.outputs.len() && !all_empty {
            let details = ErrorDetails { task_name: Some(task_data.name.clone()), channel_counts: Some((task_data.outputs.len(), data.len())), ..Default::default() };
            return Err(DaqError::new(codes::CHANNEL_COUNT_MISMATCH, details));
        }
        Ok(())
    }

    /// Every value within what its channel takes (§2, §3: -200561).
    fn check_values(&self, task_data: &Task, data: &[Vec<f64>]) -> Result<(), DaqError> {
        for (channel, values) in task_data.outputs.iter().zip(data) {
            let (minimum, maximum) = self.write_limits(channel);
            if let Some(value) = values.iter().copied().find(|value| !(minimum..=maximum).contains(value)) {
                let details = ErrorDetails { task_name: Some(task_data.name.clone()), channel: Some(channel.name.clone()), requested: Some(value), minimum: Some(channel.minimum), maximum: Some(channel.maximum), ..Default::default() };
                return Err(DaqError::new(codes::DATA_OUTSIDE_RANGE, details));
            }
        }
        Ok(())
    }

    /// The values a channel takes: its range joined with the device's on Dev1, its range alone on Dev2 (§2, §3).
    fn write_limits(&self, channel: &AnalogOutput) -> (f64, f64) {
        match self.devices.find(&channel.device) {
            Some((_, profile)) if profile.analog_output.range_rule == OutputRangeRule::UnionWithDevice => {
                (channel.minimum.min(profile.analog_output.min_volts), channel.maximum.max(profile.analog_output.max_volts))
            }
            _ => (channel.minimum, channel.maximum),
        }
    }

    /// Whether the task's state takes a write: an untimed one needs auto start or a Start (§4: -200846); a finite
    /// generation that ended, or a continuous one stopped, takes no more (§5, §6: -200288). An untimed write that starts
    /// the task for itself checks what Start checks (§3: -200077 at the Write).
    pub(crate) fn check_state_for_write(&self, task_data: &Task, auto_start: bool) -> Result<(), DaqError> {
        let running = task_data.started_at.is_some();
        let Some(timing) = &task_data.timing else {
            return match (running, auto_start) {
                (true, _) => Ok(()),
                (false, true) => self.check_can_start(task_data),
                (false, false) => Err(Engine::task_error(task_data, codes::WRITE_NEEDS_RUNNING_TASK)),
            };
        };
        let finite_ended = self.finite_end(task_data).is_some_and(|end| self.clock.now() >= end);
        let continuous_stopped = !running && timing.mode == SampleMode::ContinuousSamples && task_data.output.stopped_after_continuous_run;
        if finite_ended || continuous_stopped {
            return Err(Engine::task_error(task_data, codes::WRITE_BEYOND_FINAL_SAMPLE));
        }
        Ok(())
    }

    /// Keeps what was written, and starts a timed task that is not running when `auto_start` asks.
    fn keep_written(&mut self, task: TaskId, data: &[Vec<f64>], auto_start: bool) -> WriteOutcome {
        let Ok(task_data) = self.task_mut(task) else { return WriteOutcome::failed(DaqError::bare(codes::INVALID_TASK)) };
        task_data.output.last_written = data.to_vec();
        task_data.output.has_data = true;
        let starts = auto_start && task_data.timing.is_some() && task_data.started_at.is_none();
        let written = data.first().map_or(0, Vec::len);
        match if starts { self.begin(task) } else { Ok(()) } {
            Ok(()) => WriteOutcome { written, result: Ok(()) },
            Err(error) => WriteOutcome::failed(error),
        }
    }
}

/// An error about one output channel of a task.
fn channel_error(task_data: &Task, channel: &AnalogOutput, code: i32) -> DaqError {
    DaqError::new(code, ErrorDetails { task_name: Some(task_data.name.clone()), channel: Some(channel.name.clone()), minimum: Some(channel.minimum), maximum: Some(channel.maximum), ..Default::default() })
}

/// A channel's range outside its device's, as AO.Max or AO.Min (§3: "AO.Max requested 20, within -10..10").
fn outside_device(task_data: &Task, channel: &AnalogOutput, profile: &AnalogOutputProfile) -> Result<(), DaqError> {
    let refused = |requested: f64, property: &'static str| {
        let details = ErrorDetails { task_name: Some(task_data.name.clone()), channel: Some(channel.name.clone()), property: Some(property), requested: Some(requested), minimum: Some(profile.min_volts), maximum: Some(profile.max_volts), ..Default::default() };
        Err(DaqError::new(codes::UNSUPPORTED_PROPERTY_VALUE, details))
    };
    if channel.maximum > profile.max_volts {
        return refused(channel.maximum, "AO.Max");
    }
    if channel.minimum < profile.min_volts {
        return refused(channel.minimum, "AO.Min");
    }
    Ok(())
}
