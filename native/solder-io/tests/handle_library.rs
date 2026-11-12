//! Handles reach a library as LabVIEW's do (DT-088): the host builds the block, passes the handle, and gives back what
//! the library left in it, resized or not with LabVIEW's memory functions, which the host offers through its memory
//! bridge (DT-088 §4). The library is a small one compiled here with `rustc` (tests/fixtures/handle_functions.rs).

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use solder_io::{Argument, Call, CallResult, LibraryCaller, NumberKind, ReturnKind};

/// LabVIEW's cintools, whose `labview.lib` a Windows library built for LabVIEW links (measured,
/// `labview-captures/reports/2026-11-08-labview-memory-manager-imports.md`); where it is installed, a copy of the fixture
/// is built with it.
#[cfg(windows)]
const CINTOOLS_FOLDER: &str = r"C:\Program Files\National Instruments\LabVIEW 2026\cintools";

fn target_folder() -> PathBuf {
    PathBuf::from(env!("CARGO_TARGET_TMPDIR"))
}

fn library_file(stem: &str) -> String {
    format!("{}{stem}.{}", std::env::consts::DLL_PREFIX, std::env::consts::DLL_EXTENSION)
}

/// Compiles a Rust source into a library with `rustc`, with any extra arguments, and gives its path.
fn compile_library(source: &Path, crate_name: &str, output: &Path, extra_arguments: &[&str]) -> PathBuf {
    let status = Command::new("rustc")
        .args(["--edition", "2024", "--crate-type", "cdylib", "--crate-name", crate_name])
        .args(extra_arguments)
        .arg(source)
        .arg("-o")
        .arg(output)
        .status()
        .expect("rustc runs");
    assert!(status.success(), "{} compiles", source.display());
    output.to_path_buf()
}

/// The bridge's file, compiled once. On Windows it is `lvrt.dll`, in a folder of its own, the name a library built for
/// LabVIEW looks its memory functions up in (DT-088 §4).
fn memory_bridge() -> &'static Path {
    static BRIDGE: OnceLock<PathBuf> = OnceLock::new();
    BRIDGE.get_or_init(|| {
        let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../solder-memory-bridge/src/lib.rs");
        if cfg!(windows) {
            let folder = target_folder().join("memory-bridge");
            std::fs::create_dir_all(&folder).expect("the bridge's folder is made");
            compile_library(&source, "lvrt", &folder.join("lvrt.dll"), &[])
        } else {
            compile_library(&source, "solder_memory_bridge", &target_folder().join(library_file("solder_memory_bridge_for_tests")), &[])
        }
    })
}

/// LabVIEW's memory functions, installed once for the tests as the host installs them before loading any library.
fn install_memory_bridge() {
    static INSTALLED: OnceLock<()> = OnceLock::new();
    INSTALLED.get_or_init(|| solder_io::install_memory_bridge(memory_bridge()).expect("the bridge library is installed"));
}

/// Compiles the fixture once for all the tests and gives the path of the library. On Linux the memory functions are
/// left unresolved, as in a library built for LabVIEW there; on Windows, where a library must name where every function
/// comes from, it imports them from the bridge's `lvrt.dll`.
fn fixture_library() -> &'static str {
    static LIBRARY: OnceLock<PathBuf> = OnceLock::new();
    LIBRARY
        .get_or_init(|| {
            let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/handle_functions.rs");
            let output = target_folder().join(library_file("handle_fixture"));
            if cfg!(windows) {
                // rustc names the import library of `lvrt.dll` `lvrt.dll.lib`, which `-l dylib=lvrt.dll` links.
                let bridge_folder = memory_bridge().parent().expect("the bridge is in a folder").to_str().expect("the path is text").to_string();
                compile_library(&source, "handle_fixture", &output, &["-L", &bridge_folder, "-l", "dylib=lvrt.dll"])
            } else {
                compile_library(&source, "handle_fixture", &output, &[])
            }
        })
        .to_str()
        .expect("the path is text")
}

fn call_in(library: &str, function: &str, return_kind: ReturnKind, arguments: Vec<Argument>) -> CallResult {
    install_memory_bridge();
    LibraryCaller::new().call(Call { library: library.to_string(), function: function.to_string(), return_kind, arguments }).expect("the call is made")
}

fn call(function: &str, return_kind: ReturnKind, arguments: Vec<Argument>) -> CallResult {
    call_in(fixture_library(), function, return_kind, arguments)
}

/// A string's block, as LabVIEW's `LStr` is: its length, then its bytes.
fn string_block(text: &str) -> Vec<u8> {
    [&(text.len() as i32).to_le_bytes()[..], text.as_bytes()].concat()
}

