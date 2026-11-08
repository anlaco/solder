//! The engine's analog-input path (DT-087 slice 1), against what DAQmx did with a simulated NI device in LabVIEW
//! (labview-captures/reports/2026-11-06-daqmx-create-channel.md, -timing-trigger.md, -read-write.md). Time runs on a
//! virtual clock, so a one-second wait costs nothing and no test depends on the machine's speed.

use std::sync::Arc;
use std::time::Duration;

use solder_daq::clock::{Clock, VirtualClock};
use solder_daq::device::DeviceTable;
use solder_daq::engine::{Engine, SampleMode, SamplesRequested};
use solder_daq::error::codes;
use solder_daq::signal::{CONTINUOUS_PERIOD_SAMPLES, NOISE_RMS_VOLTS, SIMULATED_AMPLITUDE_VOLTS};

fn engine() -> (Engine, Arc<VirtualClock>) {
    let clock = Arc::new(VirtualClock::new());
    (Engine::new(DeviceTable::simulated(), clock.clone()), clock)
}

/// A task with `Dev1/ai0` created, ready to be timed.
fn task_with_channel(engine: &mut Engine) -> solder_daq::engine::TaskId {
    let task = engine.create_task("");
    engine.add_ai_voltage_channels(task, "Dev1/ai0", -5.0, 5.0).unwrap();
    task
}

const TEN_SECONDS: Option<Duration> = Some(Duration::from_secs(10));

#[test]
fn an_unnamed_task_is_named_by_its_count_and_a_named_one_keeps_its_name() {
    let (mut engine, _) = engine();
    let first = engine.create_task("");
    let second = engine.create_task("");
    let named = engine.create_task("My task");
    assert_eq!(engine.task_name(first).as_deref(), Some("_unnamedTask<1>"));
    assert_eq!(engine.task_name(second).as_deref(), Some("_unnamedTask<2>"));
    assert_eq!(engine.task_name(named).as_deref(), Some("My task"));
}

#[test]
fn channels_are_named_by_device_and_line_and_ranges_and_lists_expand() {
    let (mut engine, _) = engine();
    let task = engine.create_task("");
    assert_eq!(engine.add_ai_voltage_channels(task, "Dev1/ai0", -5.0, 5.0).unwrap(), ["Dev1/ai0"]);
    assert_eq!(engine.add_ai_voltage_channels(task, "Dev1/ai1:3", -5.0, 5.0).unwrap(), ["Dev1/ai1", "Dev1/ai2", "Dev1/ai3"]);
    assert_eq!(engine.add_ai_voltage_channels(task, "Dev1/ai4, Dev1/ai6", -5.0, 5.0).unwrap(), ["Dev1/ai4", "Dev1/ai6"]);
}

#[test]
fn a_device_that_does_not_exist_is_error_200220_naming_the_devices_that_do() {
    let (mut engine, _) = engine();
    let task = engine.create_task("");
    let error = engine.add_ai_voltage_channels(task, "Dev9/ai0", -5.0, 5.0).unwrap_err();
    assert_eq!(error.code, codes::DEVICE_NOT_VALID);
    assert_eq!(error.details.device.as_deref(), Some("Dev9"));
    assert_eq!(error.details.suggested_devices, ["Dev1", "Dev2"]);
    assert_eq!(error.details.task_name.as_deref(), Some("_unnamedTask<1>"));
}

#[test]
fn a_channel_that_does_not_exist_is_error_200170_naming_the_device_and_the_channel() {
    let (mut engine, _) = engine();
    let task = engine.create_task("");
    let error = engine.add_ai_voltage_channels(task, "Dev1/ai99", -5.0, 5.0).unwrap_err();
    assert_eq!(error.code, codes::PHYSICAL_CHANNEL_DOES_NOT_EXIST);
    assert_eq!(error.details.device.as_deref(), Some("Dev1"));
    assert_eq!(error.details.channel.as_deref(), Some("Dev1/ai99"));
}

#[test]
fn a_range_the_device_cannot_do_is_accepted_when_the_channel_is_created_and_refused_at_start() {
    // Measured: Dev1 with +-20 V gave no error at Create Virtual Channel and -200077 at Start.
    let (mut engine, _) = engine();
    let task = engine.create_task("");
    engine.add_ai_voltage_channels(task, "Dev1/ai0", -20.0, 20.0).unwrap();
    let error = engine.start(task).unwrap_err();
    assert_eq!(error.code, codes::UNSUPPORTED_PROPERTY_VALUE);
    assert_eq!(error.details.property, Some("AI.Min"));
    assert_eq!(error.details.requested, Some(-20.0));
    assert_eq!((error.details.minimum, error.details.maximum), (Some(-10.0), Some(10.0)));
    assert_eq!(error.details.channel.as_deref(), Some("Dev1/ai0"));
}

