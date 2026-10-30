//! One open session: its connection, its attributes and the bytes received but not read yet.

use std::io::{ErrorKind, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use crate::serial::{
    Device, EndMode, LineSettings, baud_rate_from_visa, data_bits_from_visa, end_mode_from_visa, flow_control_from_visa,
    parity_from_visa, stop_bits_from_visa,
};
use crate::status::Status;

/// A session as VISA hands it out: a number that names it until it is closed.
pub type SessionId = u32;

/// Timeout Value of a new session (measured: 2000 ms on a SOCKET resource and on ASRL1).
const DEFAULT_TIMEOUT: Duration = Duration::from_millis(2000);
/// Termination Character of a new session (measured: 10, a line feed).
const DEFAULT_TERMINATION_CHARACTER: u8 = b'\n';
/// How much is asked of the transport at a time; what goes beyond a Read waits for the next one.
const RECEIVE_CHUNK_BYTES: usize = 4096;
/// The longest a serial wait holds its port, so a Write of another session on the same port is not held
/// back for a whole timeout.
const SERIAL_SLICE: Duration = Duration::from_millis(20);

/// The session attributes Solder implements, with LabVIEW's names in the comments.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Attributes {
    /// General Settings ▸ Timeout Value.
    pub timeout: Duration,
    /// Message Based Settings ▸ Termination Character.
    pub termination_character: u8,
    /// Message Based Settings ▸ Termination Character Enable (measured FALSE by default on a socket and on ASRL1).
    pub termination_character_enabled: bool,
    /// Serial Settings, on a serial session only.
    pub serial: Option<SerialAttributes>,
}

/// Serial Settings ▸ Baud Rate, Data Bits, Parity, Stop Bits, Flow Control and End Mode for Reads.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SerialAttributes {
    /// Of the port: every session on it shares them.
    pub line: LineSettings,
    /// Of the session (measured: TermChar on a new session, so a Read stops at the line feed although
    /// Termination Character Enable is false).
    pub end_mode_for_reads: EndMode,
}

/// The attributes a Property Node writes, as VISA's values; those left `None` keep their value. They are
/// written in the order of VISA Configure Serial Port's rows, and the first one refused stops the rest.
#[derive(Clone, Copy, Debug, Default)]
pub struct AttributesChange {
    pub timeout: Option<Duration>,
    pub baud_rate: Option<u32>,
    pub data_bits: Option<u16>,
    pub stop_bits: Option<u16>,
    pub parity: Option<u16>,
    pub termination_character_enabled: Option<bool>,
    pub termination_character: Option<u8>,
    pub flow_control: Option<u16>,
    pub end_mode_for_reads: Option<u16>,
}

impl AttributesChange {
    fn changes_the_line(&self) -> bool {
        self.baud_rate.is_some() || self.data_bits.is_some() || self.stop_bits.is_some() || self.parity.is_some() || self.flow_control.is_some()
    }

    fn touches_serial_settings(&self) -> bool {
        self.changes_the_line() || self.end_mode_for_reads.is_some()
    }
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

/// A serial port as the sessions on it share it: one device, its line, and the sessions open on it, the
/// oldest first. Only the oldest receives (measured: a second session on ASRL1 got nothing of an answer to
/// the first one's Write; where NI-VISA puts those bytes is unverified).
pub(crate) struct SerialPort {
    device: Device,
    line: LineSettings,
    sessions: Vec<SessionId>,
}

pub(crate) type SharedPort = Arc<Mutex<SerialPort>>;

impl SerialPort {
    /// Opens a device with a new session's line (measured: what a session set does not survive its Close).
    pub(crate) fn open(device: &str) -> Result<SharedPort, Status> {
        let mut device = Device::open(device)?;
        let line = LineSettings::default();
        device.apply(&line).map_err(|_| Status::ERROR_RESOURCE_NOT_FOUND)?;
        Ok(Arc::new(Mutex::new(SerialPort { device, line, sessions: Vec::new() })))
    }
}

fn lock(port: &SharedPort) -> std::sync::MutexGuard<'_, SerialPort> {
    port.lock().unwrap_or_else(PoisonError::into_inner)
}

