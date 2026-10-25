//! One open session: its connection, its attributes and the bytes received but not read yet.

use std::io::{ErrorKind, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

use crate::resource::ResourceAddress;
use crate::status::Status;

/// Timeout Value of a new session (measured on a SOCKET resource: 2000 ms).
const DEFAULT_TIMEOUT: Duration = Duration::from_millis(2000);
/// Termination Character of a new session (measured: 10, a line feed).
const DEFAULT_TERMINATION_CHARACTER: u8 = b'\n';
/// How much is asked of the transport at a time; what goes beyond a Read waits for the next one.
const RECEIVE_CHUNK_BYTES: usize = 4096;

/// The session attributes Solder implements, with LabVIEW's names in the comments.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Attributes {
    /// General Settings ▸ Timeout Value.
    pub timeout: Duration,
    /// Message Based Settings ▸ Termination Character.
    pub termination_character: u8,
    /// Message Based Settings ▸ Termination Character Enable (measured FALSE by default on a socket).
    pub termination_character_enabled: bool,
}

impl Default for Attributes {
    fn default() -> Self {
        Attributes {
            timeout: DEFAULT_TIMEOUT,
            termination_character: DEFAULT_TERMINATION_CHARACTER,
            termination_character_enabled: false,
        }
    }
}

/// The attributes a Property Node writes; those left `None` keep their value.
#[derive(Clone, Copy, Debug, Default)]
pub struct AttributesChange {
    pub timeout: Option<Duration>,
    pub termination_character: Option<u8>,
    pub termination_character_enabled: Option<bool>,
}

/// What VISA Read gives: the bytes it got, even when it ends in an error (measured: a timeout still
/// returns what arrived), and why it stopped.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReadResult {
    pub data: Vec<u8>,
    pub status: Status,
}

/// What VISA Write gives: how many bytes left, and its status.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WriteResult {
    pub count: usize,
    pub status: Status,
}

pub(crate) struct Session {
    stream: TcpStream,
    attributes: Attributes,
    received: Vec<u8>,
}

impl Session {
    pub(crate) fn open(address: &ResourceAddress) -> Result<Session, Status> {
        let ResourceAddress::TcpSocket { host, port } = address;
        let candidates = (host.as_str(), *port).to_socket_addrs().map_err(|_| Status::ERROR_RESOURCE_NOT_FOUND)?;
        // Unverified: a refused Open took about 2 s in LabVIEW, the length of the default timeout; here a
        // refusal answers at once and only an unanswered connection waits that long.
        let stream = candidates
            .into_iter()
            .find_map(|candidate| TcpStream::connect_timeout(&candidate, DEFAULT_TIMEOUT).ok())
            .ok_or(Status::ERROR_RESOURCE_NOT_FOUND)?;
        // Instruments talk in short requests and answers: each one goes out at once.
        stream.set_nodelay(true).map_err(|_| Status::ERROR_IO)?;
        Ok(Session { stream, attributes: Attributes::default(), received: Vec::new() })
    }

    pub(crate) fn attributes(&self) -> Attributes {
        self.attributes
    }

    pub(crate) fn change_attributes(&mut self, change: AttributesChange) {
        let attributes = &mut self.attributes;
        attributes.timeout = change.timeout.unwrap_or(attributes.timeout);
        attributes.termination_character = change.termination_character.unwrap_or(attributes.termination_character);
        attributes.termination_character_enabled =
            change.termination_character_enabled.unwrap_or(attributes.termination_character_enabled);
    }

    pub(crate) fn write(&mut self, data: &[u8]) -> WriteResult {
        let deadline = Instant::now() + self.attributes.timeout;
        let mut sent = 0;
        while sent < data.len() {
            let Some(remaining) = time_left(deadline) else {
                return WriteResult { count: sent, status: Status::ERROR_TIMEOUT };
            };
            if self.stream.set_write_timeout(Some(remaining)).is_err() {
                return WriteResult { count: sent, status: Status::ERROR_IO };
            }
            match self.stream.write(&data[sent..]) {
                Ok(0) => return WriteResult { count: sent, status: Status::ERROR_CONNECTION_LOST },
                Ok(written) => sent += written,
                Err(error) if error.kind() == ErrorKind::Interrupted => {}
                Err(error) => return WriteResult { count: sent, status: status_of_transport_error(error.kind()) },
            }
        }
        WriteResult { count: sent, status: Status::SUCCESS }
    }

    /// Reads until `count` bytes, the termination character when it is enabled, or the timeout,
    /// whichever comes first.
    pub(crate) fn read(&mut self, count: usize) -> ReadResult {
        let deadline = Instant::now() + self.attributes.timeout;
        loop {
            if let Some(result) = self.take_complete_read(count) {
                return result;
            }
            let Some(remaining) = time_left(deadline) else {
                return self.take_everything_received(Status::ERROR_TIMEOUT);
            };
            if let Err(status) = self.receive(remaining) {
                return self.take_everything_received(status);
            }
        }
    }

    /// The read that the bytes already received complete, if they do. Unverified: when the
    /// termination character is also the last byte of the count, which code VISA gives.
    fn take_complete_read(&mut self, count: usize) -> Option<ReadResult> {
        let window = count.min(self.received.len());
        if self.attributes.termination_character_enabled {
            let terminator = self.attributes.termination_character;
            if let Some(position) = self.received[..window].iter().position(|&byte| byte == terminator) {
                return Some(self.take(position + 1, Status::SUCCESS_TERM_CHAR));
            }
        }
        (self.received.len() >= count).then(|| self.take(count, Status::SUCCESS_MAX_COUNT))
    }

    fn take_everything_received(&mut self, status: Status) -> ReadResult {
        self.take(self.received.len(), status)
    }

    fn take(&mut self, length: usize, status: Status) -> ReadResult {
        ReadResult { data: self.received.drain(..length).collect(), status }
    }

    /// Waits up to `patience` for more bytes and keeps them.
    fn receive(&mut self, patience: Duration) -> Result<(), Status> {
        self.stream.set_read_timeout(Some(patience)).map_err(|_| Status::ERROR_IO)?;
        let mut chunk = [0u8; RECEIVE_CHUNK_BYTES];
        match self.stream.read(&mut chunk) {
            Ok(0) => Err(Status::ERROR_CONNECTION_LOST),
            Ok(length) => {
                self.received.extend_from_slice(&chunk[..length]);
                Ok(())
            }
            Err(error) if error.kind() == ErrorKind::Interrupted => Ok(()),
            Err(error) => Err(status_of_transport_error(error.kind())),
        }
    }
}

/// What is left until `deadline`, or `None` once it has passed.
fn time_left(deadline: Instant) -> Option<Duration> {
    let remaining = deadline.saturating_duration_since(Instant::now());
    (!remaining.is_zero()).then_some(remaining)
}

fn status_of_transport_error(kind: ErrorKind) -> Status {
    match kind {
        // A socket's timeout shows as one or the other depending on the operating system.
        ErrorKind::WouldBlock | ErrorKind::TimedOut => Status::ERROR_TIMEOUT,
        ErrorKind::ConnectionReset | ErrorKind::ConnectionAborted | ErrorKind::BrokenPipe => Status::ERROR_CONNECTION_LOST,
        _ => Status::ERROR_IO,
    }
}
