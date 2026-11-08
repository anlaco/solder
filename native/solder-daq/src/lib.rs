//! Solder's DAQ engine (DT-087): tasks, channels, timing and data, over simulated devices.
//!
//! It knows nothing of LabVIEW: its calls take plain Rust types. A facade that exports the functions of `nilvaiu.dll`
//! translates LabVIEW's handles into these calls; a second facade for `nicaiu`'s public C API could be added over the
//! same engine without touching it.
//!
//! The behaviour reproduced here was measured in LabVIEW with DAQmx and a simulated NI device
//! (`labview-captures/reports/2026-11-06-daqmx-*.md`). What was not measured is marked "unverified" where it is used.

pub mod clock;
pub mod device;
pub mod engine;
pub mod error;
pub mod signal;