enum Connection {
    Socket(TcpStream),
    Serial { port: SharedPort, id: SessionId },
}

pub(crate) struct Session {
    connection: Connection,
    timeout: Duration,
    termination_character: u8,
    termination_character_enabled: bool,
    end_mode_for_reads: EndMode,
    received: Vec<u8>,
}

impl Session {
    fn with(connection: Connection) -> Session {
        Session {
            connection,
            timeout: DEFAULT_TIMEOUT,
            termination_character: DEFAULT_TERMINATION_CHARACTER,
            termination_character_enabled: false,
            end_mode_for_reads: EndMode::TermChar,
            received: Vec::new(),
        }
    }

    pub(crate) fn open_socket(host: &str, port: u16) -> Result<Session, Status> {
        let candidates = (host, port).to_socket_addrs().map_err(|_| Status::ERROR_RESOURCE_NOT_FOUND)?;
        // Unverified: a refused Open took about 2 s in LabVIEW, the length of the default timeout; here a
        // refusal answers at once and only an unanswered connection waits that long.
        let stream = candidates
            .into_iter()
            .find_map(|candidate| TcpStream::connect_timeout(&candidate, DEFAULT_TIMEOUT).ok())
            .ok_or(Status::ERROR_RESOURCE_NOT_FOUND)?;
        // Instruments talk in short requests and answers: each one goes out at once.
        stream.set_nodelay(true).map_err(|_| Status::ERROR_IO)?;
        Ok(Session::with(Connection::Socket(stream)))
    }

    /// A session `id` on a serial port, which it shares with the sessions already open on it.
    pub(crate) fn open_serial(port: SharedPort, id: SessionId) -> Session {
        lock(&port).sessions.push(id);
        Session::with(Connection::Serial { port, id })
    }

    pub(crate) fn attributes(&self) -> Attributes {
        let serial = match &self.connection {
            Connection::Socket(_) => None,
            Connection::Serial { port, .. } => Some(SerialAttributes { line: lock(port).line, end_mode_for_reads: self.end_mode_for_reads }),
        };
        Attributes {
            timeout: self.timeout,
            termination_character: self.termination_character,
            termination_character_enabled: self.termination_character_enabled,
            serial,
        }
    }

    /// Writes the attributes in Configure Serial Port's order and stops at the first refused (measured: a
    /// socket takes the timeout and then refuses the baud rate).
    pub(crate) fn change_attributes(&mut self, change: AttributesChange) -> Status {
        if let Some(timeout) = change.timeout {
            self.timeout = timeout;
        }
        let Connection::Serial { port, .. } = &self.connection else {
            if change.touches_serial_settings() {
                return Status::ERROR_ATTRIBUTE_NOT_SUPPORTED;
            }
            self.change_termination(change);
            return Status::SUCCESS;
        };
        let mut port = lock(port);
        let mut line = port.line;
        let refused = (|| -> Result<(), Status> {
            if let Some(value) = change.baud_rate {
                line.baud_rate = baud_rate_from_visa(value)?;
            }
            if let Some(value) = change.data_bits {
                line.data_bits = data_bits_from_visa(value)?;
            }
            if let Some(value) = change.stop_bits {
                line.stop_bits = stop_bits_from_visa(value)?;
            }
            if let Some(value) = change.parity {
                line.parity = parity_from_visa(value)?;
            }
            Ok(())
        })()
        .err();
        // What was taken before a refusal stays taken, as each row of a Property Node is a write of its own.
        let applied = if line != port.line { port.device.apply(&line) } else { Ok(()) };
        if applied.is_ok() {
            port.line = line;
        }
        if let Some(status) = refused.or(applied.err()) {
            return status;
        }
        drop(port);
        self.change_termination(change);
        if let Some(value) = change.flow_control {
            let flow_control = match flow_control_from_visa(value) {
                Ok(flow_control) => flow_control,
                Err(status) => return status,
            };
            if let Err(status) = self.change_line(|line| line.flow_control = flow_control) {
                return status;
            }
        }
        if let Some(value) = change.end_mode_for_reads {
            match end_mode_from_visa(value) {
                Ok(end_mode) => self.end_mode_for_reads = end_mode,
                Err(status) => return status,
            }
        }
        Status::SUCCESS
    }

