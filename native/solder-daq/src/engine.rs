//! The engine: tasks with their channels, timing and state, over simulated devices (DT-087). The analog inputs are in
//! [`crate::input`], the analog outputs in [`crate::output`], the digital lines in [`crate::digital`] and
//! [`crate::digital_io`]; this module holds what every task has.
//!
//! What it does was measured in LabVIEW with DAQmx and simulated devices (`labview-captures/reports/2026-11-06-daqmx-*.md`,
//! `2026-11-15-daqmx-ao.md`): a channel's range is checked at Start, a rate at Timing, a finite task ends after its
//! samples at its rate. Time comes from an injected [`Clock`], so a wait is exact and instant in a test.
//!
//! A wait happens outside the engine; whoever shares the engine between threads must not hold a lock for it. The
//! facade is where that is arranged.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use crate::clock::Clock;
use crate::device::DeviceTable;
use crate::digital::{DigitalChannel, Direction};
use crate::error::{codes, DaqError, ErrorDetails};
use crate::input::AnalogInput;
use crate::output::{AnalogOutput, OutputState};
use crate::trigger::StartTrigger;

/// A task's handle, as `taskID` travels in `nilvaiu.dll`'s functions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TaskId(pub u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SampleMode {
    FiniteSamples,
    ContinuousSamples,
}

/// How many samples per channel a read asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SamplesRequested {
    /// Whatever the acquisition holds now (DAQmx's -1); it never waits.
    Available,
    Count(usize),
}

/// A wait the caller must make on the engine's clock before the outcome holds: the engine does not wait itself, so
/// that whoever shares it between threads can wait without holding it.
#[derive(Debug)]
pub struct Wait<T> {
    pub duration: Duration,
    pub outcome: Result<T, DaqError>,
}

impl<T> Wait<T> {
    pub(crate) fn none(outcome: Result<T, DaqError>) -> Self {
        Self { duration: Duration::ZERO, outcome }
    }
}

pub(crate) struct Timing {
    pub(crate) rate: f64,
    pub(crate) mode: SampleMode,
    pub(crate) samples_per_channel: u64,
}

pub(crate) struct Task {
    pub(crate) name: String,
    pub(crate) inputs: Vec<AnalogInput>,
    pub(crate) outputs: Vec<AnalogOutput>,
    pub(crate) timing: Option<Timing>,
    /// When it was started, on the clock; `None` while it is not running.
    pub(crate) started_at: Option<Duration>,
    /// Samples per channel already read since it was started.
    pub(crate) consumed: u64,
    pub(crate) output: OutputState,
    pub(crate) digital: Vec<DigitalChannel>,
    /// Whether it was started by Start itself, which is what holds its digital lines against other tasks (measured: a
    /// read or write that starts a task for itself holds nothing, `2026-11-15-daqmx-dio.md` §5).
    pub(crate) holds_lines: bool,
    /// The simulated digital value's counter: one more for each sample read, whatever else the task does (§4).
    pub(crate) digital_counter: u64,
    pub(crate) start_trigger: Option<StartTrigger>,
}

/// The kind of every channel of a task: DAQmx keeps one kind to a task (measured: -200559 for any two).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ChannelKind {
    AnalogInput,
    AnalogOutput,
    DigitalInput,
    DigitalOutput,
}

impl Task {
    pub(crate) fn has_channels(&self) -> bool {
        self.kind().is_some()
    }

    /// The kind of its channels, `None` while it has none.
    pub(crate) fn kind(&self) -> Option<ChannelKind> {
        if !self.inputs.is_empty() {
            return Some(ChannelKind::AnalogInput);
        }
        if !self.outputs.is_empty() {
            return Some(ChannelKind::AnalogOutput);
        }
        self.digital.first().map(|channel| match channel.direction {
            Direction::Input => ChannelKind::DigitalInput,
            Direction::Output => ChannelKind::DigitalOutput,
        })
    }

    /// The device of its first channel, by its canonical name.
    pub(crate) fn first_device(&self) -> Option<&str> {
        let digital = self.digital.first().and_then(|channel| channel.lines.first()).map(|line| line.device.as_str());
        self.analog_devices().next().or(digital)
    }

    /// The devices of every analog channel, inputs first.
    fn analog_devices(&self) -> impl Iterator<Item = &str> {
        self.inputs.iter().map(|channel| channel.device.as_str()).chain(self.outputs.iter().map(|channel| channel.device.as_str()))
    }
}

pub struct Engine {
    pub(crate) devices: DeviceTable,
    pub(crate) clock: Arc<dyn Clock>,
    tasks: HashMap<u32, Task>,
    next_task_id: u32,
    unnamed_tasks: u32,
}

impl Engine {
    pub fn new(devices: DeviceTable, clock: Arc<dyn Clock>) -> Self {
        Self { devices, clock, tasks: HashMap::new(), next_task_id: 1, unnamed_tasks: 0 }
    }

