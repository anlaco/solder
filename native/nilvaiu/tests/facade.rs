//! Solder's `nilvaiu` called as a node calls it: through `solder-io`'s `LibraryCaller`, with LabVIEW's handles and the
//! memory bridge installed, as the I/O process does (DT-087, DT-088). What is asserted was measured in LabVIEW with NI's
//! own library (`labview-captures/reports/2026-11-13-daq-taskid.md`, `-daq-create-task.md`, `2026-11-06-daqmx-*.md`).
//! No test waits on the clock: the waits are the engine's, tested on a virtual clock in `solder-daq`.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use solder_io::{Argument, Call, CallResult, LibraryCaller, NumberKind, ReturnKind, task_records};

const INVALID_TASK: i32 = -200088;
const TASK_HAS_NO_CHANNELS: i32 = -200478;
const DEVICE_NOT_VALID: i32 = -200220;
const NOT_BUILT_IN_SOLDER: i32 = -1;
const VOLTS: i32 = 10348;
const FINITE_SAMPLES: i32 = 10178;
const RISING: i32 = 10280;
const START: u32 = 0;

fn target_folder() -> PathBuf {
    PathBuf::from(env!("CARGO_TARGET_TMPDIR"))
}

fn library_file(stem: &str) -> String {
    format!("{}{stem}.{}", std::env::consts::DLL_PREFIX, std::env::consts::DLL_EXTENSION)
}

/// The library, built once with cargo as the release builds it: a test of a cdylib cannot link it, so cargo does not
/// build it for the tests by itself.
fn library() -> &'static str {
    static LIBRARY: OnceLock<PathBuf> = OnceLock::new();
    LIBRARY
        .get_or_init(|| {
            let status = Command::new(env!("CARGO")).args(["build", "-q", "-p", "nilvaiu"]).status().expect("cargo runs");
            assert!(status.success(), "nilvaiu builds");
            target_folder().parent().expect("tmp is in the target folder").join("debug").join(library_file("nilvaiu"))
        })
        .to_str()
        .expect("the path is text")
}

/// The memory bridge, compiled once and installed, as the I/O process installs it before loading any library. On
/// Windows it is `lvrt.dll`, the module `nilvaiu` imports from (DT-088 §4).
fn install_memory_bridge() {
    static INSTALLED: OnceLock<()> = OnceLock::new();
    INSTALLED.get_or_init(|| {
        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../solder-memory-bridge/src/lib.rs");
        let (crate_name, output) = if cfg!(windows) {
            let folder = target_folder().join("nilvaiu-bridge");
            std::fs::create_dir_all(&folder).expect("the bridge's folder is made");
            ("lvrt", folder.join("lvrt.dll"))
        } else {
            ("solder_memory_bridge", target_folder().join(library_file("solder_memory_bridge_for_nilvaiu")))
        };
        compile_bridge(&source, crate_name, &output);
        solder_io::install_memory_bridge(&output).expect("the bridge is installed");
    });
}

fn compile_bridge(source: &Path, crate_name: &str, output: &Path) {
    let status = Command::new("rustc")
        .args(["--edition", "2024", "--crate-type", "cdylib", "--crate-name", crate_name])
        .arg(source)
        .arg("-o")
        .arg(output)
        .status()
        .expect("rustc runs");
    assert!(status.success(), "the bridge compiles");
}

fn call(function: &str, arguments: Vec<Argument>) -> CallResult {
    install_memory_bridge();
    let call = Call { library: library().to_string(), function: function.to_string(), return_kind: ReturnKind::Number(NumberKind::I32), arguments };
    LibraryCaller::new().call(call).expect("the call is made")
}

fn code_of(result: &CallResult) -> i32 {
    i32::from_le_bytes(result.returned.clone().try_into().expect("an int32"))
}

fn string(text: &str) -> Argument {
    Argument::Handle([&(text.len() as i32).to_le_bytes()[..], text.as_bytes()].concat())
}

fn text_of(block: &[u8]) -> String {
    String::from_utf8(block[4..].to_vec()).expect("text")
}

