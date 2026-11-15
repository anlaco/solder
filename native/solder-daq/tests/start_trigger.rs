//! The engine's start triggers, against what DAQmx did on the two simulated devices in LabVIEW
//! (labview-captures/reports/2026-11-15-daqmx-trigger.md, §n in each test). Time runs on a virtual clock.

use std::sync::Arc;
use std::time::Duration;

use solder_daq::clock::{Clock, VirtualClock};
use solder_daq::device::DeviceTable;
use solder_daq::digital::{Direction, LineGrouping};
use solder_daq::engine::{Engine, SampleMode, SamplesRequested, TaskId};
use solder_daq::error::{codes, DaqError};
use solder_daq::trigger::Edge;

fn engine() -> (Engine, Arc<VirtualClock>) {
    let clock = Arc::new(VirtualClock::new());
    (Engine::new(DeviceTable::simulated(), clock.clone()), clock)
}

fn timed_input(engine: &mut Engine, device: &str) -> TaskId {
    let task = engine.create_task("");
    engine.add_ai_voltage_channels(task, &format!("{device}/ai0"), -10.0, 10.0).unwrap();
    engine.configure_sample_clock(task, 1000.0, SampleMode::FiniteSamples, 100).unwrap();
    task
}

fn error_code<T>(result: Result<T, DaqError>) -> i32 {
    result.err().map_or(0, |error| error.code)
}

/// The code Start gives with `source` as the trigger of a fresh timed input of `device`.
fn start_with_source(engine: &mut Engine, device: &str, source: &str) -> i32 {
    let task = timed_input(engine, device);
    engine.configure_digital_edge_start_trigger(task, source, Edge::Rising).unwrap();
    let code = error_code(engine.start(task));
    engine.clear(task).unwrap();
    code
}

#[test]
fn a_simulated_device_runs_as_if_it_had_no_trigger() {
    let (mut engine, clock) = engine();
    for device in ["Dev1", "Dev2"] {
        let triggered = timed_input(&mut engine, device);
        engine.configure_digital_edge_start_trigger(triggered, &format!("/{device}/PFI0"), Edge::Rising).unwrap();
        engine.start(triggered).unwrap();
        let started = clock.now();
        engine.wait_until_done(triggered, Some(Duration::from_secs(10))).unwrap();
        assert_eq!(clock.now() - started, Duration::from_millis(100), "§1: {device}");
        let plain = timed_input(&mut engine, device);
        let read = |engine: &mut Engine, task| engine.read_f64(task, SamplesRequested::Available, None).unwrap();
        assert_eq!(read(&mut engine, triggered), read(&mut engine, plain), "§1: the same samples as without a trigger");
    }
}

#[test]
fn the_source_is_checked_at_start_against_the_device_terminals() {
    let (mut engine, _) = engine();
    let cases = [
        ("Dev1", "/Dev1/PFI1", 0),
        ("Dev1", "/Dev1/PFI2", codes::TERMINAL_NOT_FOUND),
        ("Dev2", "/Dev2/PFI39", 0),
        ("Dev2", "/Dev2/PFI40", codes::TERMINAL_NOT_FOUND),
        ("Dev1", "PFI0", 0),
        ("Dev1", "Dev1/PFI0", codes::TERMINAL_NOT_FOUND),
        ("Dev1", "/dev1/pfi0", 0),
        ("Dev1", "/Dev1/PFI0 ", 0),
        ("Dev1", "/Dev2/PFI0", -89136),
        ("Dev2", "/Dev1/PFI0", -89125),
        ("Dev1", "/Dev1/ai/StartTrigger", codes::ROUTE_TO_ITSELF),
        ("Dev1", "/Dev1", codes::INVALID_TERMINAL),
        ("Dev1", "/Dev1/RTSI0", codes::TERMINAL_NOT_FOUND),
        ("Dev1", "", codes::EMPTY_TERMINAL_NAME),
    ];
    for (device, source, expected) in cases {
        assert_eq!(start_with_source(&mut engine, device, source), expected, "§2: {source:?} on {device}");
    }
}

