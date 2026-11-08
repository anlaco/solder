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
    /// The task does not exist, or was cleared. UNVERIFIED: the code is from general knowledge, not measured.
    pub const INVALID_TASK: i32 = -200088;
    /// An operation that needs channels on a task that has none. UNVERIFIED: a placeholder, DAQmx's code was not measured.
    pub const TASK_HAS_NO_CHANNELS: i32 = -200478;
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
