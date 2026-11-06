//! Calling a function of a native library for the Call Library Function Node (DT-080). The library is loaded
//! once and kept, the function is found by name and called through libffi with the arguments as C sees them:
//! numbers by value, and buffers (a number by pointer, an array's data, a C string) by their address, which the
//! function may write into. The node's errors are LabVIEW's, measured with a path wired on the diagram
//! (`labview-captures/reports/2026-11-06-clfn-run.md`): 7 when the library is not found, 12 when the file is
//! not a library, 15 when the library has no such function.
//!
//! On 64-bit systems there is one calling convention, so the node's stdcall and C both call the same way.

use std::collections::HashMap;
use std::ffi::{CStr, c_char, c_void};
use std::path::Path;
use std::sync::{Arc, Mutex};

use libffi::middle::{Arg, Cif, CodePtr, Ret, Type};
use libloading::Library;

/// The extension `.*` stands for, as LabVIEW's `lvanlys.*` names each platform's file.
#[cfg(windows)]
const PLATFORM_EXTENSION: &str = "dll";
#[cfg(target_os = "macos")]
const PLATFORM_EXTENSION: &str = "dylib";
#[cfg(all(unix, not(target_os = "macos")))]
const PLATFORM_EXTENSION: &str = "so";

/// A C number: the node's data types, the pointer-sized ones being 64 bits wide.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NumberKind {
    I8,
    I16,
    I32,
    I64,
    U8,
    U16,
    U32,
    U64,
    F32,
    F64,
}

impl NumberKind {
    /// Its size in bytes.
    pub fn size(self) -> usize {
        match self {
            NumberKind::I8 | NumberKind::U8 => 1,
            NumberKind::I16 | NumberKind::U16 => 2,
            NumberKind::I32 | NumberKind::U32 | NumberKind::F32 => 4,
            NumberKind::I64 | NumberKind::U64 | NumberKind::F64 => 8,
        }
    }

    fn ffi_type(self) -> Type {
        match self {
            NumberKind::I8 => Type::i8(),
            NumberKind::I16 => Type::i16(),
            NumberKind::I32 => Type::i32(),
            NumberKind::I64 => Type::i64(),
            NumberKind::U8 => Type::u8(),
            NumberKind::U16 => Type::u16(),
            NumberKind::U32 => Type::u32(),
            NumberKind::U64 => Type::u64(),
            NumberKind::F32 => Type::f32(),
            NumberKind::F64 => Type::f64(),
        }
    }
}

/// One argument of a call.
#[derive(Clone, Debug, PartialEq)]
pub enum Argument {
    /// A number passed by value: its little-endian bytes, as many as its kind's size.
    Value { kind: NumberKind, bytes: Vec<u8> },
    /// A buffer passed by its address: a number by pointer, an array's data, a C string with its ending zero.
    Buffer(Vec<u8>),
}

/// What the function returns.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReturnKind {
    Void,
    Number(NumberKind),
    /// A C string, copied up to its ending zero; a null pointer gives an empty string.
    CString,
}

/// A call to make.
#[derive(Clone, Debug, PartialEq)]
pub struct Call {
    /// A library name the system searches for, or a path; `.*` stands for the platform's extension.
    pub library: String,
    pub function: String,
    pub return_kind: ReturnKind,
    pub arguments: Vec<Argument>,
}

/// What a call gives back.
#[derive(Clone, Debug, PartialEq)]
pub struct CallResult {
    /// The return value's bytes: a number's, little-endian, or a C string's without its ending zero.
    pub returned: Vec<u8>,
    /// Each argument's bytes after the call, so what the function wrote into a buffer comes back.
    pub arguments: Vec<Vec<u8>>,
}

/// Why a call could not be made, with LabVIEW's codes (measured).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LibraryError {
    /// The library is not found, or the path is a folder: 7.
    NotFound,
    /// The file is there but is not a library: 12.
    NotALibrary,
    /// The library has no function of that name: 15.
    NoSuchFunction,
}

impl LibraryError {
    /// The code LabVIEW gives in the node's error out.
    pub fn code(self) -> i32 {
        match self {
            LibraryError::NotFound => 7,
            LibraryError::NotALibrary => 12,
            LibraryError::NoSuchFunction => 15,
        }
    }
}

/// The libraries loaded so far, kept for the next calls as LabVIEW keeps them. Shared between threads: only
/// loading takes the lock, so calls on several threads run at the same time (Run in any thread).
#[derive(Default)]
pub struct LibraryCaller {
    libraries: Mutex<HashMap<String, Arc<Library>>>,
}

/// An argument's storage while the call lasts: a number by value, or the address of its buffer.
enum Slot {
    I8(i8),
    I16(i16),
    I32(i32),
    I64(i64),
    U8(u8),
    U16(u16),
    U32(u32),
    U64(u64),
    F32(f32),
    F64(f64),
    Pointer(*mut c_void),
}

