//! A task's start trigger (DT-087): DAQmx's Start Trigger (None) and Start Trigger (Digital Edge). Measured in LabVIEW
//! with DAQmx on the two simulated devices (`labview-captures/reports/2026-11-15-daqmx-trigger.md`, §n below; the empty
//! source from `2026-11-06-daqmx-timing-trigger.md`).
//!
//! A simulated device never waits for its edge (§1): a task with a trigger runs and reads as one without. So the trigger
//! is only kept, and checked where DAQmx checks it: the task when it is set, the source at Start.

use crate::device::DeviceProfile;
use crate::engine::{ChannelKind, Engine, Task, TaskId};
use crate::error::{codes, DaqError, ErrorDetails};

/// The edge a digital trigger waits for. Both behave alike on a simulated device (§4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Edge {
    Rising,
    Falling,
}

pub(crate) struct StartTrigger {
    pub(crate) source: String,
    #[allow(dead_code)] // kept for whoever looks at the task; a simulated device does not use it (§4)
    pub(crate) edge: Edge,
}

/// The trigger that names the task's own start, as a source routed to itself (§2: `/Dev1/ai/StartTrigger`).
const OWN_START_TRIGGER: &str = "ai/starttrigger";
const PFI_PREFIX: &str = "pfi";

impl Engine {
    /// Sets a digital-edge start trigger. Any source is taken here and checked at Start (§2).
    pub fn configure_digital_edge_start_trigger(&mut self, task: TaskId, source: &str, edge: Edge) -> Result<(), DaqError> {
        self.check_trigger_can_be_set(task)?;
        let task_data = self.task(task)?;
        if self.lacks_digital_clock(task_data) {
            return Err(Self::task_error(task_data, codes::PROPERTY_NOT_SUPPORTED)); // §3: Dev1's digital task, -200452
        }
        self.task_mut(task)?.start_trigger = Some(StartTrigger { source: source.to_string(), edge });
        Ok(())
    }

    /// Removes the start trigger, whatever it was (§5: a bad source set before no longer fails at Start).
    pub fn disable_start_trigger(&mut self, task: TaskId) -> Result<(), DaqError> {
        self.check_trigger_can_be_set(task)?;
        self.task_mut(task)?.start_trigger = None;
        Ok(())
    }

    /// What setting either trigger checks (§5, §6, §7): a task with channels, not running. A finite task that ended and
    /// was not stopped still counts as running (§6).
    pub fn check_trigger_can_be_set(&self, task: TaskId) -> Result<(), DaqError> {
        let task_data = self.task(task)?;
        if !task_data.has_channels() {
            return Err(Self::task_error(task_data, codes::NO_DEVICES_IN_TASK));
        }
        if task_data.started_at.is_some() {
            return Err(Self::task_error(task_data, codes::PROPERTY_NOT_SETTABLE_WHILE_RUNNING));
        }
        Ok(())
    }

    /// What Start checks of the trigger (§2, §3): a sample clock, and a source the task's device has.
    pub(crate) fn check_start_trigger(&self, task_data: &Task) -> Result<(), DaqError> {
        let Some(trigger) = &task_data.start_trigger else { return Ok(()) };
        if task_data.timing.is_none() {
            return Err(Self::task_error(task_data, codes::TRIGGER_NEEDS_SAMPLE_CLOCK));
        }
        let Some((device, profile)) = task_data.first_device().and_then(|device| self.devices.find(device)) else { return Ok(()) };
        match self.source_code(trigger.source.trim(), device, profile) {
            None => Ok(()),
            Some(code) => Err(DaqError::new(code, ErrorDetails { task_name: Some(task_data.name.clone()), channel: Some(trigger.source.clone()), ..Default::default() })),
        }
    }

    /// The code a source gives at Start on a task of `device`, or `None` when the device has it (§2). Names are
    /// compared without regard to case; a trailing space is ignored.
    fn source_code(&self, source: &str, device: &str, profile: &DeviceProfile) -> Option<i32> {
        if source.is_empty() {
            return Some(codes::EMPTY_TERMINAL_NAME);
        }
        let lower = source.to_ascii_lowercase();
        let (source_device, terminal) = match lower.strip_prefix('/') {
            None => (device.to_ascii_lowercase(), lower.as_str()), // `PFI0` is the task's own device's
            Some(rest) => match rest.split_once('/') {
                Some((source_device, terminal)) => (source_device.to_string(), terminal),
                None => return Some(codes::INVALID_TERMINAL), // `/Dev1`
            },
        };
        if !source_device.eq_ignore_ascii_case(device) {
            return Some(if self.devices.find(&source_device).is_some() { profile.triggers.other_device_code } else { codes::TERMINAL_NOT_FOUND });
        }
        if terminal == OWN_START_TRIGGER {
            return Some(codes::ROUTE_TO_ITSELF);
        }
        let pfi = terminal.strip_prefix(PFI_PREFIX).and_then(|number| number.parse::<usize>().ok());
        match pfi {
            Some(number) if number < profile.triggers.pfi_count => None,
            _ => Some(codes::TERMINAL_NOT_FOUND),
        }
    }

    /// A digital task on a device with no digital sample clock, which takes no trigger at all (§3: Dev1's DI task).
    fn lacks_digital_clock(&self, task_data: &Task) -> bool {
        let digital = matches!(task_data.kind(), Some(ChannelKind::DigitalInput | ChannelKind::DigitalOutput));
        let device = task_data.first_device().and_then(|device| self.devices.find(device));
        digital && device.is_some_and(|(_, profile)| profile.digital.max_rate.is_none())
    }
}
