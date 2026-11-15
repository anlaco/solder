//! The engine's digital lines, against what DAQmx did on the two simulated devices in LabVIEW
//! (labview-captures/reports/2026-11-15-daqmx-dio.md, §n in each test). Time runs on a virtual clock.

use std::sync::Arc;

use solder_daq::clock::VirtualClock;
use solder_daq::device::DeviceTable;
use solder_daq::digital::{Direction, LineGrouping};
use solder_daq::engine::{Engine, SampleMode, TaskId};
use solder_daq::error::{codes, DaqError};

use LineGrouping::{OneChannelForAllLines as ALL_LINES, OneChannelForEachLine as EACH_LINE};

fn engine() -> Engine {
    Engine::new(DeviceTable::simulated(), Arc::new(VirtualClock::new()))
}

fn digital_task(engine: &mut Engine, lines: &str, grouping: LineGrouping, direction: Direction) -> TaskId {
    let task = engine.create_task("");
    engine.add_digital_channels(task, lines, "", grouping, direction).unwrap();
    task
}

fn added(engine: &mut Engine, lines: &str, names: &str, grouping: LineGrouping) -> Result<Vec<String>, DaqError> {
    let task = engine.create_task("");
    engine.add_digital_channels(task, lines, names, grouping, Direction::Input)
}

/// The lines given, the grouping, and the channel names expected or the code.
type GroupingCase = (&'static str, LineGrouping, Result<Vec<&'static str>, i32>);

fn error_code<T>(result: Result<T, DaqError>) -> i32 {
    result.err().map_or(0, |error| error.code)
}

fn five_reads(engine: &mut Engine, task: TaskId) -> Vec<u32> {
    (0..5).map(|_| engine.read_digital_u32(task, None).unwrap()).collect()
}

#[test]
fn each_device_has_its_ports_and_a_missing_line_or_port_is_refused_at_create() {
    let mut engine = engine();
    for (device, lines_per_port) in [("Dev1", [8, 4, 1]), ("Dev2", [8, 8, 8])] {
        for (port, count) in lines_per_port.iter().enumerate() {
            let last = format!("{device}/port{port}/line{}", count - 1);
            assert!(added(&mut engine, &last, "", EACH_LINE).is_ok(), "§1: {last}");
            let missing = format!("{device}/port{port}/line{count}");
            assert_eq!(error_code(added(&mut engine, &missing, "", EACH_LINE)), codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST, "§1: {missing}");
        }
        assert_eq!(error_code(added(&mut engine, &format!("{device}/port3"), "", ALL_LINES)), codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST, "§1: port3");
    }
    assert_eq!(error_code(added(&mut engine, "Dev1/port1/line0:7", "", EACH_LINE)), codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST, "§1: a range that overruns");
    assert_eq!(error_code(added(&mut engine, "Dev1/port0/line 0", "", EACH_LINE)), codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST, "§2: a space");
    assert_eq!(error_code(added(&mut engine, "Dev9/port0/line0", "", EACH_LINE)), codes::DEVICE_NOT_VALID);
}

#[test]
fn the_grouping_makes_a_channel_for_each_line_or_one_for_all_of_them() {
    let mut engine = engine();
    let cases: [GroupingCase; 9] = [
        ("Dev1/port0", EACH_LINE, Err(codes::PORT_NEEDS_ONE_CHANNEL)),
        ("Dev1/port0", ALL_LINES, Ok(vec!["Dev1/port0"])),
        ("Dev1/port0/line0:3", EACH_LINE, Ok(vec!["Dev1/port0/line0", "Dev1/port0/line1", "Dev1/port0/line2", "Dev1/port0/line3"])),
        ("Dev1/port0/line0:3", ALL_LINES, Ok(vec!["Dev1/port0/line0..."])),
        ("Dev1/port0/line3:0", EACH_LINE, Ok(vec!["Dev1/port0/line3", "Dev1/port0/line2", "Dev1/port0/line1", "Dev1/port0/line0"])),
        ("Dev1/port0/line0,Dev1/port0/line2", ALL_LINES, Ok(vec!["Dev1/port0/line0..."])),
        ("Dev1/port0:1", EACH_LINE, Err(codes::PORT_NEEDS_ONE_CHANNEL)),
        ("Dev1/port0:1", ALL_LINES, Ok(vec!["Dev1/port0..."])),
        ("Dev1/Port0/Line0", EACH_LINE, Ok(vec!["Dev1/Port0/Line0"])),
    ];
    for (lines, grouping, expected) in cases {
        let result = added(&mut engine, lines, "", grouping).map_err(|error| error.code);
        assert_eq!(result, expected.map(|names| names.iter().map(|name| name.to_string()).collect()), "§2: {lines} {grouping:?}");
    }
}

