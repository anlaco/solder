//! Creating and destroying tasks, and adding channels to them. These functions are given the task's data, not its
//! `taskID`: a pointer to the cell where the task wire keeps its record's address (measured: Adapt to Type, Handles by
//! Value). Create writes the record's address there, 8 bytes and nothing else; Destroy is given the same cell and
//! leaves it as it is (`labview-captures/reports/2026-11-13-daq-create-task.md`).

use std::ffi::c_void;

use solder_daq::engine::TaskId;
use solder_daq::error::DaqError;

use crate::host::{self, Handle};
use crate::{finish, messages, tasks};

/// `int32_t DAQCreateTask140(void *lvAppReference, void *taskRefObjectPtr, const LStrHandle newTaskName, const
/// LStrHandle taskToCopy, uint8_t autoCleanup, const LStrHandle channels, LStrHandle extendedErrorInfo)`.
/// Copying a task and global virtual channels are not built; `autoCleanup` is not used (UNVERIFIED what it changes).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQCreateTask140(
    _application: *mut c_void,
    task_record_cell: *mut usize,
    new_task_name: Handle,
    task_to_copy: Handle,
    _auto_cleanup: u8,
    channels: Handle,
    extended_error_info: Handle,
) -> i32 {
    // SAFETY: the handles are LabVIEW strings and the cell has room for an address, as the node passes them.
    unsafe {
        if !read_text(task_to_copy).is_empty() || !read_text(channels).is_empty() {
            return finish_not_built("copying a task or adding global virtual channels at Create Task", extended_error_info);
        }
        let result = tasks::create(&read_text(new_task_name)).map(|record| task_record_cell.write_unaligned(record));
        finish(result, extended_error_info)
    }
}

/// `int32_t DAQCreateAIVoltageChan(void *lvAppRef, void *refObjPtr, const LStrHandle physicalChannelName, const
/// LStrHandle channelNameIn, int32_t terminalConfig, double minVal, double maxVal, int32_t units, const LStrHandle
/// customScaleName, LStrHandle channelNamesOut, LStrHandle extendedErrorInfo)`. With no task in, it creates one in the
/// same call (measured). The terminal configuration does not change a simulated device's data, so it is not used. The
/// channel names go out separated by ", " (UNVERIFIED: DAQmx's separator was not measured).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQCreateAIVoltageChan(
    _application: *mut c_void,
    task_record_cell: *mut usize,
    physical_channel_name: Handle,
    channel_name_in: Handle,
    _terminal_config: i32,
    minimum: f64,
    maximum: f64,
    units: i32,
    custom_scale_name: Handle,
    channel_names_out: Handle,
    extended_error_info: Handle,
) -> i32 {
    // SAFETY: as above.
    unsafe {
        if !read_text(channel_name_in).is_empty() || !read_text(custom_scale_name).is_empty() || units != VOLTS {
            return finish_not_built("naming channels or custom scales", extended_error_info);
        }
        let physical_channels = read_text(physical_channel_name);
        let result = task_of_cell(task_record_cell)
            .and_then(|task| tasks::engine().add_ai_voltage_channels(task, &physical_channels, minimum, maximum))
            .map(|names| {
                let _ = host::write_string(channel_names_out, &names.join(", "));
            });
        finish(result, extended_error_info)
    }
}

/// DAQmx's units ring, Volts (measured, `labview-captures/reports/2026-11-06-daqmx-create-channel.md`).
const VOLTS: i32 = 10348;

/// `int32_t DAQDestroyTask110(void *taskRefObjPtr, LStrHandle errorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQDestroyTask110(task_record_cell: *mut usize, error_info: Handle) -> i32 {
    // SAFETY: the cell holds the task's record address, or 0 for an empty task.
    unsafe {
        let record = if task_record_cell.is_null() { 0 } else { task_record_cell.read_unaligned() };
        finish(tasks::destroy(record), error_info)
    }
}

/// The task a cell's record stands for; an empty cell gets a new task, whose record is written into it.
unsafe fn task_of_cell(task_record_cell: *mut usize) -> Result<TaskId, DaqError> {
    // SAFETY: the cell has room for an address, as the node passes it.
    unsafe {
        let record = task_record_cell.read_unaligned();
        if record != 0 {
            return tasks::from_record(record);
        }
        let record = tasks::create("")?;
        task_record_cell.write_unaligned(record);
        tasks::from_record(record)
    }
}

unsafe fn read_text(handle: Handle) -> String {
    // SAFETY: the caller passes a LabVIEW string handle or null.
    unsafe { host::read_string(handle) }
}

/// Answers Solder's "not built yet" for part of a function, with its text.
pub(crate) unsafe fn finish_not_built(what: &str, extended_error_info: Handle) -> i32 {
    let (error, text) = messages::not_built(what);
    // SAFETY: the function's string handle.
    let _ = unsafe { host::write_string(extended_error_info, &text) };
    error.code
}
