//! The analog reads of doubles. Each asks the engine how long to wait, waits without holding it, and then takes the
//! samples, so one task's wait does not hold up another's calls. A sample count of -1 is "whatever has been acquired"
//! (measured, `labview-captures/reports/2026-11-06-daqmx-read-write.md`).

use solder_daq::engine::{SamplesRequested, TaskId};
use solder_daq::error::DaqError;

use crate::host::{self, Handle};
use crate::{finish, tasks, timeout_from_seconds};

/// Reads `[channel][sample]` from a task, waiting outside the engine.
fn read(task_id: usize, requested: SamplesRequested, timeout: f64) -> Result<Vec<Vec<f64>>, DaqError> {
    let task: TaskId = tasks::from_task_id(task_id)?;
    let wait = tasks::engine().prepare_read(task, requested, timeout_from_seconds(timeout))?;
    tasks::wait_outside(wait)?;
    tasks::engine().take_samples(task, requested)
}

/// DAQmx's sample count: -1, or any negative one, is what has been acquired.
fn requested_from(count: i32) -> SamplesRequested {
    usize::try_from(count).map_or(SamplesRequested::Available, SamplesRequested::Count)
}

/// The first channel's samples: a "1Chan" read of a task with more channels reads the first (UNVERIFIED: DAQmx may
/// refuse it).
fn first_channel(mut data: Vec<Vec<f64>>) -> Vec<f64> {
    if data.is_empty() { Vec::new() } else { data.swap_remove(0) }
}

/// `int32_t DAQRead1Chan1SampF64(uintptr_t taskID, double timeout, double *data, LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQRead1Chan1SampF64(task_id: usize, timeout: f64, data: *mut f64, extended_error_info: Handle) -> i32 {
    let result = read(task_id, SamplesRequested::Count(1), timeout).map(|samples| {
        if let Some(sample) = first_channel(samples).first() {
            // SAFETY: the node passes the address of a double.
            unsafe { data.write_unaligned(*sample) };
        }
    });
    // SAFETY: the function's string handle.
    unsafe { finish(result, extended_error_info) }
}

/// `int32_t DAQRead1ChanNSamp1DF64(uintptr_t taskID, int32_t numberOfSamples, double timeout, Array1DDouble **data,
/// LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQRead1ChanNSamp1DF64(task_id: usize, number_of_samples: i32, timeout: f64, data: Handle, extended_error_info: Handle) -> i32 {
    let result = read(task_id, requested_from(number_of_samples), timeout).and_then(|samples| {
        let samples = first_channel(samples);
        write_array(data, &[samples.len()], &samples)
    });
    // SAFETY: the function's string handle.
    unsafe { finish(result, extended_error_info) }
}

/// `int32_t DAQReadNChan1Samp1DF64(uintptr_t taskID, double timeout, Array1DDouble **data, LStrHandle
/// extendedErrorInfo)`: one sample of each channel.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQReadNChan1Samp1DF64(task_id: usize, timeout: f64, data: Handle, extended_error_info: Handle) -> i32 {
    let result = read(task_id, SamplesRequested::Count(1), timeout).and_then(|samples| {
        let firsts: Vec<f64> = samples.iter().filter_map(|channel| channel.first().copied()).collect();
        write_array(data, &[firsts.len()], &firsts)
    });
    // SAFETY: the function's string handle.
    unsafe { finish(result, extended_error_info) }
}

/// `int32_t DAQReadNChanNSamp2DF64(uintptr_t taskID, int32_t samplesPerChannel, double timeout, Array2DDouble **data,
/// LStrHandle extendedErrorInfo)`: a row per channel, as DAQmx's 2D read gives them.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQReadNChanNSamp2DF64(task_id: usize, samples_per_channel: i32, timeout: f64, data: Handle, extended_error_info: Handle) -> i32 {
    let result = read(task_id, requested_from(samples_per_channel), timeout).and_then(|samples| {
        let per_channel = samples.first().map_or(0, Vec::len);
        let values: Vec<f64> = samples.concat();
        write_array(data, &[samples.len(), per_channel], &values)
    });
    // SAFETY: the function's string handle.
    unsafe { finish(result, extended_error_info) }
}

/// Fills an array handle; a host that cannot resize it is LabVIEW's memory error, passed on as the code.
fn write_array(handle: Handle, dimension_sizes: &[usize], values: &[f64]) -> Result<(), DaqError> {
    // SAFETY: the node passes an array handle of doubles with as many dimensions.
    unsafe { host::write_doubles(handle, dimension_sizes, values) }.map_err(DaqError::bare)
}