#[test]
fn a_rate_above_the_maximum_is_error_200077_at_timing_with_the_limits() {
    // Measured: 1 MHz on the simulated USB-6001 gave -200077 at Timing: requested 1e6, maximum 20e3, minimum 18.626450e-3.
    let (mut engine, _) = engine();
    let task = task_with_channel(&mut engine);
    let error = engine.configure_sample_clock(task, 1.0e6, SampleMode::FiniteSamples, 100).unwrap_err();
    assert_eq!(error.code, codes::UNSUPPORTED_PROPERTY_VALUE);
    assert_eq!(error.details.property, Some("SampClk.Rate"));
    assert_eq!((error.details.requested, error.details.maximum, error.details.minimum), (Some(1.0e6), Some(20.0e3), Some(18.626450e-3)));
    engine.configure_sample_clock(task, 1000.0, SampleMode::FiniteSamples, 100).unwrap();
    engine.configure_sample_clock(task, 1000.0, SampleMode::ContinuousSamples, 1000).unwrap();
}

#[test]
fn start_twice_is_error_200479_stop_without_start_and_clear_twice_are_not_errors() {
    let (mut engine, _) = engine();
    let task = task_with_channel(&mut engine);
    engine.configure_sample_clock(task, 1000.0, SampleMode::FiniteSamples, 100).unwrap();
    engine.stop(task).unwrap();
    engine.start(task).unwrap();
    assert_eq!(engine.start(task).unwrap_err().code, codes::TASK_ALREADY_RUNNING);
    engine.stop(task).unwrap();
    engine.clear(task).unwrap();
    engine.clear(task).unwrap();
}

#[test]
fn a_finite_read_gives_one_cycle_of_a_sine_with_noise_over_the_samples_asked_for() {
    let (mut engine, _) = engine();
    let task = task_with_channel(&mut engine);
    engine.configure_sample_clock(task, 1000.0, SampleMode::FiniteSamples, 1000).unwrap();
    engine.start(task).unwrap();
    let data = engine.read_f64(task, SamplesRequested::Available, TEN_SECONDS).unwrap();
    assert_eq!((data.len(), data[0].len()), (1, 1000), "one channel, every sample of the acquisition");
    // The peak of the cycle lies a quarter of the way in; the noise stays within its bounds.
    assert!((data[0][250] - SIMULATED_AMPLITUDE_VOLTS).abs() < 0.2, "peak {}", data[0][250]);
    let squares: f64 = data[0].iter().enumerate().map(|(index, value)| (value - SIMULATED_AMPLITUDE_VOLTS * (std::f64::consts::TAU * index as f64 / 1000.0).sin()).powi(2)).sum();
    let rms = (squares / 1000.0).sqrt();
    assert!((rms - NOISE_RMS_VOLTS).abs() < 0.01, "noise rms {rms}");
}

#[test]
fn the_same_acquisition_gives_the_same_numbers_however_it_is_read() {
    let (mut one_go, _) = engine();
    let (mut in_pieces, _) = engine();
    let read_all = |engine: &mut Engine, pieces: usize| {
        let task = task_with_channel(engine);
        engine.configure_sample_clock(task, 1000.0, SampleMode::FiniteSamples, 100).unwrap();
        engine.start(task).unwrap();
        (0..pieces).flat_map(|_| engine.read_f64(task, SamplesRequested::Count(100 / pieces), TEN_SECONDS).unwrap().remove(0)).collect::<Vec<f64>>()
    };
    assert_eq!(read_all(&mut one_go, 1), read_all(&mut in_pieces, 4));
}

#[test]
fn reading_more_than_a_finite_task_holds_gives_what_it_holds_and_the_next_read_is_error_200278() {
    let (mut engine, clock) = engine();
    let task = task_with_channel(&mut engine);
    engine.configure_sample_clock(task, 1000.0, SampleMode::FiniteSamples, 100).unwrap();
    engine.start(task).unwrap();
    let data = engine.read_f64(task, SamplesRequested::Count(200), Some(Duration::from_millis(500))).unwrap();
    assert_eq!(data[0].len(), 100, "measured: no error, no wait");
    assert_eq!(clock.now(), Duration::ZERO, "and no wait");
    assert_eq!(engine.read_f64(task, SamplesRequested::Count(10), TEN_SECONDS).unwrap_err().code, codes::READ_BEYOND_FINAL_SAMPLE);
}

