//! The engine's analog-output path, against what DAQmx did on the two simulated devices in LabVIEW
//! (labview-captures/reports/2026-11-15-daqmx-ao.md, §n in each test). Time runs on a virtual clock.

use std::sync::Arc;
use std::time::Duration;

use solder_daq::clock::{Clock, VirtualClock};
use solder_daq::device::DeviceTable;
use solder_daq::engine::{Engine, SampleMode, SamplesRequested, TaskId};
use solder_daq::error::codes;

fn engine() -> (Engine, Arc<VirtualClock>) {
    let clock = Arc::new(VirtualClock::new());
    (Engine::new(DeviceTable::simulated(), clock.clone()), clock)
}

fn output_task(engine: &mut Engine, channels: &str, minimum: f64, maximum: f64) -> TaskId {
    let task = engine.create_task("");
    engine.add_ao_voltage_channels(task, channels, minimum, maximum).unwrap();
    task
}

fn error_code<T>(result: Result<T, solder_daq::error::DaqError>) -> i32 {
    result.err().map_or(0, |error| error.code)
}

const ONE_SECOND: Option<Duration> = Some(Duration::from_secs(1));

#[test]
fn each_simulated_device_has_two_outputs_and_a_missing_line_is_refused_at_create() {
    let (mut engine, _) = engine();
    for device in ["Dev1", "Dev2"] {
        let task = engine.create_task("");
        assert_eq!(engine.add_ao_voltage_channels(task, &format!("{device}/ao0:1"), -10.0, 10.0).unwrap(), [format!("{device}/ao0"), format!("{device}/ao1")]);
        for missing in ["ao2", "ao0:2"] {
            let other = engine.create_task("");
            assert_eq!(error_code(engine.add_ao_voltage_channels(other, &format!("{device}/{missing}"), -10.0, 10.0)), codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST, "§2, §3: {missing}");
        }
    }
    let reversed = engine.create_task("");
    assert_eq!(engine.add_ao_voltage_channels(reversed, "Dev1/ao1:0", -10.0, 10.0).unwrap().len(), 2, "§2: ao1:0 is two channels");
}

#[test]
fn a_single_sample_goes_out_at_once_and_leaves_the_task_stopped() {
    let (mut engine, _) = engine();
    let task = output_task(&mut engine, "Dev1/ao0", -10.0, 10.0);
    let outcome = engine.write_f64(task, &[vec![3.0]], true);
    assert_eq!((outcome.written, outcome.result), (1, Ok(())), "§4");
    assert_eq!(engine.last_written(task).unwrap(), [vec![3.0]]);
    engine.configure_sample_clock(task, 1000.0, SampleMode::FiniteSamples, 100).expect("§4: Timing can still be set, so the task is stopped");
    let untimed = output_task(&mut engine, "Dev1/ao0", -10.0, 10.0);
    assert_eq!(engine.write_f64(untimed, &[vec![3.0]], false).result.unwrap_err().code, codes::WRITE_NEEDS_RUNNING_TASK, "§4: auto start off, no Timing");
    engine.start(untimed).unwrap();
    assert_eq!(engine.write_f64(untimed, &[vec![3.0]], false).result, Ok(()), "§4: after Start it works");
}

#[test]
fn dev1_takes_its_range_joined_with_ten_volts_and_dev2_only_its_range() {
    let (mut engine, _) = engine();
    let wide = output_task(&mut engine, "Dev1/ao0", -20.0, 20.0);
    assert_eq!(engine.write_f64(wide, &[vec![15.0]], true).result, Ok(()), "§2: -20..20 takes 15 on Dev1");
    assert_eq!(engine.write_f64(wide, &[vec![20.5]], true).result.unwrap_err().code, codes::DATA_OUTSIDE_RANGE);
    let narrow = output_task(&mut engine, "Dev1/ao0", -5.0, 5.0);
    assert_eq!(engine.write_f64(narrow, &[vec![7.0]], true).result, Ok(()), "§2: -5..5 still takes 7 on Dev1");
    let outside = engine.write_f64(narrow, &[vec![11.0]], true);
    assert_eq!((outside.written, outside.result.unwrap_err().code), (1, codes::DATA_OUTSIDE_RANGE), "§4: one written even so");

    let strict = output_task(&mut engine, "Dev2/ao0", -5.0, 5.0);
    assert_eq!(engine.write_f64(strict, &[vec![7.0]], true).result.unwrap_err().code, codes::DATA_OUTSIDE_RANGE, "§3");
    let too_wide = output_task(&mut engine, "Dev2/ao0", -20.0, 20.0);
    let refused = engine.write_f64(too_wide, &[vec![3.0]], true);
    assert_eq!(refused.result.unwrap_err().code, codes::UNSUPPORTED_PROPERTY_VALUE, "§3: at the Write that starts it");
    assert_eq!(error_code(engine.start(too_wide)), codes::UNSUPPORTED_PROPERTY_VALUE, "§3: at Start");
}

#[test]
fn a_range_whose_minimum_is_not_below_its_maximum_is_refused_at_start_not_at_create() {
    let (mut engine, _) = engine();
    let task = output_task(&mut engine, "Dev1/ao0", 5.0, -5.0);
    assert_eq!(error_code(engine.start(task)), codes::MINIMUM_NOT_BELOW_MAXIMUM, "§2");
    assert_eq!(engine.write_f64(task, &[vec![1.0]], true).result.unwrap_err().code, codes::MINIMUM_NOT_BELOW_MAXIMUM);
}