#[test]
fn a_trigger_needs_a_sample_clock_and_dev1_digital_tasks_take_none() {
    let (mut engine, _) = engine();
    let untimed = engine.create_task("");
    engine.add_ai_voltage_channels(untimed, "Dev1/ai0", -10.0, 10.0).unwrap();
    engine.configure_digital_edge_start_trigger(untimed, "/Dev1/PFI0", Edge::Rising).unwrap();
    assert_eq!(error_code(engine.start(untimed)), codes::TRIGGER_NEEDS_SAMPLE_CLOCK, "§3: at Start");
    assert_eq!(error_code(engine.read_f64(untimed, SamplesRequested::Count(1), None)), codes::TRIGGER_NEEDS_SAMPLE_CLOCK, "§3: and at Read");
    let dev2_lines = engine.create_task("");
    engine.add_digital_channels(dev2_lines, "Dev2/port0/line0", "", LineGrouping::OneChannelForEachLine, Direction::Input).unwrap();
    engine.configure_digital_edge_start_trigger(dev2_lines, "/Dev2/PFI0", Edge::Rising).unwrap();
    assert_eq!(error_code(engine.read_digital_line(dev2_lines, None)), codes::TRIGGER_NEEDS_SAMPLE_CLOCK, "§3: Dev2 DI untimed");
    let dev1_lines = engine.create_task("");
    engine.add_digital_channels(dev1_lines, "Dev1/port0/line0", "", LineGrouping::OneChannelForEachLine, Direction::Input).unwrap();
    assert_eq!(error_code(engine.configure_digital_edge_start_trigger(dev1_lines, "/Dev1/PFI0", Edge::Rising)), codes::PROPERTY_NOT_SUPPORTED, "§3: at the trigger");
    assert!(engine.start(dev1_lines).is_ok(), "§3: then starts with no trigger");
}

#[test]
fn none_removes_the_trigger_and_neither_is_set_on_a_running_or_empty_task() {
    let (mut engine, _) = engine();
    let task = timed_input(&mut engine, "Dev1");
    engine.configure_digital_edge_start_trigger(task, "", Edge::Falling).unwrap();
    engine.disable_start_trigger(task).unwrap();
    assert!(engine.start(task).is_ok(), "§5: a bad source no longer fails");
    assert_eq!(error_code(engine.disable_start_trigger(task)), codes::PROPERTY_NOT_SETTABLE_WHILE_RUNNING, "§6");
    assert_eq!(error_code(engine.configure_digital_edge_start_trigger(task, "/Dev1/PFI0", Edge::Rising)), codes::PROPERTY_NOT_SETTABLE_WHILE_RUNNING, "§6");
    engine.wait_until_done(task, None).unwrap();
    assert_eq!(error_code(engine.disable_start_trigger(task)), codes::PROPERTY_NOT_SETTABLE_WHILE_RUNNING, "§6: ended but not stopped");
    engine.stop(task).unwrap();
    engine.configure_digital_edge_start_trigger(task, "/Dev1/PFI99", Edge::Rising).unwrap();
    assert_eq!(error_code(engine.start(task)), codes::TERMINAL_NOT_FOUND, "§6: set after Stop, it takes effect");
    let empty = engine.create_task("");
    assert_eq!(error_code(engine.disable_start_trigger(empty)), codes::NO_DEVICES_IN_TASK, "§5");
    assert_eq!(error_code(engine.configure_digital_edge_start_trigger(empty, "/Dev1/PFI0", Edge::Rising)), codes::NO_DEVICES_IN_TASK, "§7");
    engine.clear(empty).unwrap();
    assert_eq!(error_code(engine.disable_start_trigger(empty)), codes::INVALID_TASK, "§5: a cleared task");
}