    /// A new task. An empty name is replaced by `_unnamedTask<n>`, n counting the unnamed tasks (measured).
    pub fn create_task(&mut self, name: &str) -> TaskId {
        let name = if name.is_empty() {
            self.unnamed_tasks += 1;
            format!("_unnamedTask<{}>", self.unnamed_tasks)
        } else {
            name.to_string()
        };
        let id = self.next_task_id;
        self.next_task_id += 1;
        let task = Task { name, inputs: Vec::new(), outputs: Vec::new(), timing: None, started_at: None, consumed: 0, output: OutputState::default(), digital: Vec::new(), holds_lines: false, digital_counter: 0, start_trigger: None };
        self.tasks.insert(id, task);
        TaskId(id)
    }

    pub fn task_name(&self, task: TaskId) -> Option<String> {
        self.tasks.get(&task.0).map(|task| task.name.clone())
    }

    /// Sets the sample clock. The rate is checked here, against the slowest-limited device of the task (measured:
    /// -200077 at Timing for 1 MHz on an input). A rate below the minimum is refused the same way; that case was not
    /// measured. An output task is held to its devices' input rates (UNVERIFIED: the outputs' own limits were not
    /// measured). A digital task is held to its devices' digital clocks.
    pub fn configure_sample_clock(&mut self, task: TaskId, rate: f64, mode: SampleMode, samples_per_channel: u64) -> Result<(), DaqError> {
        let task_data = self.task(task)?;
        if !task_data.digital.is_empty() {
            self.check_digital_rate(task_data, rate)?;
            self.task_mut(task)?.timing = Some(Timing { rate, mode, samples_per_channel });
            return Ok(());
        }
        let limits = task_data.analog_devices().filter_map(|device| self.devices.find(device)).map(|(_, profile)| (profile.ai_min_rate, profile.ai_max_rate)).reduce(|(minimum, maximum), (other_minimum, other_maximum)| (minimum.max(other_minimum), maximum.min(other_maximum)));
        let Some((minimum_rate, maximum_rate)) = limits else {
            return Err(Self::task_error(task_data, codes::TASK_HAS_NO_CHANNELS));
        };
        if !(minimum_rate..=maximum_rate).contains(&rate) {
            return Err(DaqError::new(
                codes::UNSUPPORTED_PROPERTY_VALUE,
                ErrorDetails { task_name: Some(task_data.name.clone()), property: Some("SampClk.Rate"), requested: Some(rate), maximum: Some(maximum_rate), minimum: Some(minimum_rate), ..Default::default() },
            ));
        }
        self.task_mut(task)?.timing = Some(Timing { rate, mode, samples_per_channel });
        Ok(())
    }

    /// Starts the task, after checking what DAQmx checks at Start (measured): that it is not running, that it has
    /// channels, and each channel's range. A task started here holds its digital lines until it stops.
    pub fn start(&mut self, task: TaskId) -> Result<(), DaqError> {
        self.begin(task)?;
        self.task_mut(task)?.holds_lines = true;
        Ok(())
    }

    /// Starts the task for a read or a write that needs it running, holding no lines.
    pub(crate) fn begin(&mut self, task: TaskId) -> Result<(), DaqError> {
        let now = self.clock.now();
        let task_data = self.task(task)?;
        if task_data.started_at.is_some() {
            return Err(Self::task_error(task_data, codes::TASK_ALREADY_RUNNING));
        }
        self.check_can_start(task_data)?;
        let task_data = self.task_mut(task)?;
        task_data.started_at = Some(now);
        task_data.consumed = 0;
        Ok(())
    }

    /// What Start checks, also checked by a write that starts a task only for itself.
    pub(crate) fn check_can_start(&self, task_data: &Task) -> Result<(), DaqError> {
        // Measured (`labview-captures/reports/2026-11-13-daq-create-task.md`): Start on a task with no channels.
        if !task_data.has_channels() {
            return Err(Self::task_error(task_data, codes::TASK_HAS_NO_CHANNELS));
        }
        self.check_input_ranges(task_data)?;
        self.check_outputs_can_start(task_data)?;
        self.check_digital_can_start(task_data)?;
        self.check_start_trigger(task_data)
    }

    /// Stops it. Stopping a task that was never started is not an error (measured).
    pub fn stop(&mut self, task: TaskId) -> Result<(), DaqError> {
        let task_data = self.task_mut(task)?;
        let was_continuous = task_data.started_at.is_some() && task_data.timing.as_ref().is_some_and(|timing| timing.mode == SampleMode::ContinuousSamples);
        if was_continuous && !task_data.outputs.is_empty() {
            task_data.output.stopped_after_continuous_run = true;
        }
        task_data.started_at = None;
        task_data.holds_lines = false;
        Ok(())
    }

