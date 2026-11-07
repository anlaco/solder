//! A VXI-11 session (`TCPIP::host::INSTR`, DT-084) against a small instrument started by each test: a
//! portmapper and a core channel on free local ports, written here from the VXI-11 specification so the test does
//! not share the client's code. The instrument answers `*IDN?` with `IDENTITY` and ends it with END.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use solder_io::{AttributesChange, ResourceManager, Status};

const IDENTITY: &[u8] = b"Solder,VXI-11 Test Instrument,0,1.0\n";
const LAN_DEVICE_NAME: &str = "inst0";
/// Short, so the reads that wait for it keep the tests fast.
const TEST_TIMEOUT: Duration = Duration::from_millis(200);

const PORTMAPPER_GETPORT: u32 = 3;
const CREATE_LINK: u32 = 10;
const DEVICE_WRITE: u32 = 11;
const DEVICE_READ: u32 = 12;
const DESTROY_LINK: u32 = 23;
const FLAG_END: u32 = 0x08;
const REASON_END: u32 = 0x04;
const REASON_REQUESTED_COUNT: u32 = 0x01;
const DEVICE_ERROR_NOT_ACCESSIBLE: u32 = 3;
const DEVICE_ERROR_IO_TIMEOUT: u32 = 15;
/// Small, so a long write goes in several chunks.
const MAX_RECEIVE_SIZE: u32 = 1024;
const LINK_ID: u32 = 42;

/// What the test instrument saw, for the tests to look at.
#[derive(Default)]
struct Seen {
    messages: Vec<Vec<u8>>,
    links_destroyed: usize,
}

struct TestInstrument {
    portmapper_port: u16,
    seen: Arc<Mutex<Seen>>,
}

fn start_instrument() -> TestInstrument {
    let seen = Arc::new(Mutex::new(Seen::default()));
    let core = TcpListener::bind("127.0.0.1:0").unwrap();
    let core_port = core.local_addr().unwrap().port();
    let core_seen = seen.clone();
    thread::spawn(move || {
        for connection in core.incoming().flatten() {
            let seen = core_seen.clone();
            thread::spawn(move || serve_core(connection, seen));
        }
    });
    let portmapper = TcpListener::bind("127.0.0.1:0").unwrap();
    let portmapper_port = portmapper.local_addr().unwrap().port();
    thread::spawn(move || {
        for mut connection in portmapper.incoming().flatten() {
            while let Some((transaction, procedure, _)) = receive_call(&mut connection) {
                assert_eq!(procedure, PORTMAPPER_GETPORT);
                send_reply(&mut connection, transaction, &words(&[u32::from(core_port)]));
            }
        }
    });
    TestInstrument { portmapper_port, seen }
}

fn serve_core(mut connection: TcpStream, seen: Arc<Mutex<Seen>>) {
    let mut message = Vec::new();
    let mut answer: Vec<u8> = Vec::new();
    while let Some((transaction, procedure, arguments)) = receive_call(&mut connection) {
        let mut arguments = Words::new(arguments);
        let results = match procedure {
            CREATE_LINK => {
                let (_client, _lock, _lock_timeout) = (arguments.u32(), arguments.u32(), arguments.u32());
                let device_name = arguments.opaque();
                let error = if device_name == LAN_DEVICE_NAME.as_bytes() { 0 } else { DEVICE_ERROR_NOT_ACCESSIBLE };
                words(&[error, LINK_ID, 0, MAX_RECEIVE_SIZE])
            }
            DEVICE_WRITE => {
                let (_link, _io_timeout, _lock_timeout, flags) = (arguments.u32(), arguments.u32(), arguments.u32(), arguments.u32());
                let data = arguments.opaque();
                message.extend_from_slice(&data);
                if flags & FLAG_END != 0 {
                    if message == b"*IDN?" || message == b"*IDN?\n" {
                        answer.extend_from_slice(IDENTITY);
                    }
                    seen.lock().unwrap().messages.push(std::mem::take(&mut message));
                }
                words(&[0, data.len() as u32])
            }
            DEVICE_READ => {
                let (_link, request_size, io_timeout) = (arguments.u32(), arguments.u32() as usize, arguments.u32());
                if answer.is_empty() {
                    thread::sleep(Duration::from_millis(u64::from(io_timeout)));
                    let mut results = words(&[DEVICE_ERROR_IO_TIMEOUT, 0]);
                    results.extend(opaque(&[]));
                    results
                } else {
                    let taken: Vec<u8> = answer.drain(..request_size.min(answer.len())).collect();
                    let reason = if answer.is_empty() { REASON_END } else { REASON_REQUESTED_COUNT };
                    let mut results = words(&[0, reason]);
                    results.extend(opaque(&taken));
                    results
                }
            }
            DESTROY_LINK => {
                seen.lock().unwrap().links_destroyed += 1;
                words(&[0])
            }
            other => panic!("procedure {other} not expected"),
        };
        send_reply(&mut connection, transaction, &results);
    }
}

