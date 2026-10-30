//! VISA resource strings. Only the transports Solder speaks are recognized; any other string is not a
//! resource here, and VISA answers it as one that is not found (measured for `COM1`, `ASRL1` and
//! `ASRL::INSTR` with no port: `labview-captures/reports/2026-10-30-visa-serial-no-port.md`).

use crate::status::Status;

/// Where a session goes, read from its resource string.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ResourceAddress {
    /// `TCPIP[board]::host::port::SOCKET`: a raw TCP socket.
    TcpSocket { host: String, port: u16 },
    /// `ASRL<board>::INSTR`: a serial port by its number, which the port table turns into a device (DT-070 §2).
    SerialNumber(u32),
    /// `ASRL<device path>::INSTR`, such as `ASRL/dev/ttyUSB0::INSTR`: a serial port by its device.
    SerialDevice(String),
}

const SEPARATOR: &str = "::";
const SERIAL_INTERFACE: &str = "ASRL";

impl ResourceAddress {
    /// Reads a resource string. Keywords are matched without regard to case, as VISA does.
    pub fn parse(resource: &str) -> Result<ResourceAddress, Status> {
        let parts: Vec<&str> = resource.trim().split(SEPARATOR).collect();
        match parts.as_slice() {
            [interface, host, port, class] if is_tcpip_interface(interface) && class.eq_ignore_ascii_case("SOCKET") => {
                let port = port.parse::<u16>().map_err(|_| Status::ERROR_RESOURCE_NOT_FOUND)?;
                if host.is_empty() {
                    return Err(Status::ERROR_RESOURCE_NOT_FOUND);
                }
                Ok(ResourceAddress::TcpSocket { host: host.to_string(), port })
            }
            [interface, class] if class.eq_ignore_ascii_case("INSTR") => parse_serial_interface(interface),
            _ => Err(Status::ERROR_RESOURCE_NOT_FOUND),
        }
    }

    /// The resource string as VISA writes it back: keywords in capitals (measured: `asrl1::instr` comes out
    /// of VISA Open as `ASRL1::INSTR`).
    pub fn canonical(&self) -> String {
        match self {
            ResourceAddress::TcpSocket { host, port } => format!("TCPIP0::{host}::{port}::SOCKET"),
            ResourceAddress::SerialNumber(number) => format!("{SERIAL_INTERFACE}{number}::INSTR"),
            ResourceAddress::SerialDevice(device) => format!("{SERIAL_INTERFACE}{device}::INSTR"),
        }
    }

    pub fn is_serial(&self) -> bool {
        !matches!(self, ResourceAddress::TcpSocket { .. })
    }
}

/// `ASRL` followed by a board number or by a device path.
fn parse_serial_interface(interface: &str) -> Result<ResourceAddress, Status> {
    let prefix = interface.get(..SERIAL_INTERFACE.len()).ok_or(Status::ERROR_RESOURCE_NOT_FOUND)?;
    if !prefix.eq_ignore_ascii_case(SERIAL_INTERFACE) {
        return Err(Status::ERROR_RESOURCE_NOT_FOUND);
    }
    let rest = &interface[SERIAL_INTERFACE.len()..];
    if rest.starts_with('/') {
        return Ok(ResourceAddress::SerialDevice(rest.to_string()));
    }
    if rest.is_empty() || !rest.chars().all(|character| character.is_ascii_digit()) {
        return Err(Status::ERROR_RESOURCE_NOT_FOUND);
    }
    rest.parse().map(ResourceAddress::SerialNumber).map_err(|_| Status::ERROR_RESOURCE_NOT_FOUND)
}

/// `TCPIP` followed by an optional board number.
fn is_tcpip_interface(interface: &str) -> bool {
    const TCPIP: &str = "TCPIP";
    interface.len() >= TCPIP.len()
        && interface[..TCPIP.len()].eq_ignore_ascii_case(TCPIP)
        && interface[TCPIP.len()..].chars().all(|character| character.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_socket_with_and_without_board_number() {
        let expected = ResourceAddress::TcpSocket { host: "10.0.2.2".into(), port: 5125 };
        assert_eq!(ResourceAddress::parse("TCPIP0::10.0.2.2::5125::SOCKET"), Ok(expected.clone()));
        assert_eq!(ResourceAddress::parse("tcpip::10.0.2.2::5125::socket"), Ok(expected));
    }

    #[test]
    fn reads_a_serial_port_by_number_or_by_device() {
        assert_eq!(ResourceAddress::parse("ASRL1::INSTR"), Ok(ResourceAddress::SerialNumber(1)));
        assert_eq!(ResourceAddress::parse("asrl10::instr"), Ok(ResourceAddress::SerialNumber(10)));
        assert_eq!(ResourceAddress::parse("ASRL/dev/ttyUSB0::INSTR"), Ok(ResourceAddress::SerialDevice("/dev/ttyUSB0".into())));
    }

    #[test]
    fn writes_a_serial_resource_back_in_capitals() {
        assert_eq!(ResourceAddress::parse("asrl1::instr").unwrap().canonical(), "ASRL1::INSTR");
    }

    #[test]
    fn what_is_not_a_resource_is_not_found() {
        let not_resources = [
            "", "TCPIP0::host::SOCKET", "TCPIP0::host::port::SOCKET", "TCPIPX::host::1::SOCKET", "TCPIP0::::1::SOCKET",
            "ASRL1", "ASRL::INSTR", "COM1", "ASRLx::INSTR", "AS::INSTR",
        ];
        for resource in not_resources {
            assert_eq!(ResourceAddress::parse(resource), Err(Status::ERROR_RESOURCE_NOT_FOUND), "{resource}");
        }
    }
}
