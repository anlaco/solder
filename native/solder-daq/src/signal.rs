//! What a simulated analog input reads: a sine with noise, as NI's simulated devices give (measured in LabVIEW,
//! `labview-captures/reports/2026-11-06-daqmx-read-write.md`).
//!
//! The noise is a pure function of the channel and the sample's position, so the same acquisition gives the same numbers
//! however it is read in pieces, and the tests are repeatable.

/// The sine's amplitude (measured: about 4.84 V).
pub const SIMULATED_AMPLITUDE_VOLTS: f64 = 4.84;
/// The noise's rms (measured: about 0.09 V).
pub const NOISE_RMS_VOLTS: f64 = 0.09;
/// The period of a continuous acquisition, in samples. UNVERIFIED: inferred from LabVIEW's readings (about
/// `5 * sin(2*pi*n/10000)`), never seen over a whole period.
pub const CONTINUOUS_PERIOD_SAMPLES: u64 = 10_000;

/// A hash of a channel's identity, so that two channels do not share their noise.
pub fn channel_seed(device: &str, index: usize) -> u64 {
    let mut seed: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in device.bytes().map(|byte| byte.to_ascii_lowercase()).chain(index.to_le_bytes()) {
        seed = (seed ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3);
    }
    seed
}

/// SplitMix64: a small, well-mixed hash of one number.
fn mix(value: u64) -> u64 {
    let mut mixed = value.wrapping_add(0x9e37_79b9_7f4a_7c15);
    mixed = (mixed ^ (mixed >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    mixed ^ (mixed >> 31)
}

/// Noise uniform between -1 and 1 for the sample at `position`.
fn uniform_noise(seed: u64, position: u64) -> f64 {
    let bits = mix(seed ^ position.wrapping_mul(0x9e37_79b9_7f4a_7c15)) >> 11;
    bits as f64 / (1u64 << 52) as f64 - 1.0
}

/// The voltage of the sample at `position`, in an acquisition whose sine has `period_samples` samples to a cycle.
pub fn sample(seed: u64, position: u64, period_samples: u64) -> f64 {
    let phase = std::f64::consts::TAU * position as f64 / period_samples.max(1) as f64;
    // A uniform noise between -a and a has an rms of a / sqrt(3).
    let noise = uniform_noise(seed, position) * NOISE_RMS_VOLTS * 3f64.sqrt();
    SIMULATED_AMPLITUDE_VOLTS * phase.sin() + noise
}
