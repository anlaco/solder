//! The digital lines (DT-087): creating input and output channels of lines, and the one-sample reads and write of a
//! line or a port. The signatures are those measured on DAQmx's VIs (`labview-captures/reports/2026-11-08-daq-clfn-api.md`);
//! what each does, on the engine, was measured with the simulated devices (`labview-captures/reports/2026-11-15-daqmx-dio.md`).
//! A Boolean travels as a byte, 0 or 1, and the Read VI turns it into a Boolean with "Not Equal To 0?" (measured,
//! `labview-captures/daq-api/walk.json`).

use std::ffi::c_void;

use solder_daq::digital::{Direction, LineGrouping};
use solder_daq::engine::TaskId;
use solder_daq::error::DaqError;
use solder_daq::output::WriteOutcome;

use crate::create::task_of_cell;
use solder_daq::digital_io::DigitalRead;
use crate::host::{self, Handle};
use crate::{finish, tasks, timeout_from_seconds};

/// DAQmx's line grouping ring: one channel for each line is 0, one channel for all lines 1 (measured,
/// `2026-11-06-daqmx-create-channel.md`). Any other value is taken as 1 (measured: 5 is accepted; what it does,
/// UNVERIFIED).
const ONE_CHANNEL_FOR_EACH_LINE: i32 = 0;

fn grouping_from(line_grouping: i32) -> LineGrouping {
    if line_grouping == ONE_CHANNEL_FOR_EACH_LINE { LineGrouping::OneChannelForEachLine } else { LineGrouping::OneChannelForAllLines }
}

/// Adds the channels to the cell's task (a new one when the cell is empty) and gives their names, separated by ", "
/// (UNVERIFIED: DAQmx's separator, as for the analog channels).
unsafe fn create(task_record_cell: *mut usize, lines: Handle, channel_name_in: Handle, line_grouping: i32, channel_names_out: Handle, direction: Direction) -> Result<(), DaqError> {
    // SAFETY: the handles are LabVIEW strings and the cell has room for an address, as the node passes them.
    unsafe {
        let (lines, names_to_assign) = (host::read_string(lines), host::read_string(channel_name_in));
        let task = task_of_cell(task_record_cell)?;
        let names = tasks::engine().add_digital_channels(task, &lines, &names_to_assign, grouping_from(line_grouping), direction)?;
        let _ = host::write_string(channel_names_out, &names.join(", "));
        Ok(())
    }
}

/// `int32_t DAQCreateDIChan(void *lvAppRef, void *refObjPtr, const LStrHandle lines, const LStrHandle channelNameIn,
/// int32_t lineGrouping, LStrHandle channelNamesOut, LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQCreateDIChan(_application: *mut c_void, task_record_cell: *mut usize, lines: Handle, channel_name_in: Handle, line_grouping: i32, channel_names_out: Handle, extended_error_info: Handle) -> i32 {
    // SAFETY: as `create`, and the function's string handle.
    unsafe { finish(create(task_record_cell, lines, channel_name_in, line_grouping, channel_names_out, Direction::Input), extended_error_info) }
}

/// `int32_t DAQCreateDOChan(...)`: the same parameters as `DAQCreateDIChan`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQCreateDOChan(_application: *mut c_void, task_record_cell: *mut usize, lines: Handle, channel_name_in: Handle, line_grouping: i32, channel_names_out: Handle, extended_error_info: Handle) -> i32 {
    // SAFETY: as `create`, and the function's string handle.
    unsafe { finish(create(task_record_cell, lines, channel_name_in, line_grouping, channel_names_out, Direction::Output), extended_error_info) }
}

/// One sample of the task's one channel, waiting outside the engine when the task is timed.
fn read(task_id: usize, read: DigitalRead, timeout: f64) -> Result<u32, DaqError> {
    let task: TaskId = tasks::from_task_id(task_id)?;
    let wait = tasks::engine().prepare_digital_read(task, read, timeout_from_seconds(timeout))?;
    tasks::wait_outside(wait)?;
    tasks::engine().take_digital_sample(task)
}

/// `int32_t DAQRead1Chan1Samp1LineBool(uintptr_t taskID, double timeout, uint8_t *data, LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQRead1Chan1Samp1LineBool(task_id: usize, timeout: f64, data: *mut u8, extended_error_info: Handle) -> i32 {
    let result = read(task_id, DigitalRead::OneLine, timeout).map(|value| {
        if !data.is_null() {
            // SAFETY: the node passes the address of a U8.
            unsafe { data.write(u8::from(value != 0)) };
        }
    });
    // SAFETY: the function's string handle.
    unsafe { finish(result, extended_error_info) }
}

/// `int32_t DAQRead1Chan1SampU32Port(uintptr_t taskID, double timeout, uint32_t *data, LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQRead1Chan1SampU32Port(task_id: usize, timeout: f64, data: *mut u32, extended_error_info: Handle) -> i32 {
    let result = read(task_id, DigitalRead::Port, timeout).map(|value| {
        if !data.is_null() {
            // SAFETY: the node passes the address of a U32.
            unsafe { data.write_unaligned(value) };
        }
    });
    // SAFETY: the function's string handle.
    unsafe { finish(result, extended_error_info) }
}

/// `int32_t DAQWrite1Chan1Samp1LineBool(uintptr_t taskID, double timeout, uint8_t autoStart, uint8_t *data, uint32_t
/// *numSamplesWriten, LStrHandle extendedErrorInfo)`. A simulated write never waits, so `timeout` is not used.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQWrite1Chan1Samp1LineBool(task_id: usize, _timeout: f64, auto_start: u8, data: *mut u8, samples_written: *mut u32, extended_error_info: Handle) -> i32 {
    // SAFETY: the node passes the address of a U8, of the samples' U32, and the function's string handle.
    unsafe {
        let value = !data.is_null() && data.read() != 0;
        let outcome = match tasks::from_task_id(task_id) {
            Ok(task) => tasks::engine().write_digital_line(task, value, auto_start != 0),
            Err(error) => WriteOutcome { written: 0, result: Err(error) },
        };
        if !samples_written.is_null() {
            samples_written.write_unaligned(u32::try_from(outcome.written).unwrap_or(u32::MAX));
        }
        finish(outcome.result, extended_error_info)
    }
}
