//! A serial session against an instrument on the other side of a pseudo-terminal, compared with what
//! LabVIEW 2026 Q3 and NI-VISA 26.5 did on a real COM1 (`labview-captures/reports/2026-10-30-visa-serial-com1.md`).
#![cfg(unix)]

mod pseudo_terminal;

use std::time::{Duration, Instant};

use pseudo_terminal::{IDENTITY, start_instrument};
use solder_io::{AttributesChange, EndMode, LineSettings, Parity, PortTable, ResourceManager, Status, StopBits};

/// Short, so the reads that wait for it keep the tests fast; a new session's is 2000 ms.
const TEST_TIMEOUT: Duration = Duration::from_millis(200);
/// What a read that stops before the timeout may take, at most, on a loaded machine.
const PROMPT: Duration = Duration::from_millis(150);

const END_MODE_NONE: u16 = EndMode::None as u16;
const END_MODE_TERM_CHAR: u16 = EndMode::TermChar as u16;

fn manager() -> ResourceManager {
    ResourceManager::with_port_table(PortTable::default())
}

/// A session on a new instrument, with the test's timeout and `change`.
fn open(manager: &ResourceManager, change: AttributesChange) -> u32 {
    let session = manager.open(&start_instrument().resource).unwrap().session;
    let change = AttributesChange { timeout: Some(TEST_TIMEOUT), ..change };
    assert_eq!(manager.change_attributes(session, change), Status::SUCCESS);
    session
}

fn query(manager: &ResourceManager, session: u32, command: &[u8]) {
    assert_eq!(manager.write(session, command).count, command.len());
}

#[test]
fn a_new_serial_session_has_the_measured_defaults() {
    let manager = manager();
    let instrument = start_instrument();
    let opened = manager.open(&instrument.resource).unwrap();
    let attributes = manager.attributes(opened.session).unwrap();
    assert_eq!(attributes.timeout, Duration::from_millis(2000));
    assert_eq!(attributes.termination_character, b'\n');
    assert!(!attributes.termination_character_enabled);
    let serial = attributes.serial.expect("a serial session has serial settings");
    assert_eq!(serial.line, LineSettings::default());
    assert_eq!(serial.line.baud_rate, 9600);
    assert_eq!(serial.end_mode_for_reads, EndMode::TermChar);
}

#[test]
fn open_gives_the_resource_in_capitals() {
    let manager = manager();
    let instrument = start_instrument();
    let typed = instrument.resource.replace("ASRL", "asrl").replace("INSTR", "instr");
    assert_eq!(manager.open(&typed).unwrap().name_out, instrument.resource);
}

#[test]
fn a_new_session_stops_at_the_line_feed_with_no_warning() {
    let manager = manager();
    let session = open(&manager, AttributesChange::default());
    query(&manager, session, b"*IDN?\n");
    let started = Instant::now();
    let read = manager.read(session, 100);
    assert!(started.elapsed() < PROMPT);
    assert_eq!(read.data, IDENTITY);
    assert_eq!(read.status, Status::SUCCESS);
}

#[test]
fn end_mode_for_reads_termchar_stops_with_no_warning_and_keeps_the_rest() {
    let manager = manager();
    let change = AttributesChange { end_mode_for_reads: Some(END_MODE_TERM_CHAR), termination_character_enabled: Some(true), ..Default::default() };
    let session = open(&manager, change);
    query(&manager, session, b"MID?\n");
    let first = manager.read(session, 100);
    assert_eq!((first.data.as_slice(), first.status), (&b"AB\n"[..], Status::SUCCESS));
    let second = manager.read(session, 100);
    assert_eq!((second.data.as_slice(), second.status), (&b"CD\n"[..], Status::SUCCESS));
}

#[test]
fn termination_character_enable_alone_stops_with_the_term_char_warning() {
    let manager = manager();
    let change = AttributesChange { end_mode_for_reads: Some(END_MODE_NONE), termination_character_enabled: Some(true), ..Default::default() };
    let session = open(&manager, change);
    query(&manager, session, b"MID?\n");
    let read = manager.read(session, 100);
    assert_eq!((read.data.as_slice(), read.status), (&b"AB\n"[..], Status::SUCCESS_TERM_CHAR));
}

#[test]
fn without_termination_a_read_waits_for_the_timeout_and_keeps_what_arrived() {
    let manager = manager();
    let change = AttributesChange { end_mode_for_reads: Some(END_MODE_NONE), termination_character_enabled: Some(false), ..Default::default() };
    let session = open(&manager, change);
    query(&manager, session, b"LONG?\n");
    let started = Instant::now();
    let read = manager.read(session, 100);
    assert!(started.elapsed() >= TEST_TIMEOUT);
    assert_eq!(read.data.len(), 31);
    assert_eq!(read.status, Status::ERROR_TIMEOUT);
}

#[test]
fn a_read_of_fewer_bytes_than_came_keeps_the_rest_for_the_next() {
    let manager = manager();
    let change = AttributesChange { end_mode_for_reads: Some(END_MODE_NONE), termination_character_enabled: Some(false), ..Default::default() };
    let session = open(&manager, change);
    query(&manager, session, b"LONG?\n");
    let first = manager.read(session, 5);
    assert_eq!((first.data.as_slice(), first.status), (&b"01234"[..], Status::SUCCESS_MAX_COUNT));
    let rest = manager.read(session, 100);
    assert_eq!(rest.data.len(), 26);
    assert_eq!(rest.status, Status::ERROR_TIMEOUT);
}

