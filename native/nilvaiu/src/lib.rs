//! Solder's `nilvaiu` (DT-087): the library DAQmx's VIs call, function for function, over Solder's DAQ engine. The
//! names, parameters, calling convention and return values are those measured on the Call Library Function Nodes of
//! DAQmx's VIs (`labview-captures/reports/2026-11-08-daq-clfn-api.md`), and a task travels as it was measured to
//! (`labview-captures/reports/2026-11-13-daq-taskid.md`, `-daq-create-task.md`). No NI code, header or text is used.
//!
//! Every function returns DAQmx's error code, 0 when there is none, and leaves the details in its last parameter, the
//! `extendedErrorInfo` string. The parts of a function the engine cannot do yet answer Solder's code -1 with a text that
//! says so (DT-087, amendment of 2026-11-13).

#![allow(non_snake_case, clippy::missing_safety_doc, clippy::too_many_arguments)]

mod control;
mod create;
mod digital;
mod host;
mod messages;
mod read;
mod tasks;
mod write;

use std::time::Duration;

use solder_daq::error::DaqError;

use host::Handle;

/// A function's `int32` return, leaving the details of an error in `error_info`.
unsafe fn finish(result: Result<(), DaqError>, error_info: Handle) -> i32 {
    match result {
        Ok(()) => 0,
        Err(error) => {
            // SAFETY: `error_info` is the function's string handle; if it cannot be filled, the code still goes back.
            let _ = unsafe { host::write_string(error_info, &messages::extended_error_info(&error)) };
            error.code
        }
    }
}

/// DAQmx's timeout in seconds; a negative one, DAQmx's -1, waits for ever (UNVERIFIED: from DAQmx's documentation, not
/// measured).
fn timeout_from_seconds(seconds: f64) -> Option<Duration> {
    (seconds >= 0.0).then(|| Duration::from_secs_f64(seconds))
}
