//! Handles reach a library as LabVIEW's do (DT-088): the host builds the block, passes the handle, and gives back what
//! the library left in it. The library is a small one compiled here with `rustc` (tests/fixtures/handle_functions.rs).

use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use solder_io::{Argument, Call, CallResult, LibraryCaller, NumberKind, ReturnKind};

/// Compiles the fixture once for all the tests and gives the path of the library.
fn fixture_library() -> &'static str {
    static LIBRARY: OnceLock<PathBuf> = OnceLock::new();
    LIBRARY
        .get_or_init(|| {
            let output = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(format!("{}handle_fixture.{}", std::env::consts::DLL_PREFIX, std::env::consts::DLL_EXTENSION));
            let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/handle_functions.rs");
            let status = Command::new("rustc")
                .args(["--edition", "2024", "--crate-type", "cdylib", "--crate-name", "handle_fixture"])
                .arg(&source)
                .arg("-o")
                .arg(&output)
                .status()
                .expect("rustc runs");
            assert!(status.success(), "the fixture library compiles");
            output
        })
        .to_str()
        .expect("the path is text")
}

fn call(function: &str, return_kind: ReturnKind, arguments: Vec<Argument>) -> CallResult {
    LibraryCaller::new().call(Call { library: fixture_library().to_string(), function: function.to_string(), return_kind, arguments }).expect("the call is made")
}

/// A string's block, as LabVIEW's `LStr` is: its length, then its bytes.
fn string_block(text: &str) -> Vec<u8> {
    [&(text.len() as i32).to_le_bytes()[..], text.as_bytes()].concat()
}

/// An array's block: its dimension sizes, then its doubles.
fn double_block(dimensions: &[i32], elements: &[f64]) -> Vec<u8> {
    [dimensions.iter().flat_map(|size| size.to_le_bytes()).collect::<Vec<u8>>(), elements.iter().flat_map(|element| element.to_le_bytes()).collect()].concat()
}

fn doubles_in(block: &[u8], dimension_count: usize) -> Vec<f64> {
    block[4 * dimension_count..].chunks(8).map(|bytes| f64::from_le_bytes(bytes.try_into().unwrap())).collect()
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