#[test]
fn a_carriage_return_as_termination_character_leaves_the_line_feed() {
    let manager = manager();
    let session = open(&manager, AttributesChange { termination_character: Some(b'\r'), termination_character_enabled: Some(true), ..Default::default() });
    query(&manager, session, b"CRLF?\n");
    assert_eq!(manager.read(session, 100).data, b"line\r");
    let rest = manager.read(session, 100);
    assert_eq!((rest.data.as_slice(), rest.status), (&b"\n"[..], Status::ERROR_TIMEOUT));
}

#[test]
fn a_timeout_of_zero_returns_what_came_at_once() {
    let manager = manager();
    let session = open(&manager, AttributesChange::default());
    query(&manager, session, b"NOTERM?\n");
    std::thread::sleep(PROMPT);
    let change = AttributesChange { timeout: Some(Duration::ZERO), ..Default::default() };
    assert_eq!(manager.change_attributes(session, change), Status::SUCCESS);
    let started = Instant::now();
    let read = manager.read(session, 100);
    assert!(started.elapsed() < PROMPT);
    assert_eq!((read.data.as_slice(), read.status), (&b"XYZ"[..], Status::ERROR_TIMEOUT));
}

#[test]
fn bytes_at_port_counts_an_unread_answer() {
    let manager = manager();
    let session = open(&manager, AttributesChange::default());
    query(&manager, session, b"*IDN?\n");
    std::thread::sleep(PROMPT);
    assert_eq!(manager.bytes_at_port(session), Ok(IDENTITY.len()));
}

#[test]
fn the_line_settings_read_back_as_written() {
    let manager = manager();
    let change = AttributesChange { baud_rate: Some(115_200), data_bits: Some(7), parity: Some(2), stop_bits: Some(20), flow_control: Some(2), ..Default::default() };
    let session = open(&manager, change);
    let line = manager.attributes(session).unwrap().serial.unwrap().line;
    assert_eq!((line.baud_rate, line.data_bits, line.parity, line.stop_bits), (115_200, 7, Parity::Even, StopBits::Two));
    assert!(line.flow_control.rts_cts);
}

#[test]
fn a_refused_value_stops_the_change_at_its_row() {
    let manager = manager();
    let session = open(&manager, AttributesChange::default());
    let change = AttributesChange { timeout: Some(Duration::from_millis(3000)), baud_rate: Some(0), termination_character: Some(b'\r'), ..Default::default() };
    assert_eq!(manager.change_attributes(session, change), Status::ERROR_ATTRIBUTE_STATE_NOT_SUPPORTED);
    let attributes = manager.attributes(session).unwrap();
    assert_eq!(attributes.timeout, Duration::from_millis(3000));
    assert_eq!(attributes.termination_character, b'\n');
    let refused_data_bits = AttributesChange { data_bits: Some(9), ..Default::default() };
    assert_eq!(manager.change_attributes(session, refused_data_bits), Status::ERROR_ATTRIBUTE_STATE_NOT_SUPPORTED);
}

#[test]
fn a_baud_rate_without_a_termios_constant_is_taken() {
    let manager = manager();
    let session = open(&manager, AttributesChange { baud_rate: Some(7), ..Default::default() });
    assert_eq!(manager.attributes(session).unwrap().serial.unwrap().line.baud_rate, 7);
}

#[test]
fn what_a_session_set_does_not_survive_its_close() {
    let manager = manager();
    let instrument = start_instrument();
    let first = manager.open(&instrument.resource).unwrap().session;
    assert_eq!(manager.change_attributes(first, AttributesChange { baud_rate: Some(115_200), ..Default::default() }), Status::SUCCESS);
    assert_eq!(manager.close(first), Status::SUCCESS);
    let again = manager.open(&instrument.resource).unwrap().session;
    assert_eq!(manager.attributes(again).unwrap().serial.unwrap().line.baud_rate, 9600);
}

#[test]
fn a_second_session_on_the_port_opens_and_gets_nothing_of_the_first_ones_answer() {
    let manager = manager();
    let instrument = start_instrument();
    let first = manager.open(&instrument.resource).unwrap().session;
    let second = manager.open(&instrument.resource).unwrap().session;
    assert_ne!(first, second);
    let change = AttributesChange { timeout: Some(TEST_TIMEOUT), ..Default::default() };
    assert_eq!(manager.change_attributes(second, change), Status::SUCCESS);
    query(&manager, first, b"*IDN?\n");
    let read = manager.read(second, 100);
    assert_eq!((read.data.len(), read.status), (0, Status::ERROR_TIMEOUT));
    assert_eq!(manager.read(first, 100).data, IDENTITY);
}

#[test]
fn a_serial_attribute_on_a_socket_is_not_supported_after_the_timeout_is_taken() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let resource = format!("TCPIP0::127.0.0.1::{}::SOCKET", listener.local_addr().unwrap().port());
    let manager = manager();
    let session = manager.open(&resource).unwrap().session;
    let change = AttributesChange { timeout: Some(Duration::from_millis(10_000)), baud_rate: Some(9600), ..Default::default() };
    assert_eq!(manager.change_attributes(session, change), Status::ERROR_ATTRIBUTE_NOT_SUPPORTED);
    assert_eq!(manager.attributes(session).unwrap().timeout, Duration::from_millis(10_000));
    assert_eq!(manager.bytes_at_port(session), Err(Status::ERROR_ATTRIBUTE_NOT_SUPPORTED));
}

#[test]
fn a_device_that_is_no_port_is_not_found() {
    let manager = manager();
    assert_eq!(manager.open("ASRL/dev/null::INSTR"), Err(Status::ERROR_RESOURCE_NOT_FOUND));
    assert_eq!(manager.open("ASRL/dev/no-such-port::INSTR"), Err(Status::ERROR_RESOURCE_NOT_FOUND));
}