impl Slot {
    fn arg(&self) -> Arg<'_> {
        match self {
            Slot::I8(value) => Arg::new(value),
            Slot::I16(value) => Arg::new(value),
            Slot::I32(value) => Arg::new(value),
            Slot::I64(value) => Arg::new(value),
            Slot::U8(value) => Arg::new(value),
            Slot::U16(value) => Arg::new(value),
            Slot::U32(value) => Arg::new(value),
            Slot::U64(value) => Arg::new(value),
            Slot::F32(value) => Arg::new(value),
            Slot::F64(value) => Arg::new(value),
            Slot::Pointer(value) => Arg::new(value),
        }
    }
}

/// Eight little-endian bytes from the first `bytes`, the rest zero.
fn widened(bytes: &[u8]) -> [u8; 8] {
    let mut word = [0u8; 8];
    let length = bytes.len().min(8);
    word[..length].copy_from_slice(&bytes[..length]);
    word
}

fn value_slot(kind: NumberKind, bytes: &[u8]) -> Slot {
    let word = widened(bytes);
    let bits = u64::from_le_bytes(word);
    match kind {
        NumberKind::I8 => Slot::I8(bits as u8 as i8),
        NumberKind::I16 => Slot::I16(bits as u16 as i16),
        NumberKind::I32 => Slot::I32(bits as u32 as i32),
        NumberKind::I64 => Slot::I64(bits as i64),
        NumberKind::U8 => Slot::U8(bits as u8),
        NumberKind::U16 => Slot::U16(bits as u16),
        NumberKind::U32 => Slot::U32(bits as u32),
        NumberKind::U64 => Slot::U64(bits),
        NumberKind::F32 => Slot::F32(f32::from_bits(bits as u32)),
        NumberKind::F64 => Slot::F64(f64::from_bits(bits)),
    }
}

/// The name the system loads: `.*` replaced by the platform's extension.
pub fn platform_library_name(name: &str) -> String {
    match name.strip_suffix(".*") {
        Some(stem) => format!("{stem}.{PLATFORM_EXTENSION}"),
        None => name.to_string(),
    }
}

/// Whether the name is a path rather than a name the system searches for.
fn is_path(name: &str) -> bool {
    name.contains('/') || name.contains('\\')
}

impl LibraryCaller {
    pub fn new() -> Self {
        Self::default()
    }

    fn library(&self, name: &str) -> Result<Arc<Library>, LibraryError> {
        let name = platform_library_name(name);
        let mut libraries = self.libraries.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if !libraries.contains_key(&name) {
            if is_path(&name) {
                let path = Path::new(&name);
                if !path.is_file() {
                    return Err(LibraryError::NotFound);
                }
            }
            // SAFETY: loading a library runs its initialisers; the user chose the library, as in LabVIEW.
            let library = unsafe { Library::new(&name) }.map_err(|_| if is_path(&name) { LibraryError::NotALibrary } else { LibraryError::NotFound })?;
            libraries.insert(name.clone(), Arc::new(library));
        }
        Ok(Arc::clone(&libraries[&name]))
    }

    /// Makes the call. The buffers are the caller's to size: a function that writes past one writes past it,
    /// as it does in LabVIEW.
    pub fn call(&self, call: Call) -> Result<CallResult, LibraryError> {
        let library = self.library(&call.library)?;
        // SAFETY: the symbol is used as a function of the signature the node describes, the user's promise.
        let function: libloading::Symbol<'_, *mut c_void> =
            unsafe { library.get(call.function.as_bytes()) }.map_err(|_| LibraryError::NoSuchFunction)?;
        let code = CodePtr(*function);

        let mut buffers: Vec<Vec<u8>> = call.arguments.iter().map(|argument| match argument {
            Argument::Value { bytes, .. } => bytes.clone(),
            Argument::Buffer(bytes) => bytes.clone(),
        }).collect();
        let slots: Vec<Slot> = call
            .arguments
            .iter()
            .zip(buffers.iter_mut())
            .map(|(argument, buffer)| match argument {
                Argument::Value { kind, bytes } => value_slot(*kind, bytes),
                Argument::Buffer(_) => Slot::Pointer(buffer.as_mut_ptr().cast()),
            })
            .collect();
        let argument_types: Vec<Type> = call
            .arguments
            .iter()
            .map(|argument| match argument {
                Argument::Value { kind, .. } => kind.ffi_type(),
                Argument::Buffer(_) => Type::pointer(),
            })
            .collect();
        let return_type = match call.return_kind {
            ReturnKind::Void => Type::void(),
            ReturnKind::Number(kind) => kind.ffi_type(),
            ReturnKind::CString => Type::pointer(),
        };
        let cif = Cif::new(argument_types, return_type);
        let arguments: Vec<Arg<'_>> = slots.iter().map(Slot::arg).collect();
        // libffi widens a small integer return to a full register, so eight bytes hold any return value.
        let mut returned_word = 0u64;
        // SAFETY: the signature is the node's; a wrong one is the user's mistake, as in LabVIEW.
        unsafe { cif.call_return_into(code, &arguments, Ret::new(&mut returned_word)) };

        let returned = match call.return_kind {
            ReturnKind::Void => Vec::new(),
            ReturnKind::Number(kind) => returned_word.to_le_bytes()[..kind.size()].to_vec(),
            ReturnKind::CString => {
                let pointer = returned_word as usize as *const c_char;
                if pointer.is_null() {
                    Vec::new()
                } else {
                    // SAFETY: the function returns a C string, the node's promise.
                    unsafe { CStr::from_ptr(pointer) }.to_bytes().to_vec()
                }
            }
        };
        drop(slots);
        Ok(CallResult { returned, arguments: buffers })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(all(unix, not(target_os = "macos")))]
    const C_LIBRARY: &str = "libc.so.6";
    #[cfg(all(unix, not(target_os = "macos")))]
    const MATH_LIBRARY: &str = "libm.so.6";