fn number<T: Into<f64>>(kind: NumberKind, value: T) -> Argument {
    let value: f64 = value.into();
    let bytes = match kind {
        NumberKind::F64 => value.to_le_bytes().to_vec(),
        NumberKind::I32 => (value as i32).to_le_bytes().to_vec(),
        NumberKind::U32 => (value as u32).to_le_bytes().to_vec(),
        NumberKind::U8 => vec![value as u8],
        _ => panic!("not used here"),
    };
    Argument::Value { kind, bytes }
}

fn address(value: usize) -> Argument {
    Argument::Value { kind: NumberKind::U64, bytes: (value as u64).to_le_bytes().to_vec() }
}

/// The cell a task wire keeps its record's address in, as the node points the library to it.
fn record_cell(record: usize) -> Argument {
    Argument::Buffer(record.to_le_bytes().to_vec())
}

fn record_in(cell: &[u8]) -> usize {
    usize::from_le_bytes(cell.try_into().expect("an address"))
}

/// A task created with `DAQCreateTask140`: its record's address.
fn create_task(name: &str) -> usize {
    let result = call("DAQCreateTask140", vec![address(0), record_cell(0), string(name), string(""), number(NumberKind::U8, 1), string(""), string("")]);
    assert_eq!(code_of(&result), 0);
    assert_eq!(text_of(&result.arguments[6]), "");
    record_in(&result.arguments[1])
}

/// The `taskID` a node passes for a task wire: the driver's task object, reached through the record.
fn task_id(record: usize) -> usize {
    task_records::task_object_of(record).expect("the record links to a task object")
}

fn add_channels(record: usize, physical_channels: &str) -> CallResult {
    call(
        "DAQCreateAIVoltageChan",
        vec![address(0), record_cell(record), string(physical_channels), string(""), number(NumberKind::I32, -1), number(NumberKind::F64, -5.0), number(NumberKind::F64, 5.0), number(NumberKind::I32, VOLTS), string(""), string(""), string("")],
    )
}

fn control(task_id: usize, mode: u32) -> CallResult {
    call("DAQControl", vec![address(task_id), number(NumberKind::U32, mode), string("")])
}

fn destroy(record: usize) -> CallResult {
    call("DAQDestroyTask110", vec![record_cell(record), string("")])
}

fn time_finite(task_id: usize, samples: u32) {
    let samples = Argument::Value { kind: NumberKind::U64, bytes: u64::from(samples).to_le_bytes().to_vec() };
    let result = call("DAQCfgSampClkTiming", vec![address(task_id), string(""), number(NumberKind::F64, 1000.0), number(NumberKind::I32, RISING), number(NumberKind::I32, FINITE_SAMPLES), samples, string("")]);
    assert_eq!(code_of(&result), 0);
}

/// An empty array handle of doubles with `dimension_count` dimensions, for a read to fill.
fn empty_doubles(dimension_count: usize) -> Argument {
    Argument::Handle(vec![0; (4 * dimension_count).next_multiple_of(8)])
}

fn dimensions_and_doubles(block: &[u8], dimension_count: usize) -> (Vec<i32>, Vec<f64>) {
    let dimensions = (0..dimension_count).map(|index| i32::from_le_bytes(block[4 * index..4 * index + 4].try_into().unwrap())).collect();
    let doubles = block[(4 * dimension_count).next_multiple_of(8)..].chunks(8).map(|bytes| f64::from_le_bytes(bytes.try_into().unwrap())).collect();
    (dimensions, doubles)
}

#[test]
fn create_writes_a_record_of_the_task_whose_task_object_the_other_functions_are_given() {
    let record = create_task("p1");
    assert_eq!(task_records::name_and_number_of(record).map(|(name, _)| name).as_deref(), Some("p1"));
    let result = control(task_id(record), START);
    assert_eq!(code_of(&result), TASK_HAS_NO_CHANNELS);
    assert_eq!(text_of(&result.arguments[2]), "<append>\n<B>Task Name: </B>p1");
    assert_eq!(code_of(&destroy(record)), 0);
}

