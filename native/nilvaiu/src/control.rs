//! Timing, the start trigger, starting and stopping, and waiting for a task to end. These take the task by its
//! `taskID`, the address of the library's task object (measured).

use solder_daq::engine::SampleMode;

use crate::create::finish_not_built;
use crate::host::{self, Handle};
use crate::{finish, tasks, timeout_from_seconds};

/// DAQmx's sample mode ring (measured, `labview-captures/reports/2026-11-06-daqmx-timing-trigger.md`).
const FINITE_SAMPLES: i32 = 10178;
const CONTINUOUS_SAMPLES: i32 = 10123;

/// `DAQControl`'s modes: Start Task passes 0 and Stop Task 1 (measured, `2026-11-08-daq-clfn-api.md`).
const START: u32 = 0;
const STOP: u32 = 1;

/// `int32_t DAQCfgSampClkTiming(uintptr_t taskID, const LStrHandle source, const double rate, const int32_t
/// activeEdge, const int32_t sampleMode, const uint64_t samplesPerChannel, LStrHandle extendedErrorInfo)`. Only the
/// device's own clock is built; on a simulated device the edge changes nothing.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQCfgSampClkTiming(
    task_id: usize,
    source: Handle,
    rate: f64,
    _active_edge: i32,
    sample_mode: i32,
    samples_per_channel: u64,
    extended_error_info: Handle,
) -> i32 {
    // SAFETY: the handles are LabVIEW strings, as the node passes them.
    unsafe {
        let mode = match sample_mode {
            FINITE_SAMPLES => SampleMode::FiniteSamples,
            CONTINUOUS_SAMPLES => SampleMode::ContinuousSamples,
            _ => return finish_not_built("hardware-timed single point", extended_error_info),
        };
        if !host::read_string(source).is_empty() {
            return finish_not_built("a sample clock source other than the device's own", extended_error_info);
        }
        let result = tasks::from_task_id(task_id).and_then(|task| tasks::engine().configure_sample_clock(task, rate, mode, samples_per_channel));
        finish(result, extended_error_info)
    }
}

/// `int32_t DAQDisableStartTrig(uintptr_t taskID, LStrHandle extendedErrorIndo)`: Start Trigger (None). A task of the
/// engine has no trigger to begin with, so only the task is checked.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQDisableStartTrig(task_id: usize, extended_error_info: Handle) -> i32 {
    // SAFETY: the function's string handle.
    unsafe { finish(tasks::from_task_id(task_id).map(|_| ()), extended_error_info) }
}

/// `int32_t DAQControl(uintptr_t taskID, uint32_t mode, LStrHandle extendedErrorInfo)`: Start Task and Stop Task.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQControl(task_id: usize, mode: u32, extended_error_info: Handle) -> i32 {
    // SAFETY: the function's string handle.
    unsafe {
        let task = match tasks::from_task_id(task_id) {
            Ok(task) => task,
            Err(error) => return finish(Err(error), extended_error_info),
        };
        match mode {
            START => finish(tasks::engine().start(task), extended_error_info),
            STOP => finish(tasks::engine().stop(task), extended_error_info),
            _ => finish_not_built("this action of Control Task", extended_error_info),
        }
    }
}

/// `int32_t DAQWaitUntilDone(uintptr_t taskID, double timeout, LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQWaitUntilDone(task_id: usize, timeout: f64, extended_error_info: Handle) -> i32 {
    // SAFETY: the function's string handle.
    unsafe {
        let result = tasks::from_task_id(task_id)
            .and_then(|task| tasks::engine().prepare_wait_until_done(task, timeout_from_seconds(timeout)))
            .and_then(tasks::wait_outside);
        finish(result, extended_error_info)
    }
}
