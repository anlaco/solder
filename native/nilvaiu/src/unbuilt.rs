//! The functions of DAQ's stage A that the engine cannot do yet: analog output, digital lines, the digital start trigger
//! and the writes. They are exported with the signatures measured (`labview-captures/reports/2026-11-08-daq-clfn-api.md`),
//! so a node that calls one finds it, and each answers Solder's code -1 with a text that says it is not built yet
//! (DT-087, amendment of 2026-11-13). The parameters are named only so that the last, `extendedErrorInfo`, is reached.

use std::ffi::c_void;

use crate::create::finish_not_built;
use crate::host::Handle;

/// `int32_t DAQCreateAOVoltageChan(...)`: the same parameters as `DAQCreateAIVoltageChan`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQCreateAOVoltageChan(
    _application: *mut c_void,
    _task_record_cell: *mut usize,
    _physical_channel_name: Handle,
    _channel_name_in: Handle,
    _terminal_config: i32,
    _minimum: f64,
    _maximum: f64,
    _units: i32,
    _custom_scale_name: Handle,
    _channel_names_out: Handle,
    extended_error_info: Handle,
) -> i32 {
    // SAFETY: the function's string handle.
    unsafe { finish_not_built("analog output", extended_error_info) }
}

/// `int32_t DAQCreateDIChan(void *lvAppRef, void *refObjPtr, const LStrHandle lines, const LStrHandle channelNameIn,
/// int32_t lineGrouping, LStrHandle channelNamesOut, LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQCreateDIChan(_application: *mut c_void, _task_record_cell: *mut usize, _lines: Handle, _channel_name_in: Handle, _line_grouping: i32, _channel_names_out: Handle, extended_error_info: Handle) -> i32 {
    // SAFETY: the function's string handle.
    unsafe { finish_not_built("digital input", extended_error_info) }
}

/// `int32_t DAQCreateDOChan(...)`: the same parameters as `DAQCreateDIChan`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQCreateDOChan(_application: *mut c_void, _task_record_cell: *mut usize, _lines: Handle, _channel_name_in: Handle, _line_grouping: i32, _channel_names_out: Handle, extended_error_info: Handle) -> i32 {
    // SAFETY: the function's string handle.
    unsafe { finish_not_built("digital output", extended_error_info) }
}

/// `int32_t DAQCfgDigEdgeStartTrig(uintptr_t taskID, const LStrHandle source, const int32_t edge, LStrHandle
/// extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQCfgDigEdgeStartTrig(_task_id: usize, _source: Handle, _edge: i32, extended_error_info: Handle) -> i32 {
    // SAFETY: the function's string handle.
    unsafe { finish_not_built("a digital edge start trigger", extended_error_info) }
}

/// `int32_t DAQRead1Chan1Samp1LineBool(uintptr_t taskID, double timeout, uint8_t *data, LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQRead1Chan1Samp1LineBool(_task_id: usize, _timeout: f64, _data: *mut u8, extended_error_info: Handle) -> i32 {
    // SAFETY: the function's string handle.
    unsafe { finish_not_built("digital reads", extended_error_info) }
}

/// `int32_t DAQRead1Chan1SampU32Port(uintptr_t taskID, double timeout, uint32_t *data, LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQRead1Chan1SampU32Port(_task_id: usize, _timeout: f64, _data: *mut u32, extended_error_info: Handle) -> i32 {
    // SAFETY: the function's string handle.
    unsafe { finish_not_built("digital reads", extended_error_info) }
}

/// `int32_t DAQWrite1Chan1SampF64(uintptr_t taskID, double timeout, uint8_t autoStart, double *data, uint32_t
/// *numSamplesWriten, LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQWrite1Chan1SampF64(_task_id: usize, _timeout: f64, _auto_start: u8, _data: *mut f64, _samples_written: *mut u32, extended_error_info: Handle) -> i32 {
    // SAFETY: the function's string handle.
    unsafe { finish_not_built("analog writes", extended_error_info) }
}

/// `int32_t DAQWriteNChanNSamp2DF64(uintptr_t taskID, double timeout, uint8_t autoStart, const Array2DDouble **data,
/// uint32_t *numSamplesWriten, LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQWriteNChanNSamp2DF64(_task_id: usize, _timeout: f64, _auto_start: u8, _data: Handle, _samples_written: *mut u32, extended_error_info: Handle) -> i32 {
    // SAFETY: the function's string handle.
    unsafe { finish_not_built("analog writes", extended_error_info) }
}

/// `int32_t DAQWrite1Chan1Samp1LineBool(uintptr_t taskID, double timeout, uint8_t autoStart, uint8_t *data, uint32_t
/// *numSamplesWriten, LStrHandle extendedErrorInfo)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DAQWrite1Chan1Samp1LineBool(_task_id: usize, _timeout: f64, _auto_start: u8, _data: *mut u8, _samples_written: *mut u32, extended_error_info: Handle) -> i32 {
    // SAFETY: the function's string handle.
    unsafe { finish_not_built("digital writes", extended_error_info) }
}
