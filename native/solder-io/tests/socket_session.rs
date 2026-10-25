//! A socket session against a small instrument started by each test, compared with what LabVIEW 2026
//! Q3 and NI-VISA 26.5 did against Crucible (`labview-captures/reports/2026-10-25-visa-read-socket.md`).

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::thread;
use std::time::{Duration, Instant};

use solder_io::{AttributesChange, ResourceManager, Status};

const IDENTITY: &[u8] = b"Solder,Test Instrument,0,1.0\n";
/// Short, so the reads that wait for it keep the tests fast; LabVIEW's default is 2000 ms.
const TEST_TIMEOUT: Duration = Duration::from_millis(200);
/// What a read that stops before the timeout may take, at most, on a loaded machine.
const PROMPT: Duration = Duration::from_millis(100);

/// An instrument on a free local port that answers `*IDN?` with `IDENTITY`; its resource string.
fn start_instrument() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    thread::spawn(move || {
        for connection in listener.incoming().flatten() {
            thread::spawn(move || {
                let mut answers = connection.try_clone().unwrap();
                for line in BufReader::new(connection).lines().map_while(Result::ok) {
                    if line.trim() == "*IDN?" {
                        answers.write_all(IDENTITY).unwrap();
                    }
                }
            });
        }
    });
    format!("TCPIP0::127.0.0.1::{port}::SOCKET")
}

fn open_with_test_timeout(manager: &ResourceManager) -> u32 {
    let session = manager.open(&start_instrument()).unwrap();
    let change = AttributesChange { timeout: Some(TEST_TIMEOUT), ..Default::default() };
    assert_eq!(manager.change_attributes(session, change), Status::SUCCESS);
    session
}

#[test]
fn a_new_socket_session_has_the_measured_defaults() {
    let manager = ResourceManager::new();
    let session = manager.open(&start_instrument()).unwrap();
    let attributes = manager.attributes(session).unwrap();
    assert_eq!(attributes.timeout, Duration::from_millis(2000));
    assert_eq!(attributes.termination_character, b'\n');
    assert!(!attributes.termination_character_enabled);
}

#[test]
fn without_termination_character_a_read_waits_for_the_timeout_and_keeps_what_arrived() {
    let manager = ResourceManager::new();
    let session = open_with_test_timeout(&manager);
    assert_eq!(manager.write(session, b"*IDN?\n").count, 6);
    let started = Instant::now();
    let read = manager.read(session, 100);
    assert!(started.elapsed() >= TEST_TIMEOUT);
    assert_eq!(read.data, IDENTITY);
    assert_eq!(read.status, Status::ERROR_TIMEOUT);
}

#[test]
fn a_read_of_fewer_bytes_than_arrived_stops_at_the_count_and_the_rest_waits() {
    let manager = ResourceManager::new();
    let session = open_with_test_timeout(&manager);
    manager.write(session, b"*IDN?\n");
    let started = Instant::now();
    let first = manager.read(session, 5);
    assert!(started.elapsed() < PROMPT);
    assert_eq!(first.data, b"Solde");
    assert_eq!(first.status, Status::SUCCESS_MAX_COUNT);
    let rest = manager.read(session, IDENTITY.len() - 5);
    assert_eq!(rest.data, &IDENTITY[5..]);
    assert_eq!(rest.status, Status::SUCCESS_MAX_COUNT);
}

#[test]
fn with_termination_character_a_read_stops_at_it_and_keeps_it() {
    let manager = ResourceManager::new();
    let session = open_with_test_timeout(&manager);
    let change = AttributesChange { termination_character_enabled: Some(true), ..Default::default() };
    manager.change_attributes(session, change);
    manager.write(session, b"*IDN?\n");
    let started = Instant::now();
    let read = manager.read(session, 100);
    assert!(started.elapsed() < PROMPT);
    assert_eq!(read.data, IDENTITY);
    assert_eq!(read.status, Status::SUCCESS_TERM_CHAR);
}

#[test]
fn the_count_wins_over_a_termination_character_beyond_it() {
    let manager = ResourceManager::new();
    let session = open_with_test_timeout(&manager);
    let change = AttributesChange { termination_character_enabled: Some(true), ..Default::default() };
    manager.change_attributes(session, change);
    manager.write(session, b"*IDN?\n");
    let read = manager.read(session, 5);
    assert_eq!(read.data, b"Solde");
    assert_eq!(read.status, Status::SUCCESS_MAX_COUNT);
}

#[test]
fn a_command_the_instrument_does_not_answer_times_out_empty() {
    let manager = ResourceManager::new();
    let session = open_with_test_timeout(&manager);
    assert_eq!(manager.write(session, b"*IDN?").count, 5);
    let read = manager.read(session, 100);
    assert!(read.data.is_empty());
    assert_eq!(read.status, Status::ERROR_TIMEOUT);
}

#[test]
fn opening_a_port_where_nothing_listens_is_resource_not_found() {
    let free_port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let manager = ResourceManager::new();
    assert_eq!(manager.open(&format!("TCPIP0::127.0.0.1::{free_port}::SOCKET")), Err(Status::ERROR_RESOURCE_NOT_FOUND));
}

#[test]
fn a_closed_session_is_an_invalid_object() {
    let manager = ResourceManager::new();
    let session = manager.open(&start_instrument()).unwrap();
    assert_eq!(manager.close(session), Status::SUCCESS);
    assert_eq!(manager.read(session, 1).status, Status::ERROR_INVALID_OBJECT);
    assert_eq!(manager.write(session, b"x").status, Status::ERROR_INVALID_OBJECT);
    assert_eq!(manager.close(session), Status::ERROR_INVALID_OBJECT);
}

#[test]
fn a_read_on_one_session_does_not_hold_back_another() {
    let manager = std::sync::Arc::new(ResourceManager::new());
    let waiting = open_with_test_timeout(&manager);
    let answering = open_with_test_timeout(&manager);
    let reader = {
        let manager = manager.clone();
        thread::spawn(move || manager.read(waiting, 100))
    };
    thread::sleep(Duration::from_millis(20));
    let started = Instant::now();
    manager.write(answering, b"*IDN?\n");
    assert_eq!(manager.read(answering, 5).data, b"Solde");
    assert!(started.elapsed() < PROMPT);
    assert_eq!(reader.join().unwrap().status, Status::ERROR_TIMEOUT);
}