/// Where an array's doubles start: after its dimension sizes, padded to a double's alignment on a 64-bit system.
fn doubles_offset(dimension_count: usize) -> usize {
    (4 * dimension_count).next_multiple_of(8)
}

/// An array's block: its dimension sizes, the padding, then its doubles.
fn double_block(dimensions: &[i32], elements: &[f64]) -> Vec<u8> {
    let mut block: Vec<u8> = dimensions.iter().flat_map(|size| size.to_le_bytes()).collect();
    block.resize(doubles_offset(dimensions.len()), 0);
    block.extend(elements.iter().flat_map(|element| element.to_le_bytes()));
    block
}

fn doubles_in(block: &[u8], dimension_count: usize) -> Vec<f64> {
    block[doubles_offset(dimension_count)..].chunks(8).map(|bytes| f64::from_le_bytes(bytes.try_into().unwrap())).collect()
}

#[test]
fn a_string_handle_reaches_the_function_with_the_length_in_its_block() {
    let result = call("fixture_string_length", ReturnKind::Number(NumberKind::I32), vec![Argument::Handle(string_block("hello"))]);
    assert_eq!(result.returned, 5i32.to_le_bytes());
}

#[test]
fn what_the_function_writes_into_a_string_handle_comes_back() {
    let result = call("fixture_string_to_upper", ReturnKind::Void, vec![Argument::Handle(string_block("hello"))]);
    assert_eq!(result.arguments[0], string_block("HELLO"));
}

#[test]
fn an_empty_string_is_a_handle_whose_block_is_only_its_length() {
    let result = call("fixture_string_length", ReturnKind::Number(NumberKind::I32), vec![Argument::Handle(string_block(""))]);
    assert_eq!(result.returned, 0i32.to_le_bytes());
    assert_eq!(result.arguments[0], string_block(""));
}

#[test]
fn an_array_handle_reaches_the_function_with_its_dimension_and_its_elements() {
    let result = call("fixture_array_sum_f64", ReturnKind::Number(NumberKind::F64), vec![Argument::Handle(double_block(&[3], &[1.5, 2.5, 3.0]))]);
    assert_eq!(f64::from_le_bytes(result.returned.try_into().unwrap()), 7.0);
}

#[test]
fn what_the_function_writes_into_an_array_handle_comes_back_with_its_dimensions() {
    let scale = Argument::Value { kind: NumberKind::F64, bytes: 2.0f64.to_le_bytes().to_vec() };
    let result = call("fixture_array_scale_f64", ReturnKind::Void, vec![Argument::Handle(double_block(&[3], &[1.0, 2.0, 3.0])), scale]);
    assert_eq!(result.arguments[0][..4], 3i32.to_le_bytes(), "the dimension is still there");
    assert_eq!(doubles_in(&result.arguments[0], 1), [2.0, 4.0, 6.0]);
}

#[test]
fn a_two_dimensional_array_handle_carries_both_sizes_and_other_buffers_still_work_beside_it() {
    let rows = Argument::Buffer(vec![0; 4]);
    let columns = Argument::Buffer(vec![0; 4]);
    let result = call("fixture_array2d_shape", ReturnKind::Void, vec![Argument::Handle(double_block(&[2, 3], &[0.0; 6])), rows, columns]);
    assert_eq!(result.arguments[1], 2i32.to_le_bytes());
    assert_eq!(result.arguments[2], 3i32.to_le_bytes());
}

/// LabVIEW's `mZoneErr` (extcode.h): Solder's answer for a handle its memory manager does not know.
const UNKNOWN_HANDLE_ERROR: i32 = 3;

fn number(kind: NumberKind, bytes: &[u8]) -> Argument {
    Argument::Value { kind, bytes: bytes.to_vec() }
}

#[test]
fn a_library_that_grows_a_string_handle_with_ds_set_handle_size_gives_back_the_longer_string() {
    let arguments = vec![Argument::Handle(string_block("ab")), number(NumberKind::U8, b"z"), number(NumberKind::I32, &5i32.to_le_bytes())];
    let result = call("fixture_string_repeat", ReturnKind::Number(NumberKind::I32), arguments);
    assert_eq!(result.returned, 0i32.to_le_bytes(), "no error");
    assert_eq!(result.arguments[0], string_block("zzzzz"));
}

#[test]
fn a_library_that_shrinks_a_string_handle_gives_back_the_shorter_block() {
    let arguments = vec![Argument::Handle(string_block("a long string")), number(NumberKind::U8, b"q"), number(NumberKind::I32, &1i32.to_le_bytes())];
    let result = call("fixture_string_repeat", ReturnKind::Number(NumberKind::I32), arguments);
    assert_eq!(result.arguments[0], string_block("q"));
}

