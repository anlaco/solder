//! The engine's errors: DAQmx's numeric codes, with what a message about each needs. The sentences themselves are
//! written by the facade, which is where error text is built (DT-076 §6: "messages written anew").

/// The DAQmx error codes the engine gives. Each was measured in LabVIEW unless it says otherwise.
pub mod codes {
    /// The device named in a channel does not exist (measured: `Dev9/ai0`).
    pub const DEVICE_NOT_VALID: i32 = -200220;
    /// The device exists and the channel does not (measured: `Dev1/ai99`).
    pub const PHYSICAL_CHANNEL_DOES_NOT_EXIST: i32 = -200170;
    /// A property was given a value the device cannot do (measured: a rate of 1 MHz, and +-20 V at Start).
    pub const UNSUPPORTED_PROPERTY_VALUE: i32 = -200077;
    /// Start on a task that is already running (measured).
    pub const TASK_ALREADY_RUNNING: i32 = -200479;
    /// A read after the last sample of a finite acquisition was read (measured).
    pub const READ_BEYOND_FINAL_SAMPLE: i32 = -200278;
    /// A read timed out before the samples were acquired (measured).
    pub const SAMPLES_NOT_YET_ACQUIRED: i32 = -200284;
    /// Wait Until Done timed out (measured).
    pub const WAIT_TIMED_OUT: i32 = -200560;
    /// The task does not exist: `taskID` 0, or an address that is not a task (measured,
    /// `labview-captures/reports/2026-11-13-daq-create-task.md`). For a task that was cleared, UNVERIFIED.
    pub const INVALID_TASK: i32 = -200088;
    /// Start on a task that has no channels (measured, same report). Given also at Timing, where it is UNVERIFIED.
    pub const TASK_HAS_NO_CHANNELS: i32 = -200478;
    /// A value to write is outside what the channel takes (measured: 15 on a +-10 V channel, at Write).
    pub const DATA_OUTSIDE_RANGE: i32 = -200561;
    /// A write with auto start off to a task that is not running and has no timing (measured).
    pub const WRITE_NEEDS_RUNNING_TASK: i32 = -200846;
    /// A write to a finite generation that has ended and was not stopped, or to a stopped continuous one (measured).
    pub const WRITE_BEYOND_FINAL_SAMPLE: i32 = -200288;
    /// The data has a row for a different number of channels than the task has (measured: 1 or 3 rows for 2 channels).
    pub const CHANNEL_COUNT_MISMATCH: i32 = -200524;
    /// A timed generation started before anything was written, on a device that refuses it (measured on Dev1).
    pub const OUTPUT_BUFFER_EMPTY: i32 = -200462;
    /// A channel's minimum is not below its maximum (measured: at Start or at an auto-started Write, not at Create).
    pub const MINIMUM_NOT_BELOW_MAXIMUM: i32 = -200082;
    /// A write to a task that has input channels only (measured).
    pub const NO_OUTPUT_CHANNELS: i32 = -200459;
    /// A read from a task that has output channels only (measured).
    pub const NO_INPUT_CHANNELS: i32 = -200460;
    /// A write to a task that has no channels at all (measured).
    pub const NO_DEVICES_IN_TASK: i32 = -200477;
    /// Grouping a whole port into one channel per line (measured: `Dev1/port0` with one channel for each line).
    pub const PORT_NEEDS_ONE_CHANNEL: i32 = -200376;
    /// A channel of that name is already in the task (measured: the same line twice, one channel for each line).
    pub const CHANNEL_ALREADY_IN_TASK: i32 = -200489;
    /// A line given twice in one channel of all its lines (measured).
    pub const LINE_TWICE_IN_DIGITAL_TASK: i32 = -200014;
    /// A one-line read or write on a channel of several lines (measured: a read; a write gives -200562).
    pub const LINE_COUNT_MISMATCH: i32 = -200463;
    /// A one-channel read on a task of several channels (measured).
    pub const READ_NEEDS_ONE_CHANNEL: i32 = -200523;
    /// A one-line Boolean written to a channel of several lines (measured: the VI passes one byte, the driver reads more).
    pub const DIGITAL_DATA_NOT_SUPPORTED: i32 = -200562;
    /// A read of another kind of channel than the task's (measured: a digital read of an analog-input task).
    pub const READ_TYPE_MISMATCH: i32 = -200525;
    /// A write of another kind of channel than the task's (measured: a digital write to an analog-output task).
    pub const WRITE_TYPE_MISMATCH: i32 = -200526;
    /// A channel of another type than those already in the task (measured: every pair of AI, AO, DI and DO).
    pub const CHANNEL_TYPE_MIXED: i32 = -200559;
    /// A digital line is held by another task that was started (measured: only an explicit Start holds lines).
    pub const LINES_RESERVED: i32 = -200587;
    /// A digital task with lines of two devices, at Start (measured).
    pub const MULTIDEVICE_TASK_NOT_SUPPORTED: i32 = -201426;
    /// A start trigger on a task with no sample clock, at Start or at a read that starts it (measured).
    pub const TRIGGER_NEEDS_SAMPLE_CLOCK: i32 = -200262;
    /// A property the device does not have for this task (measured: a trigger on Dev1's untimed digital task).
    pub const PROPERTY_NOT_SUPPORTED: i32 = -200452;
    /// A property set while the task runs, or after a finite task ended without a Stop (measured: the triggers).
    pub const PROPERTY_NOT_SETTABLE_WHILE_RUNNING: i32 = -200557;
    /// A trigger whose source is empty, at Start (measured).
    pub const EMPTY_TERMINAL_NAME: i32 = -200797;
    /// A trigger source the device does not have, at Start (measured: `/Dev1/PFI2`, `Dev1/PFI0` with no slash).
    pub const TERMINAL_NOT_FOUND: i32 = -89120;
    /// A trigger source that is a device and no terminal (measured: `/Dev1`).
    pub const INVALID_TERMINAL: i32 = -89129;
    /// A trigger source that is the trigger itself (measured: `/Dev1/ai/StartTrigger` on an input task).
    pub const ROUTE_TO_ITSELF: i32 = -89131;
    /// A function of the driver that Solder has not built yet: Solder's own code, not DAQmx's, since no DAQmx code
    /// says so (DT-087, amendment of 2026-11-13).
    pub const NOT_BUILT_IN_SOLDER: i32 = -1;
}

