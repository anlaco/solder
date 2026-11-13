//! The engine: tasks with their channels, timing and state, over simulated analog inputs (DT-087, slice 1).
//!
//! What it does was measured in LabVIEW with DAQmx and a simulated device (`labview-captures/reports/2026-11-06-daqmx-*.md`):
//! a channel's range is checked at Start, a rate at Timing, a finite acquisition gives one cycle of the signal and a
//! read of more than it holds returns what it holds with no wait, a continuous one waits for the samples. Time comes
//! from an injected [`Clock`], so a wait is exact and instant in a test.
//!
//! A read waits inside the engine; whoever shares the engine between threads must not hold a lock for that wait. The
//! facade is where that is arranged.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use crate::clock::Clock;
use crate::device::DeviceTable;
use crate::error::{codes, DaqError, ErrorDetails};
use crate::signal::{self, CONTINUOUS_PERIOD_SAMPLES};

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
    fn none(outcome: Result<T, DaqError>) -> Self {
        Self { duration: Duration::ZERO, outcome }
    }
}

struct AnalogInput {
    name: String,
    device: String,
    index: usize,
    minimum: f64,
    maximum: f64,
}

struct Timing {
    rate: f64,
    mode: SampleMode,
    samples_per_channel: u64,
}

struct Task {
    name: String,
    channels: Vec<AnalogInput>,
    timing: Option<Timing>,
    /// When it was started, on the clock; `None` while it is not running.
    started_at: Option<Duration>,
    /// Samples per channel already read since it was started.
    consumed: u64,
}

pub struct Engine {
    devices: DeviceTable,
    clock: Arc<dyn Clock>,
    tasks: HashMap<u32, Task>,
    next_task_id: u32,
    unnamed_tasks: u32,
}