/// One RPC call: its transaction, its procedure and its arguments.
fn receive_call(connection: &mut TcpStream) -> Option<(u32, u32, Vec<u8>)> {
    let mut header = [0u8; 4];
    connection.read_exact(&mut header).ok()?;
    let length = (u32::from_be_bytes(header) & 0x7FFF_FFFF) as usize;
    let mut record = vec![0u8; length];
    connection.read_exact(&mut record).ok()?;
    let mut call = Words::new(record);
    let transaction = call.u32();
    let (_message_type, _rpc_version, _program, _version) = (call.u32(), call.u32(), call.u32(), call.u32());
    let procedure = call.u32();
    let (_credential, _verifier) = ((call.u32(), call.opaque()), (call.u32(), call.opaque()));
    Some((transaction, procedure, call.rest()))
}

fn send_reply(connection: &mut TcpStream, transaction: u32, results: &[u8]) {
    let mut reply = words(&[transaction, 1, 0, 0, 0, 0]);
    reply.extend_from_slice(results);
    let mut record = (0x8000_0000 | reply.len() as u32).to_be_bytes().to_vec();
    record.extend(reply);
    let _ = connection.write_all(&record);
}

fn words(values: &[u32]) -> Vec<u8> {
    values.iter().flat_map(|value| value.to_be_bytes()).collect()
}

fn opaque(data: &[u8]) -> Vec<u8> {
    let mut bytes = words(&[data.len() as u32]);
    bytes.extend_from_slice(data);
    bytes.resize(bytes.len() + (4 - data.len() % 4) % 4, 0);
    bytes
}

struct Words {
    bytes: Vec<u8>,
    position: usize,
}

impl Words {
    fn new(bytes: Vec<u8>) -> Words {
        Words { bytes, position: 0 }
    }

    fn u32(&mut self) -> u32 {
        let word = u32::from_be_bytes(self.bytes[self.position..self.position + 4].try_into().unwrap());
        self.position += 4;
        word
    }

    fn opaque(&mut self) -> Vec<u8> {
        let length = self.u32() as usize;
        let data = self.bytes[self.position..self.position + length].to_vec();
        self.position += length + (4 - length % 4) % 4;
        data
    }

    fn rest(self) -> Vec<u8> {
        self.bytes[self.position..].to_vec()
    }
}

fn resource(device_name: &str) -> String {
    format!("TCPIP0::127.0.0.1::{device_name}::INSTR")
}

#[test]
fn the_users_identification_query_works_as_written() {
    // The OVI a user sent (2026-11-07): Open, Write `*IDN?\n`, Read 128, Close.
    let instrument = start_instrument();
    let manager = ResourceManager::new().with_portmapper_port(instrument.portmapper_port);
    let opened = manager.open(&resource(LAN_DEVICE_NAME)).unwrap();
    assert_eq!(opened.name_out, "TCPIP0::127.0.0.1::inst0::INSTR");
    assert_eq!(manager.write(opened.session, b"*IDN?\n").count, 6);
    let started = Instant::now();
    let read = manager.read(opened.session, 128);
    assert!(started.elapsed() < TEST_TIMEOUT, "END ends the read at once");
    assert_eq!(read.status, Status::SUCCESS);
    assert_eq!(read.data, IDENTITY);
    assert_eq!(manager.close(opened.session), Status::SUCCESS);
    thread::sleep(Duration::from_millis(50));
    assert_eq!(instrument.seen.lock().unwrap().links_destroyed, 1);
}