/// What a message about an error can say; each field is filled only when it applies.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ErrorDetails {
    pub task_name: Option<String>,
    pub device: Option<String>,
    pub channel: Option<String>,
    /// For `DEVICE_NOT_VALID`: the devices that do exist.
    pub suggested_devices: Vec<String>,
    /// For `UNSUPPORTED_PROPERTY_VALUE`: DAQmx's name of the property (`SampClk.Rate`, `AI.Min`) and the numbers.
    pub property: Option<&'static str>,
    pub requested: Option<f64>,
    pub maximum: Option<f64>,
    pub minimum: Option<f64>,
    /// For `CHANNEL_COUNT_MISMATCH` and `READ_NEEDS_ONE_CHANNEL`: the channels of the task and the channels the data has.
    pub channel_counts: Option<(usize, usize)>,
    /// For `LINE_COUNT_MISMATCH`: the lines of the channel and the lines the data has.
    pub line_counts: Option<(usize, usize)>,
    /// For a property whose values are names, not numbers: what was asked for and what the device takes
    /// (`SampTimingType`: Sample Clock, and On Demand).
    pub requested_name: Option<&'static str>,
    pub possible_names: Option<&'static str>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DaqError {
    pub code: i32,
    /// Boxed so that a `Result` carrying an error stays small: the details hold text and a list.
    pub details: Box<ErrorDetails>,
}

impl DaqError {
    pub fn new(code: i32, details: ErrorDetails) -> Self {
        Self { code, details: Box::new(details) }
    }

    /// An error with no detail: the task is what it is about, or nothing more can be said.
    pub fn bare(code: i32) -> Self {
        Self::new(code, ErrorDetails::default())
    }
}

impl std::fmt::Display for DaqError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "DAQ error {}", self.code)
    }
}

impl std::error::Error for DaqError {}