#[test]
fn a_line_given_twice_is_refused_and_a_second_create_adds_another_line() {
    let mut engine = engine();
    assert_eq!(error_code(added(&mut engine, "Dev1/port0/line0,Dev1/port0/line0", "", EACH_LINE)), codes::CHANNEL_ALREADY_IN_TASK, "§2");
    assert_eq!(error_code(added(&mut engine, "Dev1/port0/line0:1,Dev1/port0/line1", "", ALL_LINES)), codes::LINE_TWICE_IN_DIGITAL_TASK, "§2");
    let task = digital_task(&mut engine, "Dev1/port0/line0", EACH_LINE, Direction::Input);
    assert_eq!(error_code(engine.add_digital_channels(task, "Dev1/port0/line0", "", EACH_LINE, Direction::Input)), codes::CHANNEL_ALREADY_IN_TASK, "§2");
    assert!(engine.add_digital_channels(task, "Dev1/port0/line1", "", ALL_LINES, Direction::Input).is_ok(), "§2: another line, another grouping");
}

#[test]
fn names_to_assign_go_to_the_channels_in_order_and_the_last_is_numbered() {
    let mut engine = engine();
    assert_eq!(added(&mut engine, "Dev1/port0/line0", "myLine", EACH_LINE).unwrap(), ["myLine"], "§9");
    assert_eq!(added(&mut engine, "Dev1/port0/line0:1", "myLine", EACH_LINE).unwrap(), ["myLine0", "myLine1"], "§9");
    assert_eq!(added(&mut engine, "Dev1/port0/line0:1", "myLine", ALL_LINES).unwrap(), ["myLine"], "§9");
    assert_eq!(added(&mut engine, "Dev1/port0/line0,Dev1/port0/line2", "myLine", EACH_LINE).unwrap(), ["myLine0", "myLine1"], "§9: by position");
    assert_eq!(added(&mut engine, "Dev1/port0/line0:2", "a,b", EACH_LINE).unwrap(), ["a", "b0", "b1"], "§9");
    assert_eq!(added(&mut engine, "Dev1/port0/line0:1", "a, b, c", EACH_LINE).unwrap(), ["a", "b"], "§9: extra names ignored");
}

#[test]
fn a_task_keeps_one_kind_of_channel() {
    let mut engine = engine();
    let digital_input = digital_task(&mut engine, "Dev1/port0/line0", EACH_LINE, Direction::Input);
    assert_eq!(error_code(engine.add_digital_channels(digital_input, "Dev1/port0/line1", "", EACH_LINE, Direction::Output)), codes::CHANNEL_TYPE_MIXED, "§7: DI with DO");
    assert_eq!(error_code(engine.add_ai_voltage_channels(digital_input, "Dev1/ai0", -10.0, 10.0)), codes::CHANNEL_TYPE_MIXED, "§7: DI then AI");
    assert_eq!(error_code(engine.add_ao_voltage_channels(digital_input, "Dev1/ao0", -10.0, 10.0)), codes::CHANNEL_TYPE_MIXED, "§7: DI then AO");
    let analog_input = engine.create_task("");
    engine.add_ai_voltage_channels(analog_input, "Dev1/ai0", -10.0, 10.0).unwrap();
    assert_eq!(error_code(engine.add_ao_voltage_channels(analog_input, "Dev1/ao0", -10.0, 10.0)), codes::CHANNEL_TYPE_MIXED, "§7: AI with AO");
    assert_eq!(error_code(engine.add_digital_channels(analog_input, "Dev1/port0/line0", "", EACH_LINE, Direction::Input)), codes::CHANNEL_TYPE_MIXED, "§7: AI then DI");
    assert!(engine.start(analog_input).is_ok(), "§7: the first channel stays");
    let two_devices = digital_task(&mut engine, "Dev1/port0/line0,Dev2/port0/line0", EACH_LINE, Direction::Input);
    assert_eq!(error_code(engine.start(two_devices)), codes::MULTIDEVICE_TASK_NOT_SUPPORTED, "§7: at Start");
}