    fn change_termination(&mut self, change: AttributesChange) {
        self.termination_character_enabled = change.termination_character_enabled.unwrap_or(self.termination_character_enabled);
        self.termination_character = change.termination_character.unwrap_or(self.termination_character);
    }

    fn change_line(&mut self, edit: impl FnOnce(&mut LineSettings)) -> Result<(), Status> {
        let Connection::Serial { port, .. } = &self.connection else { return Err(Status::ERROR_ATTRIBUTE_NOT_SUPPORTED) };
        let mut port = lock(port);
        let mut line = port.line;
        edit(&mut line);
        port.device.apply(&line)?;
        port.line = line;
        Ok(())
    }

    /// Serial Settings ▸ Number of Bytes at Serial Port: what came and is not read yet (measured: 28 after an
    /// answer of 28 bytes, unread).
    pub(crate) fn bytes_at_port(&mut self) -> Result<usize, Status> {
        let Connection::Serial { port, .. } = &self.connection else { return Err(Status::ERROR_ATTRIBUTE_NOT_SUPPORTED) };
        Ok(self.received.len() + lock(port).device.bytes_waiting()?)
    }

    pub(crate) fn write(&mut self, data: &[u8]) -> WriteResult {
        let deadline = Instant::now() + self.timeout;
        let mut sent = 0;
        while sent < data.len() {
            let Some(remaining) = time_left(deadline) else {
                return WriteResult { count: sent, status: Status::ERROR_TIMEOUT };
            };
            match self.send(&data[sent..], remaining) {
                Ok(written) => sent += written,
                Err(status) => return WriteResult { count: sent, status },
            }
        }
        WriteResult { count: sent, status: Status::SUCCESS }
    }

    fn send(&mut self, data: &[u8], patience: Duration) -> Result<usize, Status> {
        match &mut self.connection {
            Connection::Socket(stream) => {
                stream.set_write_timeout(Some(patience)).map_err(|_| Status::ERROR_IO)?;
                match stream.write(data) {
                    Ok(0) => Err(Status::ERROR_CONNECTION_LOST),
                    Ok(written) => Ok(written),
                    // The deadline decides: Write gives the timeout once it has passed.
                    Err(error) if matches!(error.kind(), ErrorKind::Interrupted | ErrorKind::WouldBlock | ErrorKind::TimedOut) => Ok(0),
                    Err(error) => Err(status_of_transport_error(error.kind())),
                }
            }
            Connection::Serial { port, .. } => lock(port).device.send(data, patience.min(SERIAL_SLICE)),
        }
    }

