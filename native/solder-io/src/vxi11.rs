//! VXI-11, the protocol behind VISA's `TCPIP::host::INSTR` resources (DT-084): ONC RPC calls (RFC 5531) with XDR
//! data (RFC 4506) over TCP. The portmapper on port 111 says where the instrument's core channel listens; on it a
//! link is created to a LAN device name (`inst0`), and VISA Write and Read become `device_write` and
//! `device_read` calls. Written from the VXI-11 specification (VXIbus Consortium, rev. 1.0), Solder's own code.

use std::io::{ErrorKind, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

use crate::status::Status;

/// The portmapper's standard port; a test hands another (`ResourceManager::with_portmapper_port`).
pub const PORTMAPPER_PORT: u16 = 111;

const PORTMAPPER_PROGRAM: u32 = 100_000;
const PORTMAPPER_VERSION: u32 = 2;
const PORTMAPPER_GETPORT: u32 = 3;
const PROTOCOL_TCP: u32 = 6;

const CORE_PROGRAM: u32 = 0x0006_07AF;
const CORE_VERSION: u32 = 1;
const CREATE_LINK: u32 = 10;
const DEVICE_WRITE: u32 = 11;
const DEVICE_READ: u32 = 12;
const DESTROY_LINK: u32 = 23;

const RPC_VERSION: u32 = 2;
const MESSAGE_CALL: u32 = 0;
const MESSAGE_REPLY: u32 = 1;
const REPLY_ACCEPTED: u32 = 0;
const ACCEPT_SUCCESS: u32 = 0;
const AUTH_NONE: u32 = 0;
/// Record marking: the high bit of a fragment's header says it is the last one of the record.
const LAST_FRAGMENT: u32 = 0x8000_0000;

/// Device_Flags: the last chunk of a message (VISA's Send End Enable, on by default) and "stop at termChar".
const FLAG_END: u32 = 0x08;
const FLAG_TERMINATION_CHARACTER_SET: u32 = 0x80;
/// Device_ReadResp's reason bits: the count was reached, the termination character came, the message ended.
const REASON_REQUESTED_COUNT: u32 = 0x01;
const REASON_TERMINATION_CHARACTER: u32 = 0x02;
const REASON_END: u32 = 0x04;

/// Device_ErrorCode values VISA has a code of its own for.
const DEVICE_ERROR_NONE: u32 = 0;
const DEVICE_ERROR_LOCKED: u32 = 11;
const DEVICE_ERROR_IO_TIMEOUT: u32 = 15;

/// The smallest maxRecvSize the specification lets a device announce; used if one announces less.
const SMALLEST_RECEIVE_SIZE: u32 = 1024;
/// How long past the io_timeout the reply of a call is waited for: the device answers a timeout itself.
const REPLY_MARGIN: Duration = Duration::from_millis(1000);
/// How long a Close waits for destroy_link before it lets the connection go.
const DESTROY_PATIENCE: Duration = Duration::from_millis(500);

/// A link to a LAN device, open until it is dropped.
pub(crate) struct Vxi11Link {
    core: RpcChannel,
    link_id: u32,
    largest_chunk: usize,
}

/// What a device_read loop ends with: the bytes and VISA's status.
pub(crate) struct LinkRead {
    pub data: Vec<u8>,
    pub status: Status,
}

/// What a device_write loop ends with: the bytes the device took and VISA's status.
pub(crate) struct LinkWrite {
    pub count: usize,
    pub status: Status,
}

impl Vxi11Link {
    /// Asks the portmapper on `host` for the core channel, and links to `device_name` on it. Any failure to
    /// reach the device is VI_ERROR_RSRC_NFOUND (unverified in LabVIEW: what NI-VISA gives for each cause).
    pub(crate) fn open(host: &str, device_name: &str, portmapper_port: u16, patience: Duration) -> Result<Vxi11Link, Status> {
        let core_port = core_channel_port(host, portmapper_port, patience).ok_or(Status::ERROR_RESOURCE_NOT_FOUND)?;
        let mut core = RpcChannel::connect(host, core_port, patience).ok_or(Status::ERROR_RESOURCE_NOT_FOUND)?;
        let mut parameters = XdrWriter::default();
        parameters.u32(0); // clientId: only echoed in device interrupts, which Solder does not ask for.
        parameters.bool(false); // lockDevice
        parameters.u32(0); // lock_timeout
        parameters.opaque(device_name.as_bytes());
        let mut reply = core.call(CORE_PROGRAM, CORE_VERSION, CREATE_LINK, &parameters.0, patience).map_err(|_| Status::ERROR_RESOURCE_NOT_FOUND)?;
        let error = reply.u32().ok_or(Status::ERROR_RESOURCE_NOT_FOUND)?;
        let link_id = reply.u32().ok_or(Status::ERROR_RESOURCE_NOT_FOUND)?;
        let _abort_port = reply.u32();
        let max_receive_size = reply.u32().unwrap_or(SMALLEST_RECEIVE_SIZE).max(SMALLEST_RECEIVE_SIZE);
        if error != DEVICE_ERROR_NONE {
            return Err(Status::ERROR_RESOURCE_NOT_FOUND);
        }
        Ok(Vxi11Link { core, link_id, largest_chunk: max_receive_size as usize })
    }

    /// VISA Write: the data in chunks the device takes, END on the last one, within `timeout`.
    pub(crate) fn write(&mut self, data: &[u8], timeout: Duration) -> LinkWrite {
        let deadline = Instant::now() + timeout;
        let mut sent = 0;
        loop {
            let chunk_end = (sent + self.largest_chunk).min(data.len());
            let last = chunk_end == data.len();
            let remaining = deadline.saturating_duration_since(Instant::now());
            let mut parameters = XdrWriter::default();
            parameters.u32(self.link_id);
            parameters.u32(milliseconds(remaining));
            parameters.u32(0); // lock_timeout
            parameters.u32(if last { FLAG_END } else { 0 });
            parameters.opaque(&data[sent..chunk_end]);
            let mut reply = match self.core.call(CORE_PROGRAM, CORE_VERSION, DEVICE_WRITE, &parameters.0, remaining + REPLY_MARGIN) {
                Ok(reply) => reply,
                Err(status) => return LinkWrite { count: sent, status },
            };
            let (Some(error), Some(size)) = (reply.u32(), reply.u32()) else {
                return LinkWrite { count: sent, status: Status::ERROR_IO };
            };
            sent += (size as usize).min(chunk_end - sent);
            if error != DEVICE_ERROR_NONE {
                return LinkWrite { count: sent, status: status_of_device_error(error) };
            }
            if sent == data.len() {
                return LinkWrite { count: sent, status: Status::SUCCESS };
            }
            if remaining.is_zero() {
                return LinkWrite { count: sent, status: Status::ERROR_TIMEOUT };
            }
        }
    }

    /// VISA Read: device_read until `count` bytes, the end of the message, the termination character when
    /// `stop_at` holds one, or `timeout`. END gives VI_SUCCESS, the termination character
    /// VI_SUCCESS_TERM_CHAR and the count VI_SUCCESS_MAX_COUNT, VISA's codes for each (unverified in LabVIEW).
    pub(crate) fn read(&mut self, count: usize, stop_at: Option<u8>, timeout: Duration) -> LinkRead {
        let deadline = Instant::now() + timeout;
        let mut data = Vec::new();
        while data.len() < count {
            let remaining = deadline.saturating_duration_since(Instant::now());
            let mut parameters = XdrWriter::default();
            parameters.u32(self.link_id);
            parameters.u32(u32::try_from(count - data.len()).unwrap_or(u32::MAX));
            parameters.u32(milliseconds(remaining));
            parameters.u32(0); // lock_timeout
            parameters.u32(if stop_at.is_some() { FLAG_TERMINATION_CHARACTER_SET } else { 0 });
            parameters.u32(u32::from(stop_at.unwrap_or(0)));
            let mut reply = match self.core.call(CORE_PROGRAM, CORE_VERSION, DEVICE_READ, &parameters.0, remaining + REPLY_MARGIN) {
                Ok(reply) => reply,
                Err(status) => return LinkRead { data, status },
            };
            let (Some(error), Some(reason), Some(received)) = (reply.u32(), reply.u32(), reply.opaque()) else {
                return LinkRead { data, status: Status::ERROR_IO };
            };
            data.extend_from_slice(received);
            if error != DEVICE_ERROR_NONE {
                return LinkRead { data, status: status_of_device_error(error) };
            }
            if reason & REASON_END != 0 {
                return LinkRead { data, status: Status::SUCCESS };
            }
            if reason & REASON_TERMINATION_CHARACTER != 0 {
                return LinkRead { data, status: Status::SUCCESS_TERM_CHAR };
            }
            if reason & REASON_REQUESTED_COUNT == 0 && remaining.is_zero() {
                return LinkRead { data, status: Status::ERROR_TIMEOUT };
            }
        }
        LinkRead { data, status: Status::SUCCESS_MAX_COUNT }
    }
}

impl Drop for Vxi11Link {
    fn drop(&mut self) {
        let mut parameters = XdrWriter::default();
        parameters.u32(self.link_id);
        // The connection closes anyway; a device that does not answer keeps nothing of ours.
        let _ = self.core.call(CORE_PROGRAM, CORE_VERSION, DESTROY_LINK, &parameters.0, DESTROY_PATIENCE);
    }
}

fn status_of_device_error(error: u32) -> Status {
    match error {
        DEVICE_ERROR_IO_TIMEOUT => Status::ERROR_TIMEOUT,
        DEVICE_ERROR_LOCKED => Status::ERROR_RESOURCE_LOCKED,
        _ => Status::ERROR_IO,
    }
}

fn milliseconds(duration: Duration) -> u32 {
    u32::try_from(duration.as_millis()).unwrap_or(u32::MAX)
}

/// The core channel's port, as the portmapper on `host` gives it.
fn core_channel_port(host: &str, portmapper_port: u16, patience: Duration) -> Option<u16> {
    let mut portmapper = RpcChannel::connect(host, portmapper_port, patience)?;
    let mut parameters = XdrWriter::default();
    parameters.u32(CORE_PROGRAM);
    parameters.u32(CORE_VERSION);
    parameters.u32(PROTOCOL_TCP);
    parameters.u32(0);
    let mut reply = portmapper.call(PORTMAPPER_PROGRAM, PORTMAPPER_VERSION, PORTMAPPER_GETPORT, &parameters.0, patience).ok()?;
    let port = u16::try_from(reply.u32()?).ok()?;
    (port != 0).then_some(port)
}

/// One TCP connection that carries ONC RPC calls, each answered before the next goes.
struct RpcChannel {
    stream: TcpStream,
    next_transaction: u32,
}

impl RpcChannel {
    fn connect(host: &str, port: u16, patience: Duration) -> Option<RpcChannel> {
        let stream = (host, port).to_socket_addrs().ok()?.find_map(|candidate| TcpStream::connect_timeout(&candidate, patience).ok())?;
        stream.set_nodelay(true).ok()?;
        Some(RpcChannel { stream, next_transaction: 1 })
    }

    /// Sends one call and waits up to `patience` for its reply, whose results it hands back to be read.
    fn call(&mut self, program: u32, version: u32, procedure: u32, arguments: &[u8], patience: Duration) -> Result<XdrReader, Status> {
        let transaction = self.next_transaction;
        self.next_transaction = self.next_transaction.wrapping_add(1);
        let mut message = XdrWriter::default();
        for word in [transaction, MESSAGE_CALL, RPC_VERSION, program, version, procedure, AUTH_NONE, 0, AUTH_NONE, 0] {
            message.u32(word);
        }
        message.0.extend_from_slice(arguments);
        let header = LAST_FRAGMENT | u32::try_from(message.0.len()).map_err(|_| Status::ERROR_IO)?;
        let mut record = header.to_be_bytes().to_vec();
        record.extend_from_slice(&message.0);
        self.stream.set_write_timeout(Some(patience.max(Duration::from_millis(1)))).map_err(|_| Status::ERROR_IO)?;
        self.stream.write_all(&record).map_err(|error| status_of_transport_error(error.kind()))?;

        let deadline = Instant::now() + patience;
        loop {
            let mut reply = XdrReader::new(self.receive_record(deadline)?);
            // A reply to an earlier call that had given up waiting is let go.
            if reply.u32() != Some(transaction) {
                continue;
            }
            if reply.u32() != Some(MESSAGE_REPLY) || reply.u32() != Some(REPLY_ACCEPTED) {
                return Err(Status::ERROR_IO);
            }
            let _verifier_flavor = reply.u32();
            reply.opaque().ok_or(Status::ERROR_IO)?;
            if reply.u32() != Some(ACCEPT_SUCCESS) {
                return Err(Status::ERROR_IO);
            }
            return Ok(reply);
        }
    }

    /// One record, joined from its fragments.
    fn receive_record(&mut self, deadline: Instant) -> Result<Vec<u8>, Status> {
        let mut record = Vec::new();
        loop {
            let mut header = [0u8; 4];
            self.receive_exactly(&mut header, deadline)?;
            let header = u32::from_be_bytes(header);
            let length = (header & !LAST_FRAGMENT) as usize;
            let start = record.len();
            record.resize(start + length, 0);
            self.receive_exactly(&mut record[start..], deadline)?;
            if header & LAST_FRAGMENT != 0 {
                return Ok(record);
            }
        }
    }

    fn receive_exactly(&mut self, buffer: &mut [u8], deadline: Instant) -> Result<(), Status> {
        let mut filled = 0;
        while filled < buffer.len() {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(Status::ERROR_TIMEOUT);
            }
            self.stream.set_read_timeout(Some(remaining)).map_err(|_| Status::ERROR_IO)?;
            match self.stream.read(&mut buffer[filled..]) {
                Ok(0) => return Err(Status::ERROR_CONNECTION_LOST),
                Ok(length) => filled += length,
                Err(error) if matches!(error.kind(), ErrorKind::Interrupted | ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
                Err(error) => return Err(status_of_transport_error(error.kind())),
            }
        }
        Ok(())
    }
}

fn status_of_transport_error(kind: ErrorKind) -> Status {
    match kind {
        ErrorKind::ConnectionReset | ErrorKind::ConnectionAborted | ErrorKind::BrokenPipe => Status::ERROR_CONNECTION_LOST,
        _ => Status::ERROR_IO,
    }
}

/// XDR encoding: big-endian words, variable-length data with its length first and padded to four bytes.
#[derive(Default)]
struct XdrWriter(Vec<u8>);

impl XdrWriter {
    fn u32(&mut self, value: u32) {
        self.0.extend_from_slice(&value.to_be_bytes());
    }

    fn bool(&mut self, value: bool) {
        self.u32(u32::from(value));
    }

    fn opaque(&mut self, data: &[u8]) {
        self.u32(u32::try_from(data.len()).unwrap_or(u32::MAX));
        self.0.extend_from_slice(data);
        self.0.resize(self.0.len() + padding(data.len()), 0);
    }
}

struct XdrReader {
    bytes: Vec<u8>,
    position: usize,
}

impl XdrReader {
    fn new(bytes: Vec<u8>) -> XdrReader {
        XdrReader { bytes, position: 0 }
    }

    fn u32(&mut self) -> Option<u32> {
        let word = self.bytes.get(self.position..self.position + 4)?;
        self.position += 4;
        Some(u32::from_be_bytes(word.try_into().ok()?))
    }

    fn opaque(&mut self) -> Option<&[u8]> {
        let length = self.u32()? as usize;
        let start = self.position;
        let end = start.checked_add(length)?;
        if end > self.bytes.len() {
            return None;
        }
        self.position = end + padding(length);
        Some(&self.bytes[start..end])
    }
}

fn padding(length: usize) -> usize {
    (4 - length % 4) % 4
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn variable_data_is_padded_to_four_bytes_and_read_back() {
        let mut writer = XdrWriter::default();
        writer.opaque(b"inst0");
        writer.u32(7);
        assert_eq!(writer.0.len(), 4 + 8 + 4);
        let mut reader = XdrReader::new(writer.0);
        assert_eq!(reader.opaque(), Some(&b"inst0"[..]));
        assert_eq!(reader.u32(), Some(7));
        assert_eq!(reader.u32(), None);
    }

    #[test]
    fn a_length_beyond_the_data_is_not_read() {
        let mut reader = XdrReader::new(vec![0, 0, 0, 9, b'a']);
        assert_eq!(reader.opaque(), None);
    }
}