#[test]
fn a_finite_generation_ends_after_its_samples_and_then_takes_no_write_until_stopped() {
    let (mut engine, clock) = engine();
    let task = output_task(&mut engine, "Dev1/ao0", -10.0, 10.0);
    engine.configure_sample_clock(task, 1000.0, SampleMode::FiniteSamples, 100).unwrap();
    assert_eq!(error_code(engine.start(task)), codes::OUTPUT_BUFFER_EMPTY, "§5: Dev1 refuses to start with nothing written");
    let outcome = engine.write_f64(task, &[vec![1.0; 50]], false);
    assert_eq!((outcome.written, outcome.result), (50, Ok(())), "§5: fewer values than samples");
    engine.start(task).unwrap();
    let before = clock.now();
    engine.wait_until_done(task, Some(Duration::from_secs(10))).unwrap();
    assert_eq!(clock.now() - before, Duration::from_millis(100), "§5: 100 samples at 1 kHz, whatever was written");
    assert_eq!(engine.write_f64(task, &[vec![1.0; 100]], false).result.unwrap_err().code, codes::WRITE_BEYOND_FINAL_SAMPLE, "§5: ended, not stopped");
    engine.stop(task).unwrap();
    assert_eq!(engine.write_f64(task, &[vec![1.0; 200]], false).written, 200, "§5: after Stop, and more than the samples");
    engine.start(task).expect("§5: it starts again");
}

#[test]
fn dev2_starts_a_timed_generation_with_nothing_written_and_auto_start_starts_it() {
    let (mut engine, _) = engine();
    let task = output_task(&mut engine, "Dev2/ao0", -10.0, 10.0);
    engine.configure_sample_clock(task, 1000.0, SampleMode::FiniteSamples, 100).unwrap();
    engine.start(task).expect("§5: Dev2 starts with an empty buffer");
    engine.stop(task).unwrap();
    assert_eq!(engine.write_f64(task, &[vec![0.5; 100]], true).written, 100);
    assert_eq!(error_code(engine.start(task)), codes::TASK_ALREADY_RUNNING, "auto start started it");
}

#[test]
fn a_continuous_generation_takes_writes_while_it_runs_and_none_once_stopped() {
    let (mut engine, _) = engine();
    let task = output_task(&mut engine, "Dev1/ao0", -10.0, 10.0);
    engine.configure_sample_clock(task, 1000.0, SampleMode::ContinuousSamples, 1000).unwrap();
    assert_eq!(engine.write_f64(task, &[vec![0.0; 1000]], false).written, 1000, "§6");
    engine.start(task).unwrap();
    assert_eq!(engine.write_f64(task, &[vec![0.0; 100]], false).written, 100, "§6: while running");
    assert_eq!(error_code(engine.wait_until_done(task, ONE_SECOND)), codes::WAIT_TIMED_OUT, "§6");
    engine.stop(task).unwrap();
    assert_eq!(engine.write_f64(task, &[vec![0.0; 100]], false).result.unwrap_err().code, codes::WRITE_BEYOND_FINAL_SAMPLE, "§6: after Stop");
}

#[test]
fn the_data_has_one_row_per_channel_or_none_at_all() {
    let (mut engine, _) = engine();
    let task = output_task(&mut engine, "Dev1/ao0:1", -10.0, 10.0);
    engine.configure_sample_clock(task, 1000.0, SampleMode::FiniteSamples, 100).unwrap();
    for rows in [1, 3, 4] {
        let outcome = engine.write_f64(task, &vec![vec![0.0; 100]; rows], true);
        assert_eq!((outcome.written, outcome.result.unwrap_err().code), (0, codes::CHANNEL_COUNT_MISMATCH), "§7: {rows} rows for 2 channels");
    }
    assert_eq!(engine.write_f64(task, &[], true), solder_daq::output::WriteOutcome { written: 0, result: Ok(()) }, "§7: 0 x 0");
    assert_eq!(engine.write_f64(task, &vec![vec![0.0; 50]; 2], false).written, 50, "§7: 2 x 50");
}

#[test]
fn a_write_needs_output_channels_and_a_read_needs_input_channels() {
    let (mut engine, _) = engine();
    let input = engine.create_task("");
    engine.add_ai_voltage_channels(input, "Dev1/ai0", -10.0, 10.0).unwrap();
    assert_eq!(engine.write_f64(input, &[vec![1.0]], true).result.unwrap_err().code, codes::NO_OUTPUT_CHANNELS, "§8");
    let output = output_task(&mut engine, "Dev1/ao0", -10.0, 10.0);
    assert_eq!(error_code(engine.read_f64(output, SamplesRequested::Count(1), ONE_SECOND)), codes::NO_INPUT_CHANNELS, "§8");
    let empty = engine.create_task("");
    for auto_start in [true, false] {
        assert_eq!(engine.write_f64(empty, &[vec![1.0]], auto_start).result.unwrap_err().code, codes::NO_DEVICES_IN_TASK, "§9");
    }
    engine.clear(empty).unwrap();
    assert_eq!(engine.write_f64(empty, &[vec![1.0]], true).result.unwrap_err().code, codes::INVALID_TASK, "§9: a cleared task");
}