#[test]
fn a_read_with_no_timing_is_one_sample_that_starts_the_task() {
    let (mut engine, clock) = engine();
    let task = task_with_channel(&mut engine);
    let data = engine.read_f64(task, SamplesRequested::Count(1), TEN_SECONDS).unwrap();
    assert_eq!((data.len(), data[0].len()), (1, 1));
    assert!(data[0][0].abs() < 0.2, "phase 0 of the sine, so only noise: {}", data[0][0]);
    assert_eq!(clock.now(), Duration::ZERO);
    assert_eq!(engine.start(task).unwrap_err().code, codes::TASK_ALREADY_RUNNING, "the read started it");
}

#[test]
fn a_continuous_read_waits_for_the_samples_to_be_acquired_or_runs_out_of_time() {
    let (mut engine, clock) = engine();
    let task = task_with_channel(&mut engine);
    engine.configure_sample_clock(task, 1000.0, SampleMode::ContinuousSamples, 1000).unwrap();
    engine.start(task).unwrap();

    // Measured: Read 100 with timeout 0 or 0.01 right after Start is -200284.
    assert_eq!(engine.read_f64(task, SamplesRequested::Count(100), Some(Duration::ZERO)).unwrap_err().code, codes::SAMPLES_NOT_YET_ACQUIRED);
    let before = clock.now();
    assert_eq!(engine.read_f64(task, SamplesRequested::Count(100), Some(Duration::from_millis(10))).unwrap_err().code, codes::SAMPLES_NOT_YET_ACQUIRED);
    assert_eq!(clock.now() - before, Duration::from_millis(10), "it waited the whole timeout");

    // Measured: reading "all available" never waits and gives what the acquisition holds (7, then 0, ...).
    let at_ten_ms = clock.now();
    assert_eq!(engine.read_f64(task, SamplesRequested::Available, Some(Duration::ZERO)).unwrap()[0].len(), at_ten_ms.as_millis() as usize);
    assert_eq!(engine.read_f64(task, SamplesRequested::Available, Some(Duration::ZERO)).unwrap()[0].len(), 0);

    // 1000 samples at 1 kHz take one second from where the clock stands.
    let wait_start = clock.now();
    let data = engine.read_f64(task, SamplesRequested::Count(1000), TEN_SECONDS).unwrap();
    assert_eq!(data[0].len(), 1000);
    let waited = clock.now() - wait_start;
    assert!(waited >= Duration::from_millis(980) && waited <= Duration::from_millis(1000), "waited {waited:?}");
}

#[test]
fn a_continuous_acquisition_carries_on_the_same_sine_across_reads() {
    let (mut engine, _) = engine();
    let task = task_with_channel(&mut engine);
    engine.configure_sample_clock(task, 1000.0, SampleMode::ContinuousSamples, 1000).unwrap();
    engine.start(task).unwrap();
    let quarter = CONTINUOUS_PERIOD_SAMPLES as usize / 4;
    let data = engine.read_f64(task, SamplesRequested::Count(quarter + 1), None).unwrap();
    assert!((data[0][quarter] - SIMULATED_AMPLITUDE_VOLTS).abs() < 0.2, "the peak, a quarter of a period in");
}

#[test]
fn wait_until_done_returns_for_a_finite_task_and_times_out_for_a_continuous_one() {
    let (mut engine, clock) = engine();
    let finite = task_with_channel(&mut engine);
    engine.configure_sample_clock(finite, 1000.0, SampleMode::FiniteSamples, 100).unwrap();
    engine.start(finite).unwrap();
    engine.wait_until_done(finite, TEN_SECONDS).unwrap();
    assert_eq!(clock.now(), Duration::from_millis(100), "the acquisition takes samples / rate");

    let continuous = task_with_channel(&mut engine);
    engine.configure_sample_clock(continuous, 1000.0, SampleMode::ContinuousSamples, 1000).unwrap();
    engine.start(continuous).unwrap();
    let before = clock.now();
    assert_eq!(engine.wait_until_done(continuous, Some(Duration::from_millis(500))).unwrap_err().code, codes::WAIT_TIMED_OUT);
    assert_eq!(clock.now() - before, Duration::from_millis(500));
}