    /// Reads until `count` bytes, the termination character, or the timeout, whichever comes first. A
    /// timeout of 0 still takes what has already arrived (measured: `XYZ` and the timeout at once).
    pub(crate) fn read(&mut self, count: usize) -> ReadResult {
        let deadline = Instant::now() + self.timeout;
        loop {
            if let Some(result) = self.take_complete_read(count) {
                return result;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            match self.receive(remaining) {
                Ok(true) => {}
                Ok(false) if remaining.is_zero() => return self.take_everything_received(Status::ERROR_TIMEOUT),
                Ok(false) => {}
                Err(status) => return self.take_everything_received(status),
            }
        }
    }

    /// The read that the bytes already received complete, if they do. On a serial port the termination
    /// character ends a Read when End Mode for Reads is TermChar, with no warning, or else when Termination
    /// Character Enable is true, with VI_SUCCESS_TERM_CHAR, as on a socket (measured). Unverified: when the
    /// termination character is also the last byte of the count, which code VISA gives.
    fn take_complete_read(&mut self, count: usize) -> Option<ReadResult> {
        let window = count.min(self.received.len());
        if let Some(status) = self.termination_status() {
            let terminator = self.termination_character;
            if let Some(position) = self.received[..window].iter().position(|&byte| byte == terminator) {
                return Some(self.take(position + 1, status));
            }
        }
        (self.received.len() >= count).then(|| self.take(count, Status::SUCCESS_MAX_COUNT))
    }

    /// What a Read stopped by the termination character answers, or `None` if it does not stop there.
    fn termination_status(&self) -> Option<Status> {
        let serial = matches!(self.connection, Connection::Serial { .. });
        if serial && self.end_mode_for_reads == EndMode::TermChar {
            Some(Status::SUCCESS)
        } else if self.termination_character_enabled {
            Some(Status::SUCCESS_TERM_CHAR)
        } else {
            None
        }
    }

    fn take_everything_received(&mut self, status: Status) -> ReadResult {
        self.take(self.received.len(), status)
    }

    fn take(&mut self, length: usize, status: Status) -> ReadResult {
        ReadResult { data: self.received.drain(..length).collect(), status }
    }

    /// Waits up to `patience` for more bytes and keeps them: whether any came.
    fn receive(&mut self, patience: Duration) -> Result<bool, Status> {
        let mut chunk = [0u8; RECEIVE_CHUNK_BYTES];
        let length = match &mut self.connection {
            Connection::Socket(stream) => receive_from_socket(stream, &mut chunk, patience)?,
            Connection::Serial { port, id } => {
                let patience = patience.min(SERIAL_SLICE);
                let mut shared = lock(port);
                if shared.sessions.first() != Some(id) {
                    drop(shared);
                    std::thread::sleep(patience);
                    return Ok(false);
                }
                shared.device.receive(&mut chunk, patience)?
            }
        };
        self.received.extend_from_slice(&chunk[..length]);
        Ok(length > 0)
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        if let Connection::Serial { port, id } = &self.connection {
            lock(port).sessions.retain(|open| open != id);
        }
    }
}

fn receive_from_socket(stream: &mut TcpStream, chunk: &mut [u8], patience: Duration) -> Result<usize, Status> {
    // A socket cannot wait for no time: a patience of zero only looks at what is there.
    let looking_only = patience.is_zero();
    if looking_only {
        stream.set_nonblocking(true).map_err(|_| Status::ERROR_IO)?;
    } else {
        stream.set_read_timeout(Some(patience)).map_err(|_| Status::ERROR_IO)?;
    }
    let outcome = stream.read(chunk);
    if looking_only {
        stream.set_nonblocking(false).map_err(|_| Status::ERROR_IO)?;
    }
    match outcome {
        Ok(0) => Err(Status::ERROR_CONNECTION_LOST),
        Ok(length) => Ok(length),
        Err(error) if matches!(error.kind(), ErrorKind::Interrupted | ErrorKind::WouldBlock | ErrorKind::TimedOut) => Ok(0),
        Err(error) => Err(status_of_transport_error(error.kind())),
    }
}

/// What is left until `deadline`, or `None` once it has passed.
fn time_left(deadline: Instant) -> Option<Duration> {
    let remaining = deadline.saturating_duration_since(Instant::now());
    (!remaining.is_zero()).then_some(remaining)
}

fn status_of_transport_error(kind: ErrorKind) -> Status {
    match kind {
        ErrorKind::ConnectionReset | ErrorKind::ConnectionAborted | ErrorKind::BrokenPipe => Status::ERROR_CONNECTION_LOST,
        _ => Status::ERROR_IO,
    }
}