#[test]
fn a_task_id_of_zero_or_an_address_that_is_not_a_task_is_error_200088() {
    let record = create_task("not a task id");
    for task_id in [0, record] {
        let result = control(task_id, START);
        assert_eq!((code_of(&result), text_of(&result.arguments[2])), (INVALID_TASK, "<append>\n".to_string()));
    }
    destroy(record);
}

#[test]
fn two_tasks_have_different_records_and_task_objects() {
    let (first, second) = (create_task("one"), create_task("two"));
    assert_ne!(first, second);
    assert_ne!(task_id(first), task_id(second));
    destroy(first);
    destroy(second);
}

#[test]
fn a_finite_acquisition_reads_its_samples_and_a_destroyed_task_is_no_longer_one() {
    let record = create_task("finite");
    let added = add_channels(record, "Dev1/ai0");
    assert_eq!((code_of(&added), text_of(&added.arguments[9])), (0, "Dev1/ai0".to_string()));
    let task = task_id(record);
    time_finite(task, 100);
    let read = call("DAQRead1ChanNSamp1DF64", vec![address(task), number(NumberKind::I32, -1), number(NumberKind::F64, 10.0), empty_doubles(1), string("")]);
    assert_eq!(code_of(&read), 0);
    let (dimensions, samples) = dimensions_and_doubles(&read.arguments[3], 1);
    assert_eq!((dimensions, samples.len()), (vec![100], 100));
    assert!(samples.iter().all(|sample| sample.abs() <= 5.0));

    assert_eq!(code_of(&destroy(record)), 0);
    assert!(task_records::task_object_of(record).is_none());
    assert_eq!(code_of(&control(task, START)), INVALID_TASK);
}

#[test]
fn adding_a_channel_with_no_task_creates_one_and_writes_its_record() {
    let added = add_channels(0, "Dev1/ai1");
    assert_eq!(code_of(&added), 0);
    let record = record_in(&added.arguments[1]);
    let (name, _) = task_records::name_and_number_of(record).expect("a record was written");
    assert!(name.starts_with("_unnamedTask<"), "{name}");
    destroy(record);
}

#[test]
fn an_on_demand_read_of_one_sample_needs_no_timing() {
    let record = create_task("on demand");
    add_channels(record, "Dev1/ai0");
    let read = call("DAQRead1Chan1SampF64", vec![address(task_id(record)), number(NumberKind::F64, 10.0), Argument::Buffer(vec![0; 8]), string("")]);
    assert_eq!(code_of(&read), 0);
    let sample = f64::from_le_bytes(read.arguments[2].clone().try_into().unwrap());
    assert!(sample.abs() <= 5.0 && sample != 0.0);
    destroy(record);
}

#[test]
fn a_two_dimensional_read_has_a_row_per_channel() {
    let record = create_task("two channels");
    add_channels(record, "Dev1/ai0:1");
    time_finite(task_id(record), 10);
    let read = call("DAQReadNChanNSamp2DF64", vec![address(task_id(record)), number(NumberKind::I32, 10), number(NumberKind::F64, 10.0), empty_doubles(2), string("")]);
    assert_eq!(code_of(&read), 0);
    let (dimensions, samples) = dimensions_and_doubles(&read.arguments[3], 2);
    assert_eq!((dimensions, samples.len()), (vec![2, 10], 20));
    destroy(record);
}

#[test]
fn a_device_that_does_not_exist_names_it_and_the_devices_present() {
    let record = create_task("bad device");
    let added = add_channels(record, "Dev9/ai0");
    assert_eq!(code_of(&added), DEVICE_NOT_VALID);
    let text = text_of(&added.arguments[10]);
    assert!(text.starts_with("<append>\n") && text.contains("Dev9") && text.contains("Dev1") && text.ends_with("<B>Task Name: </B>bad device"), "{text}");
    destroy(record);
}

#[test]
fn a_function_not_built_yet_is_found_and_says_so_with_solders_code() {
    let result = call("DAQCfgDigEdgeStartTrig", vec![address(0), string(""), number(NumberKind::I32, RISING), string("")]);
    assert_eq!(code_of(&result), NOT_BUILT_IN_SOLDER);
    assert_eq!(text_of(&result.arguments[3]), "<append>\nSolder's DAQ driver does not do a digital edge start trigger yet.");
}