#[test]
fn a_read_gives_the_task_counter_masked_by_its_lines() {
    let mut engine = engine();
    let cases: [(&str, LineGrouping, [u32; 5]); 6] = [
        ("Dev1/port0", ALL_LINES, [0, 1, 2, 3, 4]),
        ("Dev1/port0/line0", EACH_LINE, [0, 1, 0, 1, 0]),
        ("Dev1/port2", ALL_LINES, [0, 1, 0, 1, 0]),
        ("Dev1/port0:1", ALL_LINES, [0, 257, 514, 771, 1028]),
        ("Dev1/port0/line0,Dev1/port1/line0", ALL_LINES, [0, 257, 0, 257, 0]),
        ("Dev1/port0/line0,Dev1/port0/line2", ALL_LINES, [0, 1, 0, 1, 4]),
    ];
    for (lines, grouping, expected) in cases {
        let task = digital_task(&mut engine, lines, grouping, Direction::Input);
        assert_eq!(five_reads(&mut engine, task), expected, "§4: {lines}");
    }
    let two_lines = digital_task(&mut engine, "Dev1/port0/line2:3", ALL_LINES, Direction::Input);
    let eight: Vec<u32> = (0..8).map(|_| engine.read_digital_u32(two_lines, None).unwrap()).collect();
    assert_eq!(eight, [0, 0, 0, 0, 4, 4, 4, 4], "§4: not shifted");
    let short_port = digital_task(&mut engine, "Dev1/port1", ALL_LINES, Direction::Input);
    let values: Vec<u32> = (0..17).map(|_| engine.read_digital_u32(short_port, None).unwrap()).collect();
    assert_eq!(values[15..], [15, 0], "§4: a port of four lines wraps at 16");
}

#[test]
fn a_one_line_read_leaves_an_untimed_task_as_it_found_it() {
    let mut engine = engine();
    for device in ["Dev1", "Dev2"] {
        let task = digital_task(&mut engine, &format!("{device}/port0/line0"), EACH_LINE, Direction::Input);
        let values: Vec<bool> = (0..5).map(|_| engine.read_digital_line(task, None).unwrap()).collect();
        assert_eq!(values, [false, true, false, true, false], "§3: {device}");
        assert!(engine.start(task).is_ok(), "§3: the read left it stopped");
        assert!(engine.read_digital_line(task, None).is_ok(), "§3: a started task reads");
        assert_eq!(error_code(engine.start(task)), codes::TASK_ALREADY_RUNNING, "§3: and stays running");
    }
}

#[test]
fn a_read_needs_one_channel_of_the_right_width_and_kind() {
    let mut engine = engine();
    let four_lines = digital_task(&mut engine, "Dev1/port0/line0:3", ALL_LINES, Direction::Input);
    assert_eq!(error_code(engine.read_digital_line(four_lines, None)), codes::LINE_COUNT_MISMATCH, "§3");
    let two_channels = digital_task(&mut engine, "Dev1/port0/line0:1", EACH_LINE, Direction::Input);
    assert_eq!(error_code(engine.read_digital_line(two_channels, None)), codes::READ_NEEDS_ONE_CHANNEL, "§3");
    assert_eq!(error_code(engine.read_digital_u32(two_channels, None)), codes::READ_NEEDS_ONE_CHANNEL, "§4");
    let analog_input = engine.create_task("");
    engine.add_ai_voltage_channels(analog_input, "Dev1/ai0", -10.0, 10.0).unwrap();
    assert_eq!(error_code(engine.read_digital_line(analog_input, None)), codes::READ_TYPE_MISMATCH, "§6");
    let analog_output = engine.create_task("");
    engine.add_ao_voltage_channels(analog_output, "Dev1/ao0", -10.0, 10.0).unwrap();
    assert_eq!(error_code(engine.read_digital_line(analog_output, None)), codes::NO_INPUT_CHANNELS, "§6");
    assert_eq!(engine.write_digital_line(analog_output, true, true).result.map_err(|error| error.code), Err(codes::WRITE_TYPE_MISMATCH), "§6");
    let empty = engine.create_task("");
    assert_eq!(error_code(engine.read_digital_line(empty, None)), codes::TASK_HAS_NO_CHANNELS, "§6");
    assert_eq!(engine.write_digital_line(empty, true, true).result.map_err(|error| error.code), Err(codes::NO_DEVICES_IN_TASK), "§6");
}

#[test]
fn a_write_goes_out_on_auto_start_or_on_a_started_task() {
    let mut engine = engine();
    let task = digital_task(&mut engine, "Dev1/port0/line0", EACH_LINE, Direction::Output);
    let refused = engine.write_digital_line(task, true, false);
    assert_eq!((refused.written, refused.result.map_err(|error| error.code)), (0, Err(codes::WRITE_NEEDS_RUNNING_TASK)), "§6");
    let written = engine.write_digital_line(task, true, true);
    assert_eq!((written.written, written.result), (1, Ok(())), "§6: auto start");
    assert_eq!(engine.last_line_written(task).unwrap(), Some(true));
    assert!(engine.start(task).is_ok(), "§6: auto start left it stopped");
    assert_eq!(engine.write_digital_line(task, false, false).written, 1, "§6: a started task takes a write");
    assert_eq!(error_code(engine.start(task)), codes::TASK_ALREADY_RUNNING, "§6: and stays running");
    assert_eq!(five_reads(&mut engine, task), [0, 1, 0, 1, 0], "§5: an output task reads the counter, not what was written");
}

