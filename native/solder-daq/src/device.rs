//! The devices the engine knows and what each can do. Their capabilities are data, so that errors such as a rate above
//! the maximum come from them and not from code (DT-076 §7). Profiles are Solder's own, not NI's models.

/// What an analog-input device can do.
#[derive(Debug, Clone, PartialEq)]
pub struct DeviceProfile {
    pub ai_channel_count: usize,
    pub ai_min_volts: f64,
    pub ai_max_volts: f64,
    pub ai_max_rate: f64,
    pub ai_min_rate: f64,
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
    /// 18.626450e-3 S/s. `Dev2` was not measured at all: it is Solder's own profile, with more channels and a higher rate.
    pub fn simulated() -> Self {
        Self::new(vec![
            ("Dev1".to_string(), DeviceProfile { ai_channel_count: 8, ai_min_volts: -10.0, ai_max_volts: 10.0, ai_max_rate: 20.0e3, ai_min_rate: 18.626450e-3 }),
            ("Dev2".to_string(), DeviceProfile { ai_channel_count: 16, ai_min_volts: -10.0, ai_max_volts: 10.0, ai_max_rate: 250.0e3, ai_min_rate: 18.626450e-3 }),
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
