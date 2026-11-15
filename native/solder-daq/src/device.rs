//! The devices the engine knows and what each can do. Their capabilities are data, so that errors such as a rate above
//! the maximum come from them and not from code (DT-076 §7). Profiles are Solder's own, not NI's models.

/// What a device can do, by its analog inputs and outputs.
#[derive(Debug, Clone, PartialEq)]
pub struct DeviceProfile {
    pub ai_channel_count: usize,
    pub ai_min_volts: f64,
    pub ai_max_volts: f64,
    pub ai_max_rate: f64,
    pub ai_min_rate: f64,
    pub analog_output: AnalogOutputProfile,
    pub digital: DigitalProfile,
    pub triggers: TriggerProfile,
}

/// The terminals a device's start trigger may come from (measured, `labview-captures/reports/2026-11-15-daqmx-trigger.md`
/// §2): its PFI lines, and the code a terminal of another device gives, which differs between the two simulated devices.
#[derive(Debug, Clone, PartialEq)]
pub struct TriggerProfile {
    pub pfi_count: usize,
    pub other_device_code: i32,
}

/// What a device's digital lines can do (measured, `labview-captures/reports/2026-11-15-daqmx-dio.md` §1, §8). Every line
/// is both an input and an output.
#[derive(Debug, Clone, PartialEq)]
pub struct DigitalProfile {
    /// The number of lines of each port, `port0` first.
    pub lines_per_port: Vec<usize>,
    /// The fastest sample clock of a digital task; `None` when the device has only on-demand digital I/O (the simulated
    /// USB-6001: -200077 at Timing).
    pub max_rate: Option<f64>,
}

impl DigitalProfile {
    /// Whether the device has `line` of `port`.
    pub fn has_line(&self, port: usize, line: usize) -> bool {
        self.lines_per_port.get(port).is_some_and(|&count| line < count)
    }
}

/// How a device's analog outputs treat the range a channel is created with (measured: the two simulated devices
/// differ, `labview-captures/reports/2026-11-15-daqmx-ao.md` §2 and §3).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputRangeRule {
    /// Any range is taken, and a write may reach the union of the channel's range and the device's (the simulated
    /// USB-6001: -20..20 takes up to 20, and -5..5 still takes -10..10).
    UnionWithDevice,
    /// A range outside the device's is refused at Start (-200077), and a write may reach only the channel's range (the
    /// simulated PCIe-6361).
    WithinDevice,
}

/// What a device's analog outputs can do.
#[derive(Debug, Clone, PartialEq)]
pub struct AnalogOutputProfile {
    pub channel_count: usize,
    pub min_volts: f64,
    pub max_volts: f64,
    pub range_rule: OutputRangeRule,
    /// Whether a timed generation refuses to start with nothing written (measured: -200462 on Dev1, none on Dev2).
    pub start_needs_data: bool,
}

/// The simulated devices, by name. A name is compared without regard to case, as DAQmx's are.
#[derive(Debug, Clone)]
pub struct DeviceTable {
    devices: Vec<(String, DeviceProfile)>,
}

impl DeviceTable {
    pub fn new(devices: Vec<(String, DeviceProfile)>) -> Self {
        Self { devices }
    }

    /// The two devices LabVIEW's MAX offered as simulated (`Dev1` and `Dev2`).
    ///
    /// `Dev1` has the limits measured on the simulated USB-6001: eight analog inputs (only `ai0` and the absence of
    /// `ai99` were measured, so the count is unverified), +-10 V, a maximum rate of 20 kS/s and a minimum of
    /// 18.626450e-3 S/s. `Dev2`'s inputs were not measured: they are Solder's own, with more channels and a higher rate.
    /// Both have two analog outputs of +-10 V, measured (`labview-captures/reports/2026-11-15-daqmx-ao.md`); Dev2's
    /// other range, +-5 V, changes nothing a simulated write does, so it is not kept. Their digital ports were measured
    /// (`2026-11-15-daqmx-dio.md` §1): Dev1 has 8, 4 and 1 lines, untimed; Dev2 three ports of 8, up to 10 MHz. Their
    /// start triggers: PFI0 and PFI1 on Dev1, PFI0 to PFI39 on Dev2 (`2026-11-15-daqmx-trigger.md` §2).
    pub fn simulated() -> Self {
        let usb_6001_outputs = AnalogOutputProfile { channel_count: 2, min_volts: -10.0, max_volts: 10.0, range_rule: OutputRangeRule::UnionWithDevice, start_needs_data: true };
        let pcie_6361_outputs = AnalogOutputProfile { channel_count: 2, min_volts: -10.0, max_volts: 10.0, range_rule: OutputRangeRule::WithinDevice, start_needs_data: false };
        let usb_6001_digital = DigitalProfile { lines_per_port: vec![8, 4, 1], max_rate: None };
        let pcie_6361_digital = DigitalProfile { lines_per_port: vec![8, 8, 8], max_rate: Some(10.0e6) };
        // -89136 (route not supported) on Dev1, -89125 (no trigger lines between the devices) on Dev2 (§2).
        let usb_6001_triggers = TriggerProfile { pfi_count: 2, other_device_code: -89136 };
        let pcie_6361_triggers = TriggerProfile { pfi_count: 40, other_device_code: -89125 };
        Self::new(vec![
            ("Dev1".to_string(), DeviceProfile { ai_channel_count: 8, ai_min_volts: -10.0, ai_max_volts: 10.0, ai_max_rate: 20.0e3, ai_min_rate: 18.626450e-3, analog_output: usb_6001_outputs, digital: usb_6001_digital, triggers: usb_6001_triggers }),
            ("Dev2".to_string(), DeviceProfile { ai_channel_count: 16, ai_min_volts: -10.0, ai_max_volts: 10.0, ai_max_rate: 250.0e3, ai_min_rate: 18.626450e-3, analog_output: pcie_6361_outputs, digital: pcie_6361_digital, triggers: pcie_6361_triggers }),
        ])
    }

    pub fn names(&self) -> Vec<String> {
        self.devices.iter().map(|(name, _)| name.clone()).collect()
    }

    /// The device's canonical name and profile.
    pub fn find(&self, name: &str) -> Option<(&str, &DeviceProfile)> {
        self.devices.iter().find(|(known, _)| known.eq_ignore_ascii_case(name)).map(|(known, profile)| (known.as_str(), profile))
    }
}