    fn number(kind: NumberKind, bytes: &[u8]) -> Argument {
        Argument::Value { kind, bytes: bytes.to_vec() }
    }

    fn call(library: &str, function: &str, return_kind: ReturnKind, arguments: Vec<Argument>) -> Result<CallResult, LibraryError> {
        LibraryCaller::new().call(Call { library: library.into(), function: function.into(), return_kind, arguments })
    }

    #[test]
    fn errors_are_labviews_codes() {
        assert_eq!(LibraryError::NotFound.code(), 7);
        assert_eq!(LibraryError::NotALibrary.code(), 12);
        assert_eq!(LibraryError::NoSuchFunction.code(), 15);
    }

    #[test]
    fn the_wildcard_names_the_platforms_file() {
        assert_eq!(platform_library_name("lvanlys.*"), format!("lvanlys.{PLATFORM_EXTENSION}"));
        assert_eq!(platform_library_name("kernel32.dll"), "kernel32.dll");
    }

    #[test]
    fn a_missing_library_or_a_folder_is_not_found_and_a_file_that_is_not_one_is_not_a_library() {
        let here = env!("CARGO_MANIFEST_DIR");
        let missing = format!("{here}/no-such-library.{PLATFORM_EXTENSION}");
        assert_eq!(call(&missing, "f", ReturnKind::Void, vec![]), Err(LibraryError::NotFound));
        assert_eq!(call(here, "f", ReturnKind::Void, vec![]), Err(LibraryError::NotFound));
        assert_eq!(call(&format!("{here}/Cargo.toml"), "f", ReturnKind::Void, vec![]), Err(LibraryError::NotALibrary));
        assert_eq!(call("no-such-library-anywhere", "f", ReturnKind::Void, vec![]), Err(LibraryError::NotFound));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn a_library_without_the_function_has_no_such_function() {
        assert_eq!(call(C_LIBRARY, "no_such_function_here", ReturnKind::Void, vec![]), Err(LibraryError::NoSuchFunction));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn numbers_go_by_value_and_come_back() {
        let result = call(C_LIBRARY, "abs", ReturnKind::Number(NumberKind::I32), vec![number(NumberKind::I32, &(-7i32).to_le_bytes())]).unwrap();
        assert_eq!(result.returned, 7i32.to_le_bytes());
        let result = call(MATH_LIBRARY, "cos", ReturnKind::Number(NumberKind::F64), vec![number(NumberKind::F64, &0f64.to_le_bytes())]).unwrap();
        assert_eq!(f64::from_le_bytes(result.returned.try_into().unwrap()), 1.0);
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn a_c_string_goes_by_its_address() {
        let result = call(C_LIBRARY, "strlen", ReturnKind::Number(NumberKind::U64), vec![Argument::Buffer(b"hello\0".to_vec())]).unwrap();
        assert_eq!(u64::from_le_bytes(result.returned.try_into().unwrap()), 5);
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn what_the_function_writes_into_a_buffer_comes_back() {
        let arguments = vec![Argument::Buffer(vec![0; 4]), number(NumberKind::I32, &0x41i32.to_le_bytes()), number(NumberKind::U64, &4u64.to_le_bytes())];
        let result = call(C_LIBRARY, "memset", ReturnKind::Void, arguments).unwrap();
        assert_eq!(result.arguments[0], b"AAAA");
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn a_returned_c_string_is_copied() {
        let result = call(C_LIBRARY, "strchr", ReturnKind::CString, vec![Argument::Buffer(b"solder\0".to_vec()), number(NumberKind::I32, &(b'd' as i32).to_le_bytes())]);
        // strchr points into the argument's buffer, which lives until the call ends: the copy is "der".
        assert_eq!(result.unwrap().returned, b"der");
        let result = call(C_LIBRARY, "getenv", ReturnKind::CString, vec![Argument::Buffer(b"SOLDER_NO_SUCH_VARIABLE\0".to_vec())]).unwrap();
        assert_eq!(result.returned, b"", "a null pointer is an empty string");
    }

    #[cfg(windows)]
    #[test]
    fn windows_calls_kernel32() {
        let result = call("kernel32.dll", "GetTickCount", ReturnKind::Number(NumberKind::U32), vec![]).unwrap();
        assert!(u32::from_le_bytes(result.returned.try_into().unwrap()) > 0);
    }
}