#[test]
fn a_write_needs_one_output_channel_of_one_line() {
    let mut engine = engine();
    let four_lines = digital_task(&mut engine, "Dev1/port0/line0:3", ALL_LINES, Direction::Output);
    let outcome = engine.write_digital_line(four_lines, true, true);
    assert_eq!((outcome.written, outcome.result.map_err(|error| error.code)), (1, Err(codes::DIGITAL_DATA_NOT_SUPPORTED)), "§6: written 1 beside it");
    let two_channels = digital_task(&mut engine, "Dev1/port0/line0:1", EACH_LINE, Direction::Output);
    let outcome = engine.write_digital_line(two_channels, true, true);
    assert_eq!((outcome.written, outcome.result.map_err(|error| error.code)), (0, Err(codes::CHANNEL_COUNT_MISMATCH)), "§6");
    let input = digital_task(&mut engine, "Dev1/port0/line0", EACH_LINE, Direction::Input);
    assert_eq!(engine.write_digital_line(input, true, true).result.map_err(|error| error.code), Err(codes::NO_OUTPUT_CHANNELS), "§6");
}

#[test]
fn only_a_task_started_by_start_holds_its_lines() {
    let mut engine = engine();
    let output = digital_task(&mut engine, "Dev1/port0/line0", EACH_LINE, Direction::Output);
    let input = digital_task(&mut engine, "Dev1/port0/line0", EACH_LINE, Direction::Input);
    assert!(engine.write_digital_line(output, true, true).result.is_ok(), "§5: nothing held by create or auto start");
    assert!(engine.read_digital_line(input, None).is_ok(), "§5");
    engine.start(output).unwrap();
    assert_eq!(error_code(engine.read_digital_line(input, None)), codes::LINES_RESERVED, "§5: a started DO holds the line");
    assert_eq!(error_code(engine.start(input)), codes::LINES_RESERVED, "§5");
    engine.stop(output).unwrap();
    engine.start(input).unwrap();
    let held = engine.write_digital_line(output, true, true);
    assert_eq!((held.written, held.result.map_err(|error| error.code)), (0, Err(codes::LINES_RESERVED)), "§5: a started DI holds it");
    let other_line = digital_task(&mut engine, "Dev1/port0/line1", EACH_LINE, Direction::Output);
    assert!(engine.write_digital_line(other_line, true, true).result.is_ok(), "§5: per line, not per port");
    engine.clear(input).unwrap();
    assert!(engine.write_digital_line(output, true, true).result.is_ok(), "§5: freed by Clear");
}

#[test]
fn timing_on_a_digital_task_needs_a_device_with_a_digital_clock() {
    let mut engine = engine();
    let untimed = digital_task(&mut engine, "Dev1/port0/line0", EACH_LINE, Direction::Input);
    let refused = engine.configure_sample_clock(untimed, 1000.0, SampleMode::FiniteSamples, 100).unwrap_err();
    assert_eq!((refused.code, refused.details.property), (codes::UNSUPPORTED_PROPERTY_VALUE, Some("SampTimingType")), "§8: at Timing");
    assert!(engine.read_digital_line(untimed, None).is_ok(), "§8: still on demand");
    let timed = digital_task(&mut engine, "Dev2/port0", ALL_LINES, Direction::Input);
    engine.configure_sample_clock(timed, 1000.0, SampleMode::FiniteSamples, 3).unwrap();
    let values: Vec<u32> = (0..3).map(|_| engine.read_digital_u32(timed, None).unwrap()).collect();
    assert_eq!(values, [0, 1, 2], "§8: a finite digital read counts on");
    assert_eq!(error_code(engine.read_digital_u32(timed, None)), codes::READ_BEYOND_FINAL_SAMPLE, "§8");
    let timed_output = digital_task(&mut engine, "Dev2/port0/line0", EACH_LINE, Direction::Output);
    engine.configure_sample_clock(timed_output, 1000.0, SampleMode::FiniteSamples, 100).unwrap();
    assert_eq!(error_code(engine.start(timed_output)), codes::OUTPUT_BUFFER_EMPTY, "§8: Start before a Write");
}