    /// Releases it. Clearing a task twice is not an error (measured).
    pub fn clear(&mut self, task: TaskId) -> Result<(), DaqError> {
        self.tasks.remove(&task.0);
        Ok(())
    }

    /// Waits for a finite task to end: `samples / rate` after it started, whatever an output task was given (measured:
    /// 50 values written for 100 still end after 100 samples' time). A continuous one never ends, so it times out
    /// (measured: -200560 after the timeout). `None` is no timeout; for a continuous task that would wait for ever, so
    /// it fails at once instead (UNVERIFIED: DAQmx would hang).
    pub fn wait_until_done(&mut self, task: TaskId, timeout: Option<Duration>) -> Result<(), DaqError> {
        let wait = self.prepare_wait_until_done(task, timeout)?;
        self.clock.wait(wait.duration);
        wait.outcome
    }

    /// What [`Engine::wait_until_done`] waits for, without waiting: whoever shares the engine waits without holding it.
    pub fn prepare_wait_until_done(&self, task: TaskId, timeout: Option<Duration>) -> Result<Wait<()>, DaqError> {
        let task_data = self.task(task)?;
        let (Some(_), Some(timing)) = (task_data.started_at, &task_data.timing) else {
            return Ok(Wait::none(Ok(()))); // nothing is running, so there is nothing to wait for (UNVERIFIED)
        };
        let timed_out = || Err(Self::task_error(task_data, codes::WAIT_TIMED_OUT));
        if timing.mode == SampleMode::ContinuousSamples {
            return Ok(match timeout {
                Some(timeout) => Wait { duration: timeout, outcome: timed_out() },
                None => Wait::none(timed_out()),
            });
        }
        let remaining = self.finite_end(task_data).unwrap_or_default().saturating_sub(self.clock.now());
        Ok(match timeout {
            Some(timeout) if timeout < remaining => Wait { duration: timeout, outcome: timed_out() },
            _ => Wait { duration: remaining, outcome: Ok(()) },
        })
    }

    /// When a running finite task ends, on the clock.
    pub(crate) fn finite_end(&self, task_data: &Task) -> Option<Duration> {
        let (started_at, timing) = (task_data.started_at?, task_data.timing.as_ref()?);
        (timing.mode == SampleMode::FiniteSamples).then(|| started_at + Duration::from_secs_f64(timing.samples_per_channel as f64 / timing.rate))
    }

    /// The clock the engine runs on, for whoever waits outside it.
    pub fn clock(&self) -> Arc<dyn Clock> {
        Arc::clone(&self.clock)
    }

    /// Whether channels of `kind` may join the task: only to one with none, or with channels of the same kind (measured:
    /// -200559 at the second Create, which names the channels it was given).
    pub(crate) fn check_kind_joins(task_data: &Task, kind: ChannelKind, channels: &str) -> Result<(), DaqError> {
        match task_data.kind() {
            Some(present) if present != kind => {
                Err(DaqError::new(codes::CHANNEL_TYPE_MIXED, ErrorDetails { task_name: Some(task_data.name.clone()), channel: Some(channels.trim().to_string()), ..Default::default() }))
            }
            _ => Ok(()),
        }
    }

    pub(crate) fn task_error(task_data: &Task, code: i32) -> DaqError {
        DaqError::new(code, ErrorDetails { task_name: Some(task_data.name.clone()), ..Default::default() })
    }

    pub(crate) fn tasks(&self) -> impl Iterator<Item = &Task> {
        self.tasks.values()
    }

    pub(crate) fn task(&self, task: TaskId) -> Result<&Task, DaqError> {
        self.tasks.get(&task.0).ok_or_else(|| DaqError::bare(codes::INVALID_TASK))
    }

    pub(crate) fn task_mut(&mut self, task: TaskId) -> Result<&mut Task, DaqError> {
        self.tasks.get_mut(&task.0).ok_or_else(|| DaqError::bare(codes::INVALID_TASK))
    }
}

/// `Dev1/ai3` or `Dev1/ao0:2`, split into the device as typed, and the first and last line of the kind `prefix`.
pub(crate) fn parse_channel_item<'a>(item: &'a str, prefix: &str) -> Option<(&'a str, usize, usize)> {
    let (device, lines) = item.trim().split_once('/')?;
    let lines = lines.trim();
    let numbers = lines.get(..prefix.len()).filter(|typed| typed.eq_ignore_ascii_case(prefix)).map(|_| &lines[prefix.len()..])?;
    let (first, last) = numbers.split_once(':').unwrap_or((numbers, numbers));
    let (first, last): (usize, usize) = (first.trim().parse().ok()?, last.trim().parse().ok()?);
    // Measured: `Dev1/ao1:0` is the two channels, as `ao0:1`.
    Some((device.trim(), first.min(last), first.max(last)))
}
