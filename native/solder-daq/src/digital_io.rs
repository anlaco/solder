//! Reading and writing one sample of a task's digital channel (DT-087): DAQmx's Read (Digital Bool 1Line 1Point),
//! Read (Digital U32 1Chan 1Samp) and Write (Digital Bool 1Line 1Point). Measured in LabVIEW with DAQmx on the two
//! simulated devices (`labview-captures/reports/2026-11-15-daqmx-dio.md`, §n below).
//!
//! A simulated line reads a counter, not what was written (§4, §5): every task counts the samples read from it, and a
//! read gives that count masked by the channel's lines. An untimed read or write that finds the task stopped leaves it
//! stopped (§3, §6), unlike an analog read, which starts it.

use std::time::Duration;

use crate::digital::{DigitalChannel, Direction};
use crate::engine::{ChannelKind, Engine, SamplesRequested, Task, TaskId, Wait};
use crate::error::{codes, DaqError, ErrorDetails};
use crate::output::WriteOutcome;

/// How many lines a read takes from its channel: one line, or the channel's whole value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DigitalRead {
    OneLine,
    Port,
}

impl Engine {
    /// Reads one sample of the task's one channel as a number (§4).
    pub fn read_digital_u32(&mut self, task: TaskId, timeout: Option<Duration>) -> Result<u32, DaqError> {
        let wait = self.prepare_digital_read(task, DigitalRead::Port, timeout)?;
        self.clock.wait(wait.duration);
        wait.outcome?;
        self.take_digital_sample(task)
    }

    /// Reads one sample of the task's one line (§3).
    pub fn read_digital_line(&mut self, task: TaskId, timeout: Option<Duration>) -> Result<bool, DaqError> {
        let wait = self.prepare_digital_read(task, DigitalRead::OneLine, timeout)?;
        self.clock.wait(wait.duration);
        wait.outcome?;
        Ok(self.take_digital_sample(task)? != 0)
    }

    /// What a digital read checks, and how long it must wait before [`Engine::take_digital_sample`]. An untimed task
    /// that is not running is checked as Start would check it, and not started (§3, §5: a line another started task
    /// holds is -200587); a timed one is started and waited on as an analog read is (§8).
    pub fn prepare_digital_read(&mut self, task: TaskId, read: DigitalRead, timeout: Option<Duration>) -> Result<Wait<()>, DaqError> {
        let task_data = self.task(task)?;
        let channel = check_readable(task_data)?;
        if read == DigitalRead::OneLine && channel.lines.len() != 1 {
            let details = ErrorDetails { task_name: Some(task_data.name.clone()), line_counts: Some((channel.lines.len(), 1)), ..Default::default() };
            return Err(DaqError::new(codes::LINE_COUNT_MISMATCH, details));
        }
        if task_data.timing.is_some() {
            return self.begin_and_wait(task, SamplesRequested::Count(1), timeout);
        }
        if task_data.started_at.is_none() {
            self.check_can_start(task_data)?;
        }
        Ok(Wait::none(Ok(())))
    }

    /// The sample a digital read gives, once its wait is over: the channel's value at the task's counter, which then
    /// counts one more (§4). A finite timed task gives no more than its samples (§8: -200278).
    pub fn take_digital_sample(&mut self, task: TaskId) -> Result<u32, DaqError> {
        let task_data = self.task(task)?;
        let (count, _) = self.samples_to_take(task_data, SamplesRequested::Count(1))?;
        let value = check_readable(task_data)?.value_at(task_data.digital_counter);
        let task_data = self.task_mut(task)?;
        task_data.consumed += count;
        task_data.digital_counter += 1;
        Ok(value)
    }