/// `Dev1/ai3` or `Dev1/ai0:2`, split into the device as typed, and the first and last line.
fn parse_channel_item(item: &str) -> Option<(&str, usize, usize)> {
    let (device, lines) = item.trim().split_once('/')?;
    let numbers = lines.trim().get(..2).filter(|prefix| prefix.eq_ignore_ascii_case("ai")).map(|_| &lines.trim()[2..])?;
    let (first, last) = match numbers.split_once(':') {
        Some((first, last)) => (first, last),
        None => (numbers, numbers),
    };
    Some((device.trim(), first.trim().parse().ok()?, last.trim().parse().ok()?))
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
        self.tasks.insert(id, Task { name, channels: Vec::new(), timing: None, started_at: None, consumed: 0 });
        TaskId(id)
    }

    pub fn task_name(&self, task: TaskId) -> Option<String> {
        self.tasks.get(&task.0).map(|task| task.name.clone())
    }

    /// Adds voltage inputs to a task, named as DAQmx names them (`Dev1/ai0`), and returns their names. The range is
    /// not checked here: LabVIEW checks it at Start (measured).
    pub fn add_ai_voltage_channels(&mut self, task: TaskId, physical_channels: &str, minimum: f64, maximum: f64) -> Result<Vec<String>, DaqError> {
        let task_name = self.task(task)?.name.clone();
        let with_task = |mut details: ErrorDetails| {
            details.task_name = Some(task_name.clone());
            details
        };

        let mut added = Vec::new();
        for item in physical_channels.split(',').filter(|item| !item.trim().is_empty()) {
            let Some((device_typed, first, last)) = parse_channel_item(item) else {
                // UNVERIFIED: a channel written in no form DAQmx knows; LabVIEW's code for it was not measured.
                return Err(DaqError::new(codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST, with_task(ErrorDetails { channel: Some(item.trim().to_string()), ..Default::default() })));
            };
            let Some((device, profile)) = self.devices.find(device_typed) else {
                return Err(DaqError::new(codes::DEVICE_NOT_VALID, with_task(ErrorDetails { device: Some(device_typed.to_string()), suggested_devices: self.devices.names(), ..Default::default() })));
            };
            for index in first..=last {
                let name = format!("{device}/ai{index}");
                if index >= profile.ai_channel_count {
                    return Err(DaqError::new(codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST, with_task(ErrorDetails { device: Some(device.to_string()), channel: Some(name), ..Default::default() })));
                }
                added.push(AnalogInput { name, device: device.to_string(), index, minimum, maximum });
            }
        }
        let names = added.iter().map(|channel| channel.name.clone()).collect();
        self.task_mut(task)?.channels.extend(added);
        Ok(names)
    }

    /// Sets the sample clock. The rate is checked here, against the slowest-limited device of the task (measured:
    /// -200077 at Timing for 1 MHz). A rate below the minimum is refused the same way; that case was not measured.
    pub fn configure_sample_clock(&mut self, task: TaskId, rate: f64, mode: SampleMode, samples_per_channel: u64) -> Result<(), DaqError> {
        let task_data = self.task(task)?;
        let limits = task_data.channels.iter().filter_map(|channel| self.devices.find(&channel.device)).map(|(_, profile)| (profile.ai_min_rate, profile.ai_max_rate)).reduce(|(minimum, maximum), (other_minimum, other_maximum)| (minimum.max(other_minimum), maximum.min(other_maximum)));
        let Some((minimum_rate, maximum_rate)) = limits else {
            return Err(DaqError::new(codes::TASK_HAS_NO_CHANNELS, ErrorDetails { task_name: Some(task_data.name.clone()), ..Default::default() }));
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

    /// Starts the acquisition. Each channel's range is checked now (measured: +-20 V is -200077 here, not at Create).
    pub fn start(&mut self, task: TaskId) -> Result<(), DaqError> {
        let now = self.clock.now();
        let task_data = self.task(task)?;
        if task_data.started_at.is_some() {
            return Err(Self::task_error(task_data, codes::TASK_ALREADY_RUNNING));
        }
        // Measured (`labview-captures/reports/2026-11-13-daq-create-task.md`): Start on a task with no channels.
        if task_data.channels.is_empty() {
            return Err(Self::task_error(task_data, codes::TASK_HAS_NO_CHANNELS));
        }
        for channel in &task_data.channels {
            let Some((_, profile)) = self.devices.find(&channel.device) else { continue };
            let outside = |requested: f64, property: &'static str| {
                Some(DaqError::new(
                    codes::UNSUPPORTED_PROPERTY_VALUE,
                    ErrorDetails { task_name: Some(task_data.name.clone()), channel: Some(channel.name.clone()), property: Some(property), requested: Some(requested), minimum: Some(profile.ai_min_volts), maximum: Some(profile.ai_max_volts), ..Default::default() },
                ))
            };
            if let Some(error) = (channel.minimum < profile.ai_min_volts).then(|| outside(channel.minimum, "AI.Min")).flatten() {
                return Err(error);
            }
            if let Some(error) = (channel.maximum > profile.ai_max_volts).then(|| outside(channel.maximum, "AI.Max")).flatten() {
                return Err(error);
            }
        }
        let task_data = self.task_mut(task)?;
        task_data.started_at = Some(now);
        task_data.consumed = 0;
        Ok(())
    }

    /// Stops it. Stopping a task that was never started is not an error (measured).
    pub fn stop(&mut self, task: TaskId) -> Result<(), DaqError> {
        self.task_mut(task)?.started_at = None;
        Ok(())
    }

    /// Releases it. Clearing a task twice is not an error (measured).
    pub fn clear(&mut self, task: TaskId) -> Result<(), DaqError> {
        self.tasks.remove(&task.0);
        Ok(())
    }

    /// Waits for a finite acquisition to end: `samples / rate` after it started. A continuous one never ends, so it
    /// times out (measured: -200560 after the timeout). `None` is no timeout; for a continuous task that would wait
    /// for ever, so it fails at once instead (UNVERIFIED: DAQmx would hang).
    pub fn wait_until_done(&mut self, task: TaskId, timeout: Option<Duration>) -> Result<(), DaqError> {
        let wait = self.prepare_wait_until_done(task, timeout)?;
        self.clock.wait(wait.duration);
        wait.outcome
    }

    /// What [`Engine::wait_until_done`] waits for, without waiting: whoever shares the engine waits without holding it.
    pub fn prepare_wait_until_done(&self, task: TaskId, timeout: Option<Duration>) -> Result<Wait<()>, DaqError> {
        let task_data = self.task(task)?;
        let (Some(started_at), Some(timing)) = (task_data.started_at, &task_data.timing) else {
            return Ok(Wait::none(Ok(()))); // nothing is running, so there is nothing to wait for (UNVERIFIED)
        };
        let timed_out = || Err(DaqError::new(codes::WAIT_TIMED_OUT, ErrorDetails { task_name: Some(task_data.name.clone()), ..Default::default() }));
        if timing.mode == SampleMode::ContinuousSamples {
            return Ok(match timeout {
                Some(timeout) => Wait { duration: timeout, outcome: timed_out() },
                None => Wait::none(timed_out()),
            });
        }
        let done_at = started_at + Duration::from_secs_f64(timing.samples_per_channel as f64 / timing.rate);
        let remaining = done_at.saturating_sub(self.clock.now());
        Ok(match timeout {
            Some(timeout) if timeout < remaining => Wait { duration: timeout, outcome: timed_out() },
            _ => Wait { duration: remaining, outcome: Ok(()) },
        })
    }

    /// Reads samples of every channel, as `[channel][sample]`. A task that is not running is started first (measured:
    /// a read with no Start works). `timeout` of `None` is no timeout.
    pub fn read_f64(&mut self, task: TaskId, requested: SamplesRequested, timeout: Option<Duration>) -> Result<Vec<Vec<f64>>, DaqError> {
        let wait = self.prepare_read(task, requested, timeout)?;
        self.clock.wait(wait.duration);
        wait.outcome?;
        self.take_samples(task, requested)
    }

    /// How long a read must wait before [`Engine::take_samples`] can give what it asks for, starting the task if it is
    /// not running; a read that would wait longer than its timeout waits the timeout and then fails.
    pub fn prepare_read(&mut self, task: TaskId, requested: SamplesRequested, timeout: Option<Duration>) -> Result<Wait<()>, DaqError> {
        if self.task(task)?.started_at.is_none() {
            self.start(task)?;
        }
        let task_data = self.task(task)?;
        let still_needed = match (&task_data.timing, requested) {
            (Some(timing), SamplesRequested::Count(wanted)) if timing.mode == SampleMode::ContinuousSamples => {
                let available = self.acquired(task_data, timing).saturating_sub(task_data.consumed);
                Duration::from_secs_f64((wanted as u64).saturating_sub(available) as f64 / timing.rate)
            }
            // A finite task, no timing or "whatever is there" never wait (measured).
            _ => Duration::ZERO,
        };
        Ok(match timeout {
            Some(timeout) if timeout < still_needed => Wait { duration: timeout, outcome: Err(Self::task_error(task_data, codes::SAMPLES_NOT_YET_ACQUIRED)) },
            _ => Wait { duration: still_needed, outcome: Ok(()) },
        })
    }

    /// The samples a read asks for, once [`Engine::prepare_read`]'s wait is over.
    pub fn take_samples(&mut self, task: TaskId, requested: SamplesRequested) -> Result<Vec<Vec<f64>>, DaqError> {
        let task_data = self.task(task)?;
        let (count, period) = match &task_data.timing {
            // No timing: one sample, on demand (measured: no Timing and no Start give one value, with no error).
            None => (1, CONTINUOUS_PERIOD_SAMPLES),
            Some(timing) if timing.mode == SampleMode::FiniteSamples => {
                let remaining = timing.samples_per_channel.saturating_sub(task_data.consumed);
                if remaining == 0 {
                    return Err(Self::task_error(task_data, codes::READ_BEYOND_FINAL_SAMPLE));
                }
                // Measured: a read of more than a finite task holds gives what it holds, with no error and no wait.
                let count = match requested {
                    SamplesRequested::Available => remaining,
                    SamplesRequested::Count(wanted) => (wanted as u64).min(remaining),
                };
                (count, timing.samples_per_channel)
            }
            Some(timing) => {
                let count = match requested {
                    SamplesRequested::Available => self.acquired(task_data, timing).saturating_sub(task_data.consumed),
                    SamplesRequested::Count(wanted) => wanted as u64,
                };
                (count, CONTINUOUS_PERIOD_SAMPLES)
            }
        };

        let first = task_data.consumed;
        let data = task_data
            .channels
            .iter()
            .map(|channel| {
                let seed = signal::channel_seed(&channel.device, channel.index);
                (0..count).map(|offset| signal::sample(seed, first + offset, period)).collect()
            })
            .collect();
        self.task_mut(task)?.consumed += count;
        Ok(data)
    }

    /// The clock the engine runs on, for whoever waits outside it.
    pub fn clock(&self) -> Arc<dyn Clock> {
        Arc::clone(&self.clock)
    }

    /// Samples per channel acquired since a running task started; the small addition keeps a whole number of samples
    /// from rounding down to one less.
    fn acquired(&self, task_data: &Task, timing: &Timing) -> u64 {
        let started_at = task_data.started_at.expect("only a running task has acquired samples");
        ((self.clock.now() - started_at).as_secs_f64() * timing.rate + 1e-6).floor() as u64
    }

    fn task_error(task_data: &Task, code: i32) -> DaqError {
        DaqError::new(code, ErrorDetails { task_name: Some(task_data.name.clone()), ..Default::default() })
    }

    fn task(&self, task: TaskId) -> Result<&Task, DaqError> {
        self.tasks.get(&task.0).ok_or_else(|| DaqError::bare(codes::INVALID_TASK))
    }

    fn task_mut(&mut self, task: TaskId) -> Result<&mut Task, DaqError> {
        self.tasks.get_mut(&task.0).ok_or_else(|| DaqError::bare(codes::INVALID_TASK))
    }
}