#[test]
fn a_library_that_resizes_an_array_with_numeric_array_resize_gives_back_every_element() {
    let result = call("fixture_array_ramp_f64", ReturnKind::Number(NumberKind::I32), vec![Argument::Handle(double_block(&[0], &[])), number(NumberKind::I32, &1000i32.to_le_bytes())]);
    assert_eq!(result.returned, 0i32.to_le_bytes(), "no error");
    assert_eq!(result.arguments[0][..4], 1000i32.to_le_bytes());
    let expected: Vec<f64> = (0..1000).map(f64::from).collect();
    assert_eq!(doubles_in(&result.arguments[0], 1), expected);
}

#[test]
fn a_library_makes_measures_copies_into_and_disposes_of_handles_of_its_own() {
    let results = Argument::Buffer(vec![0; 6 * 4]);
    let result = call("fixture_handle_round_trip", ReturnKind::Void, vec![number(NumberKind::U64, &16u64.to_le_bytes()), results]);
    let answered: Vec<i32> = result.arguments[1].chunks(4).map(|bytes| i32::from_le_bytes(bytes.try_into().unwrap())).collect();
    assert_eq!(answered[0], 16, "DSGetHandleSize of a new handle");
    assert_eq!(answered[1], 42, "MoveBlock copied a byte between two blocks");
    assert_eq!(answered[2], 32, "DSSetHandleSize grew the block");
    assert_eq!(answered[3], 0, "the first disposal");
    assert_eq!(answered[4], 0, "the second handle's disposal");
    assert_eq!(answered[5], UNKNOWN_HANDLE_ERROR, "a handle already disposed of is refused");
}

#[test]
fn a_cleared_handle_holds_only_zeros() {
    let result = call("fixture_cleared_handle_is_zeros", ReturnKind::Number(NumberKind::I32), vec![number(NumberKind::U64, &4096u64.to_le_bytes())]);
    assert_eq!(result.returned, 1i32.to_le_bytes());
}

#[test]
fn the_host_refuses_to_resize_a_cell_it_did_not_make() {
    let result = call("fixture_resize_a_stranger", ReturnKind::Number(NumberKind::I32), vec![]);
    assert_eq!(result.returned, UNKNOWN_HANDLE_ERROR.to_le_bytes());
}

/// The fixture linked with LabVIEW's own `labview.lib`, as a library built for LabVIEW on Windows is: its memory
/// functions are stubs that look them up in `lvrt.dll` when first called. `None` where cintools is not installed.
#[cfg(windows)]
fn fixture_linked_with_cintools() -> Option<&'static str> {
    static LIBRARY: OnceLock<Option<PathBuf>> = OnceLock::new();
    LIBRARY
        .get_or_init(|| {
            Path::new(CINTOOLS_FOLDER).join("labview.lib").is_file().then(|| {
                let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/handle_functions.rs");
                let output = target_folder().join("handle_fixture_cintools.dll");
                // The stub reports a function it cannot find with `MessageBoxA`, so `labview.lib` needs `user32` (measured).
                compile_library(&source, "handle_fixture_cintools", &output, &["-L", CINTOOLS_FOLDER, "-l", "static=labview", "-l", "user32"])
            })
        })
        .as_deref()
        .map(|path| path.to_str().expect("the path is text"))
}

#[cfg(windows)]
#[test]
fn a_library_linked_with_labviews_own_labview_lib_finds_the_memory_functions_in_the_bridge() {
    let Some(library) = fixture_linked_with_cintools() else {
        eprintln!("LabVIEW's cintools is not installed at {CINTOOLS_FOLDER}: nothing to check");
        return;
    };
    let arguments = vec![Argument::Handle(string_block("ab")), number(NumberKind::U8, b"z"), number(NumberKind::I32, &5i32.to_le_bytes())];
    let result = call_in(library, "fixture_string_repeat", ReturnKind::Number(NumberKind::I32), arguments);
    assert_eq!(result.returned, 0i32.to_le_bytes(), "no error");
    assert_eq!(result.arguments[0], string_block("zzzzz"));
    let result = call_in(library, "fixture_array_ramp_f64", ReturnKind::Number(NumberKind::I32), vec![Argument::Handle(double_block(&[0], &[])), number(NumberKind::I32, &4i32.to_le_bytes())]);
    assert_eq!(result.returned, 0i32.to_le_bytes(), "no error");
    assert_eq!(doubles_in(&result.arguments[0], 1), [0.0, 1.0, 2.0, 3.0]);
}

#[test]
fn a_returned_pascal_string_is_read_by_its_unsigned_length_byte() {
    let result = call("fixture_pascal_return_long", ReturnKind::PascalString, vec![]);
    assert_eq!(result.returned, vec![b'x'; 200]);
}
