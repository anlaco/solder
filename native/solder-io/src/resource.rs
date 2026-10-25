//! VISA resource strings. Only the transports Solder speaks are recognized; the rest of VISA's
//! syntax is not a resource here yet.

use crate::status::Status;

/// Where a session goes, read from its resource string.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ResourceAddress {
    /// `TCPIP[board]::host::port::SOCKET`: a raw TCP socket.
    TcpSocket { host: String, port: u16 },
}

const SEPARATOR: &str = "::";

impl ResourceAddress {
    /// Reads a resource string. Keywords are matched without regard to case, as VISA does.
    pub fn parse(resource: &str) -> Result<ResourceAddress, Status> {
        let parts: Vec<&str> = resource.trim().split(SEPARATOR).collect();
        match parts.as_slice() {
            [interface, host, port, class] if is_tcpip_interface(interface) && class.eq_ignore_ascii_case("SOCKET") => {
                let port = port.parse::<u16>().map_err(|_| Status::ERROR_INVALID_RESOURCE_NAME)?;
                if host.is_empty() {
                    return Err(Status::ERROR_INVALID_RESOURCE_NAME);
                }
                Ok(ResourceAddress::TcpSocket { host: host.to_string(), port })
            }
            _ => Err(Status::ERROR_INVALID_RESOURCE_NAME),
        }
    }
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
    fn refuses_what_is_not_a_socket_resource() {
        for resource in ["", "TCPIP0::host::SOCKET", "TCPIP0::host::port::SOCKET", "TCPIPX::host::1::SOCKET", "TCPIP0::::1::SOCKET"] {
            assert_eq!(ResourceAddress::parse(resource), Err(Status::ERROR_INVALID_RESOURCE_NAME), "{resource}");
        }
    }
}