    /// Writes one value to the task's one line (§6). It counts as written even when the channel has more lines than
    /// one, beside -200562, as DAQmx reports it.
    pub fn write_digital_line(&mut self, task: TaskId, value: bool, auto_start: bool) -> WriteOutcome {
        let task_data = match self.task(task) {
            Ok(task_data) => task_data,
            Err(error) => return WriteOutcome::failed(error),
        };
        let channel = match check_writable(task_data) {
            Ok(channel) => channel,
            Err(error) => return WriteOutcome::failed(error),
        };
        if channel.lines.len() != 1 {
            let details = ErrorDetails { task_name: Some(task_data.name.clone()), channel: Some(channel.name.clone()), ..Default::default() };
            return WriteOutcome { written: 1, result: Err(DaqError::new(codes::DIGITAL_DATA_NOT_SUPPORTED, details)) };
        }
        if let Err(error) = self.check_state_for_write(task_data, auto_start) {
            return WriteOutcome::failed(error);
        }
        // A timed task written before Start: its lines must be free (§5).
        if task_data.started_at.is_none()
            && !auto_start
            && let Err(error) = self.check_digital_can_start(task_data)
        {
            return WriteOutcome::failed(error);
        }
        self.keep_line_written(task, value, auto_start)
    }

    /// The last value written to the task's line, if any.
    pub fn last_line_written(&self, task: TaskId) -> Result<Option<bool>, DaqError> {
        Ok(self.task(task)?.output.last_line_written)
    }

    /// Keeps the value, and starts a timed task that is not running when `auto_start` asks (§8, as an analog output).
    fn keep_line_written(&mut self, task: TaskId, value: bool, auto_start: bool) -> WriteOutcome {
        let Ok(task_data) = self.task_mut(task) else { return WriteOutcome::failed(DaqError::bare(codes::INVALID_TASK)) };
        task_data.output.last_line_written = Some(value);
        task_data.output.has_data = true;
        let starts = auto_start && task_data.timing.is_some() && task_data.started_at.is_none();
        match if starts { self.begin(task) } else { Ok(()) } {
            Ok(()) => WriteOutcome { written: 1, result: Ok(()) },
            Err(error) => WriteOutcome::failed(error),
        }
    }
}

/// The one digital channel a one-channel read takes (§3, §6): an input or an output task, of one channel.
fn check_readable(task_data: &Task) -> Result<&DigitalChannel, DaqError> {
    match task_data.kind() {
        None => return Err(Engine::task_error(task_data, codes::TASK_HAS_NO_CHANNELS)),
        Some(ChannelKind::AnalogInput) => return Err(Engine::task_error(task_data, codes::READ_TYPE_MISMATCH)),
        Some(ChannelKind::AnalogOutput) => return Err(Engine::task_error(task_data, codes::NO_INPUT_CHANNELS)),
        Some(ChannelKind::DigitalInput | ChannelKind::DigitalOutput) => {}
    }
    only_channel(task_data, codes::READ_NEEDS_ONE_CHANNEL)
}

/// The one digital output channel a one-channel write takes (§6).
fn check_writable(task_data: &Task) -> Result<&DigitalChannel, DaqError> {
    match task_data.kind() {
        None => return Err(Engine::task_error(task_data, codes::NO_DEVICES_IN_TASK)),
        Some(ChannelKind::AnalogInput | ChannelKind::DigitalInput) => return Err(Engine::task_error(task_data, codes::NO_OUTPUT_CHANNELS)),
        Some(ChannelKind::AnalogOutput) => return Err(Engine::task_error(task_data, codes::WRITE_TYPE_MISMATCH)),
        Some(ChannelKind::DigitalOutput) => {}
    }
    debug_assert!(task_data.digital.iter().all(|channel| channel.direction == Direction::Output));
    only_channel(task_data, codes::CHANNEL_COUNT_MISMATCH)
}

/// The task's channel when it has one, or `code` naming how many it has against the data's one.
fn only_channel(task_data: &Task, code: i32) -> Result<&DigitalChannel, DaqError> {
    match &task_data.digital[..] {
        [channel] => Ok(channel),
        channels => {
            let details = ErrorDetails { task_name: Some(task_data.name.clone()), channel_counts: Some((channels.len(), 1)), ..Default::default() };
            Err(DaqError::new(code, details))
        }
    }
}