#[test]
fn the_device_name_may_be_left_out() {
    let instrument = start_instrument();
    let manager = ResourceManager::new().with_portmapper_port(instrument.portmapper_port);
    let opened = manager.open("tcpip::127.0.0.1::instr").unwrap();
    assert_eq!(opened.name_out, "TCPIP0::127.0.0.1::inst0::INSTR");
}

#[test]
fn a_device_name_the_instrument_does_not_have_is_not_found() {
    let instrument = start_instrument();
    let manager = ResourceManager::new().with_portmapper_port(instrument.portmapper_port);
    assert_eq!(manager.open(&resource("inst7")), Err(Status::ERROR_RESOURCE_NOT_FOUND));
}

#[test]
fn a_host_with_no_portmapper_is_not_found() {
    let free_port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let manager = ResourceManager::new().with_portmapper_port(free_port);
    assert_eq!(manager.open(&resource(LAN_DEVICE_NAME)), Err(Status::ERROR_RESOURCE_NOT_FOUND));
}

#[test]
fn a_long_write_goes_in_chunks_and_arrives_as_one_message() {
    let instrument = start_instrument();
    let manager = ResourceManager::new().with_portmapper_port(instrument.portmapper_port);
    let session = manager.open(&resource(LAN_DEVICE_NAME)).unwrap().session;
    let long_message = vec![b'A'; MAX_RECEIVE_SIZE as usize * 2 + 10];
    let written = manager.write(session, &long_message);
    assert_eq!((written.count, written.status), (long_message.len(), Status::SUCCESS));
    assert_eq!(instrument.seen.lock().unwrap().messages, vec![long_message]);
}

#[test]
fn a_read_shorter_than_the_answer_stops_at_the_count_and_the_rest_comes_next() {
    let instrument = start_instrument();
    let manager = ResourceManager::new().with_portmapper_port(instrument.portmapper_port);
    let session = manager.open(&resource(LAN_DEVICE_NAME)).unwrap().session;
    manager.write(session, b"*IDN?");
    let first = manager.read(session, 6);
    assert_eq!((first.data.as_slice(), first.status), (&IDENTITY[..6], Status::SUCCESS_MAX_COUNT));
    let rest = manager.read(session, 128);
    assert_eq!((rest.data.as_slice(), rest.status), (&IDENTITY[6..], Status::SUCCESS));
}

#[test]
fn a_read_with_nothing_to_answer_gives_the_timeout() {
    let instrument = start_instrument();
    let manager = ResourceManager::new().with_portmapper_port(instrument.portmapper_port);
    let session = manager.open(&resource(LAN_DEVICE_NAME)).unwrap().session;
    let change = AttributesChange { timeout: Some(TEST_TIMEOUT), ..Default::default() };
    assert_eq!(manager.change_attributes(session, change), Status::SUCCESS);
    let read = manager.read(session, 128);
    assert_eq!((read.data.len(), read.status), (0, Status::ERROR_TIMEOUT));
}

#[test]
fn a_lan_instrument_has_no_serial_settings() {
    let instrument = start_instrument();
    let manager = ResourceManager::new().with_portmapper_port(instrument.portmapper_port);
    let session = manager.open(&resource(LAN_DEVICE_NAME)).unwrap().session;
    assert!(manager.attributes(session).unwrap().serial.is_none());
    let change = AttributesChange { baud_rate: Some(9600), ..Default::default() };
    assert_eq!(manager.change_attributes(session, change), Status::ERROR_ATTRIBUTE_NOT_SUPPORTED);
}
