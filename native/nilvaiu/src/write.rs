//! The analog writes of doubles (DT-087). The signatures are those measured on DAQmx's Write VIs
//! (`labview-captures/reports/2026-11-08-daq-clfn-api.md`); what each does, on the engine, was measured with the simulated
//! devices (`labview-captures/reports/2026-11-15-daqmx-ao.md`). A simulated write never waits, so `timeout` is not used.
//! The samples written go out even beside an error, as DAQmx reports them (§4 of that report).

use solder_daq::engine::TaskId;
use solder_daq::error::DaqError;
use solder_daq::output::WriteOutcome;

use crate::host::{self, Handle};
use crate::{finish, tasks};

/// A 2D array's two dimensions: rows (one per channel) and columns (samples).
const TWO_DIMENSIONS: usize = 2;

/// Writes `data` to a task and puts the samples written per channel where the node asked for them.
unsafe fn write(task_id: usize, auto_start: u8, data: &[Vec<f64>], samples_written: *mut u32) -> Result<(), DaqError> {
    let outcome = match tasks::from_task_id(task_id) {
        Ok(task) => engine_write(task, data, auto_start != 0),
        Err(error) => WriteOutcome { written: 0, result: Err(error) },
    };
    if !samples_written.is_null() {
        // SAFETY: the node passes the address of a U32.
        unsafe { samples_written.write_unaligned(u32::try_from(outcome.written).unwrap_or(u32::MAX)) };
    }
    outcome.result
}

fn engine_write(task: TaskId, data: &[Vec<f64>], auto_start: bool) -> WriteOutcome {
    tasks::engine().write_f64(task, data, auto_start)
}

/// `int32_t DAQWrite1Chan1SampF64(uintptr_t taskID, double timeout, uint8_t autoStart, double *data, uint32_t
/// *numSamplesWriten, LStrHandle extendedErrorInfo)`: one sample to a task's one channel.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQWrite1Chan1SampF64(task_id: usize, _timeout: f64, auto_start: u8, data: *mut f64, samples_written: *mut u32, extended_error_info: Handle) -> i32 {
    // SAFETY: the node passes the address of a double, the samples' U32 and the function's string handle.
    unsafe {
        let value = if data.is_null() { 0.0 } else { data.read_unaligned() };
        let result = write(task_id, auto_start, &[vec![value]], samples_written);
        finish(result, extended_error_info)
    }
}

/// `int32_t DAQWriteNChanNSamp2DF64(uintptr_t taskID, double timeout, uint8_t autoStart, const Array2DDouble **data,
/// uint32_t *numSamplesWriten, LStrHandle extendedErrorInfo)`: a row per channel. DAQmx's 1D write calls it too, with
/// its array built into one row (measured, `labview-captures/daq-api/walk.json`).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQWriteNChanNSamp2DF64(task_id: usize, _timeout: f64, auto_start: u8, data: Handle, samples_written: *mut u32, extended_error_info: Handle) -> i32 {
    // SAFETY: the node passes a 2D array handle of doubles, the samples' U32 and the function's string handle.
    unsafe {
        let (sizes, values) = host::read_doubles(data, TWO_DIMENSIONS);
        let rows = rows_of(sizes[0], sizes[1], &values);
        let result = write(task_id, auto_start, &rows, samples_written);
        finish(result, extended_error_info)
    }
}

/// The rows of a 2D array given row after row; an array with no columns has no rows to write.
fn rows_of(row_count: usize, column_count: usize, values: &[f64]) -> Vec<Vec<f64>> {
    if column_count == 0 {
        return Vec::new();
    }
    values.chunks(column_count).take(row_count).map(<[f64]>::to_vec).collect()
}
