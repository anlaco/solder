//! Serial ports (DT-070): the line settings VISA gives them, checked as NI-VISA checks them, and the device
//! underneath, in our own code for each system: termios on Linux and macOS, the Win32 communications API on
//! Windows. Measured in LabVIEW 2026 Q3 with NI-VISA 26.5 against a 16550 in the virtual machine
//! (`labview-captures/reports/2026-10-30-visa-serial-com1.md`).

#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

#[cfg(unix)]
pub(crate) use unix::Device;
#[cfg(windows)]
pub(crate) use windows::Device;

use crate::status::Status;

/// Serial Settings ▸ Parity, with VISA's values.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Parity {
    None = 0,
    Odd = 1,
    Even = 2,
    Mark = 3,
    Space = 4,
}

/// Serial Settings ▸ Stop Bits, with VISA's values: tenths of a bit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StopBits {
    One = 10,
    OneAndHalf = 15,
    Two = 20,
}

/// Serial Settings ▸ Flow Control: VISA's value is a set of these bits.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct FlowControl {
    pub xon_xoff: bool,
    pub rts_cts: bool,
    pub dtr_dsr: bool,
}

const FLOW_XON_XOFF: u16 = 1;
const FLOW_RTS_CTS: u16 = 2;
const FLOW_DTR_DSR: u16 = 4;
/// The largest value of the flow control ring of VISA Configure Serial Port (XON/XOFF & DTR/DSR); the
/// combinations beyond it are not offered there and are refused here (9 measured; 6 and 7 unverified).
const LARGEST_FLOW_CONTROL: u16 = FLOW_XON_XOFF | FLOW_DTR_DSR;

/// What a line can carry per character (measured: 3 and 9 are refused, 7 and 8 work; 5 and 6 unverified).
const DATA_BITS: std::ops::RangeInclusive<u16> = 5..=8;

/// How a serial port talks: what VISA Configure Serial Port sets, all but the timeout and the termination.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LineSettings {
    pub baud_rate: u32,
    pub data_bits: u16,
    pub parity: Parity,
    pub stop_bits: StopBits,
    pub flow_control: FlowControl,
}

impl Default for LineSettings {
    /// A new session's settings (measured on ASRL1: 9600, 8, none, 1 bit, no flow control).
    fn default() -> Self {
        LineSettings { baud_rate: 9600, data_bits: 8, parity: Parity::None, stop_bits: StopBits::One, flow_control: FlowControl::default() }
    }
}

/// Every value a VISA attribute refuses is VI_ERROR_NSUP_ATTR_STATE (measured for baud rate, data bits,
/// stop bits and flow control).
const REFUSED: Status = Status::ERROR_ATTRIBUTE_STATE_NOT_SUPPORTED;

/// A baud rate of 0 is refused; any other is taken, even 7 (measured), and the device decides what it does.
pub fn baud_rate_from_visa(value: u32) -> Result<u32, Status> {
    if value == 0 { Err(REFUSED) } else { Ok(value) }
}

pub fn data_bits_from_visa(value: u16) -> Result<u16, Status> {
    if DATA_BITS.contains(&value) { Ok(value) } else { Err(REFUSED) }
}

pub fn parity_from_visa(value: u16) -> Result<Parity, Status> {
    Ok(match value {
        0 => Parity::None,
        1 => Parity::Odd,
        2 => Parity::Even,
        3 => Parity::Mark,
        4 => Parity::Space,
        _ => return Err(REFUSED),
    })
}

pub fn stop_bits_from_visa(value: u16) -> Result<StopBits, Status> {
    Ok(match value {
        10 => StopBits::One,
        15 => StopBits::OneAndHalf,
        20 => StopBits::Two,
        _ => return Err(REFUSED),
    })
}

pub fn flow_control_from_visa(value: u16) -> Result<FlowControl, Status> {
    if value > LARGEST_FLOW_CONTROL {
        return Err(REFUSED);
    }
    Ok(FlowControl { xon_xoff: value & FLOW_XON_XOFF != 0, rts_cts: value & FLOW_RTS_CTS != 0, dtr_dsr: value & FLOW_DTR_DSR != 0 })
}

impl FlowControl {
    pub fn to_visa(self) -> u16 {
        u16::from(self.xon_xoff) * FLOW_XON_XOFF + u16::from(self.rts_cts) * FLOW_RTS_CTS + u16::from(self.dtr_dsr) * FLOW_DTR_DSR
    }
}

/// Serial Settings ▸ End Mode for Reads, with VISA's values.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EndMode {
    None = 0,
    LastBit = 1,
    TermChar = 2,
}

pub fn end_mode_from_visa(value: u16) -> Result<EndMode, Status> {
    Ok(match value {
        0 => EndMode::None,
        1 => EndMode::LastBit,
        2 => EndMode::TermChar,
        _ => return Err(REFUSED),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_the_values_ni_visa_refuses() {
        assert_eq!(baud_rate_from_visa(0), Err(REFUSED));
        assert_eq!(baud_rate_from_visa(7), Ok(7));
        assert_eq!(data_bits_from_visa(3), Err(REFUSED));
        assert_eq!(data_bits_from_visa(9), Err(REFUSED));
        assert_eq!(data_bits_from_visa(7), Ok(7));
        assert_eq!(stop_bits_from_visa(12), Err(REFUSED));
        assert_eq!(flow_control_from_visa(9), Err(REFUSED));
    }

    #[test]
    fn takes_every_flow_control_of_the_configure_ring() {
        for value in 0..=LARGEST_FLOW_CONTROL {
            assert_eq!(flow_control_from_visa(value).map(FlowControl::to_visa), Ok(value));
        }
    }
}
