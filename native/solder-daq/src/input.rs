//! The analog inputs of a task: adding voltage channels and reading them (DT-087, slice 1). Measured in LabVIEW with
//! DAQmx and a simulated device (`labview-captures/reports/2026-11-06-daqmx-*.md`): the range is checked at Start, a
//! finite acquisition gives one cycle of the signal and a read of more than it holds returns what it holds with no
//! wait, a continuous one waits for the samples.

use std::time::Duration;

use crate::engine::{parse_channel_item, ChannelKind, Engine, SampleMode, SamplesRequested, Task, TaskId, Timing, Wait};
use crate::error::{codes, DaqError, ErrorDetails};
use crate::signal::{self, CONTINUOUS_PERIOD_SAMPLES};

pub(crate) struct AnalogInput {
    pub(crate) name: String,
    pub(crate) device: String,
    pub(crate) index: usize,
    pub(crate) minimum: f64,
    pub(crate) maximum: f64,
}

/// How a physical input channel is written: `Dev1/ai0`.
const INPUT_PREFIX: &str = "ai";

impl Engine {
    /// Adds voltage inputs to a task, named as DAQmx names them (`Dev1/ai0`), and returns their names. The range is
    /// not checked here: LabVIEW checks it at Start (measured).
    pub fn add_ai_voltage_channels(&mut self, task: TaskId, physical_channels: &str, minimum: f64, maximum: f64) -> Result<Vec<String>, DaqError> {
        let task_data = self.task(task)?;
        Self::check_kind_joins(task_data, ChannelKind::AnalogInput, physical_channels)?;
        let task_name = task_data.name.clone();
        let mut added = Vec::new();
        for item in physical_channels.split(',').filter(|item| !item.trim().is_empty()) {
            let (device, first, last) = self.find_channel_device(item, INPUT_PREFIX, &task_name)?;
            let channel_count = self.devices.find(&device).map_or(0, |(_, profile)| profile.ai_channel_count);
            for index in first..=last {
                let name = format!("{device}/{INPUT_PREFIX}{index}");
                if index >= channel_count {
                    return Err(missing_channel(&device, name, &task_name));
                }
                added.push(AnalogInput { name, device: device.clone(), index, minimum, maximum });
            }
        }
        let names = added.iter().map(|channel| channel.name.clone()).collect();
        self.task_mut(task)?.inputs.extend(added);
        Ok(names)
    }

    /// The device of a channel item, by its canonical name, and the item's first and last line.
    pub(crate) fn find_channel_device(&self, item: &str, prefix: &str, task_name: &str) -> Result<(String, usize, usize), DaqError> {
        let with_task = |mut details: ErrorDetails| {
            details.task_name = Some(task_name.to_string());
            details
        };
        let Some((device_typed, first, last)) = parse_channel_item(item, prefix) else {
            // UNVERIFIED: a channel written in no form DAQmx knows; LabVIEW's code for it was not measured.
            return Err(DaqError::new(codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST, with_task(ErrorDetails { channel: Some(item.trim().to_string()), ..Default::default() })));
        };
        let Some((device, _)) = self.devices.find(device_typed) else {
            return Err(DaqError::new(codes::DEVICE_NOT_VALID, with_task(ErrorDetails { device: Some(device_typed.to_string()), suggested_devices: self.devices.names(), ..Default::default() })));
        };
        Ok((device.to_string(), first, last))
    }

    /// Each input's range against its device's (measured: +-20 V is -200077 at Start, not at Create).
    pub(crate) fn check_input_ranges(&self, task_data: &Task) -> Result<(), DaqError> {
        for channel in &task_data.inputs {
            let Some((_, profile)) = self.devices.find(&channel.device) else { continue };
            let outside = |requested: f64, property: &'static str| {
                DaqError::new(
                    codes::UNSUPPORTED_PROPERTY_VALUE,
                    ErrorDetails { task_name: Some(task_data.name.clone()), channel: Some(channel.name.clone()), property: Some(property), requested: Some(requested), minimum: Some(profile.ai_min_volts), maximum: Some(profile.ai_max_volts), ..Default::default() },
                )
            };
            if channel.minimum < profile.ai_min_volts {
                return Err(outside(channel.minimum, "AI.Min"));
            }
            if channel.maximum > profile.ai_max_volts {
                return Err(outside(channel.maximum, "AI.Max"));
            }
        }
        Ok(())
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
    /// not running; a read that would wait longer than its timeout waits the timeout and then fails. A task of outputs
    /// only has nothing to read (measured: -200460).
    pub fn prepare_read(&mut self, task: TaskId, requested: SamplesRequested, timeout: Option<Duration>) -> Result<Wait<()>, DaqError> {
        let task_data = self.task(task)?;
        match task_data.kind() {
            Some(ChannelKind::AnalogOutput) => return Err(Self::task_error(task_data, codes::NO_INPUT_CHANNELS)),
            // UNVERIFIED: measured the other way round, a digital read of an analog task (-200525).
            Some(ChannelKind::DigitalInput | ChannelKind::DigitalOutput) => return Err(Self::task_error(task_data, codes::READ_TYPE_MISMATCH)),
            _ => {}
        }
        self.begin_and_wait(task, requested, timeout)
    }

    /// Starts a task that is not running and says how long a read of `requested` must wait (shared with the digital
    /// reads of a timed task).
    pub(crate) fn begin_and_wait(&mut self, task: TaskId, requested: SamplesRequested, timeout: Option<Duration>) -> Result<Wait<()>, DaqError> {
        if self.task(task)?.started_at.is_none() {
            self.begin(task)?;
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
        let (count, period) = self.samples_to_take(task_data, requested)?;
        let first = task_data.consumed;
        let data = task_data
            .inputs
            .iter()
            .map(|channel| {
                let seed = signal::channel_seed(&channel.device, channel.index);
                (0..count).map(|offset| signal::sample(seed, first + offset, period)).collect()
            })
            .collect();
        self.task_mut(task)?.consumed += count;
        Ok(data)
    }

    /// How many samples per channel a read takes, and the period of the simulated signal they come from.
    pub(crate) fn samples_to_take(&self, task_data: &Task, requested: SamplesRequested) -> Result<(u64, u64), DaqError> {
        Ok(match &task_data.timing {
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
        })
    }

    /// Samples per channel acquired since a running task started; the small addition keeps a whole number of samples
    /// from rounding down to one less.
    fn acquired(&self, task_data: &Task, timing: &Timing) -> u64 {
        let started_at = task_data.started_at.expect("only a running task has acquired samples");
        ((self.clock.now() - started_at).as_secs_f64() * timing.rate + 1e-6).floor() as u64
    }
}

/// The error for a line its device does not have (measured: `Dev1/ai99`, `Dev1/ao2`).
pub(crate) fn missing_channel(device: &str, name: String, task_name: &str) -> DaqError {
    DaqError::new(codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST, ErrorDetails { device: Some(device.to_string()), channel: Some(name), task_name: Some(task_name.to_string()), ..Default::default() })
}
