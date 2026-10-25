//! VISA's completion and error codes, with the values of the VISA standard (`visa.h`): zero is
//! success, a positive code is a warning that still delivers its data, a negative one is an error.

/// The outcome of one VISA operation, as LabVIEW shows it in the error cluster's code.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Status(pub i32);

impl Status {
    pub const SUCCESS: Status = Status(0);
    /// Read stopped at the termination character (measured: 1073676293).
    pub const SUCCESS_TERM_CHAR: Status = Status(0x3FFF_0005);
    /// Read stopped because it got the byte count asked for (measured: 1073676294).
    pub const SUCCESS_MAX_COUNT: Status = Status(0x3FFF_0006);
    /// The session handed in is not open (measured: -1073807346).
    pub const ERROR_INVALID_OBJECT: Status = Status(0xBFFF_000E_u32 as i32);
    /// Nothing answers at the resource (measured: -1073807343, a socket with nothing listening).
    pub const ERROR_RESOURCE_NOT_FOUND: Status = Status(0xBFFF_0011_u32 as i32);
    /// The resource string does not follow VISA's syntax (unverified in LabVIEW).
    pub const ERROR_INVALID_RESOURCE_NAME: Status = Status(0xBFFF_0012_u32 as i32);
    /// The operation did not finish within the session's timeout (measured: -1073807339).
    pub const ERROR_TIMEOUT: Status = Status(0xBFFF_0015_u32 as i32);
    /// The transport failed in a way VISA has no closer code for (unverified in LabVIEW).
    pub const ERROR_IO: Status = Status(0xBFFF_003E_u32 as i32);
    /// The instrument closed the connection (unverified in LabVIEW).
    pub const ERROR_CONNECTION_LOST: Status = Status(0xBFFF_00A6_u32 as i32);

    pub fn is_error(self) -> bool {
        self.0 < 0
    }
}
