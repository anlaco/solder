//! LabVIEW's memory functions (DT-088 §4), answered from Solder's table of handles (`handles`), for the libraries the
//! Call Library Function Node loads. A library calls them by LabVIEW's names, which `solder-memory-bridge` exports:
//! [`install_memory_bridge`] loads that library where the system searches for those names and gives it these functions.
//!
//! The signatures, the error codes (`MgErr`) and the numeric type codes are those of LabVIEW 2026's `extcode.h`, read in
//! `labview-captures/reports/2026-11-08-labview-memory-manager-imports.md`. Which error each function gives in LabVIEW
//! for a handle it does not know was not measured: Solder answers `mZoneErr`.

use std::path::Path;
use std::sync::OnceLock;

use libloading::Library;

use crate::handles::{self, Handle};
use crate::task_records;

type MgErr = i32;
type UHandle = *mut *mut u8;

const NO_ERROR: MgErr = 0;
/// LabVIEW's `mgArgErr`: an argument it cannot use, such as an unknown type code.
const ARGUMENT_ERROR: MgErr = 1;
/// LabVIEW's `mFullErr`: more memory than there is.
const MEMORY_FULL_ERROR: MgErr = 2;
/// LabVIEW's `mZoneErr`: a handle its memory manager does not know.
const UNKNOWN_HANDLE_ERROR: MgErr = 3;

/// The version of the bridge's table this host speaks.
const BRIDGE_VERSION: u32 = 2;
/// The bridge's function that receives the host's functions.
const BRIDGE_INSTALL_FUNCTION: &[u8] = b"solder_memory_bridge_install";

/// The host's functions as the bridge declares them, field for field.
#[repr(C)]
struct HostFunctions {
    new_handle: unsafe extern "C" fn(size: usize) -> UHandle,
    set_handle_size: unsafe extern "C" fn(handle: UHandle, size: usize) -> MgErr,
    get_handle_size: unsafe extern "C" fn(handle: UHandle) -> usize,
    dispose_handle: unsafe extern "C" fn(handle: UHandle) -> MgErr,
    numeric_array_resize: unsafe extern "C" fn(type_code: i32, dimension_count: i32, handle_address: *mut UHandle, element_count: usize) -> MgErr,
    // Since version 2: the DAQ driver's task records (DT-087, amendment of 2026-11-13).
    new_task_record: unsafe extern "C" fn(name: *const u8, length: usize, task_object: usize) -> usize,
    dispose_task_record: unsafe extern "C" fn(address: usize) -> MgErr,
    task_object_of_record: unsafe extern "C" fn(address: usize) -> usize,
}

static HOST_FUNCTIONS: HostFunctions = HostFunctions {
    new_handle,
    set_handle_size,
    get_handle_size,
    dispose_handle,
    numeric_array_resize,
    new_task_record: task_records::bridge_new_record,
    dispose_task_record: task_records::bridge_dispose_record,
    task_object_of_record: task_records::bridge_task_object_of,
};

/// The bridge, kept loaded for the life of the process once installed.
static BRIDGE: OnceLock<Library> = OnceLock::new();

/// Loads the bridge library so that the libraries loaded after it find LabVIEW's memory functions, and gives it this
/// host's. Installing it again does nothing.
pub fn install_memory_bridge(path: &Path) -> Result<(), String> {
    if BRIDGE.get().is_some() {
        return Ok(());
    }
    let library = load_where_libraries_find_it(path)?;
    // SAFETY: the symbol is the bridge's install function, whose signature both sides declare.
    let version = unsafe {
        let install: libloading::Symbol<'_, unsafe extern "C" fn(*const HostFunctions) -> u32> =
            library.get(BRIDGE_INSTALL_FUNCTION).map_err(|error| format!("{} is not Solder's memory bridge: {error}", path.display()))?;
        install(&raw const HOST_FUNCTIONS)
    };
    if version != BRIDGE_VERSION {
        return Err(format!("{} is version {version} of the memory bridge; this host needs {BRIDGE_VERSION}", path.display()));
    }
    let _ = BRIDGE.set(library);
    Ok(())
}

/// On Linux and macOS, a name a library leaves unresolved is looked for in the process' global scope, which a library
/// joins when it is loaded with `RTLD_GLOBAL`.
#[cfg(unix)]
fn load_where_libraries_find_it(path: &Path) -> Result<Library, String> {
    use libloading::os::unix::{Library as UnixLibrary, RTLD_GLOBAL, RTLD_NOW};
    // SAFETY: the bridge's initialisers are Rust's own, with nothing of the user's.
    unsafe { UnixLibrary::open(Some(path), RTLD_NOW | RTLD_GLOBAL) }.map(Library::from).map_err(|error| format!("the memory bridge does not load: {error}"))
}

/// On Windows a library built with LabVIEW's `labview.lib` imports none of these names: a stub linked into it looks them
/// up when first called, with `GetModuleHandleA` and `GetProcAddress`, in a module named `lvrt.dll` (measured,
/// `labview-captures/reports/2026-11-08-labview-memory-manager-imports.md`). So the bridge's file is `lvrt.dll` there
/// (DT-088 §4), and loading it by its full path makes it the module of that name the stub finds already loaded.
#[cfg(windows)]
fn load_where_libraries_find_it(path: &Path) -> Result<Library, String> {
    // SAFETY: as above.
    unsafe { Library::new(path) }.map_err(|error| format!("the memory bridge does not load: {error}"))
}

/// An element of an array, as `NumericArrayResize` sizes it.
struct Element {
    size: usize,
    /// A number aligns to its size; a complex number to its parts'.
    alignment: usize,
}

/// The element of LabVIEW's numeric type code (`extcode.h`), or `None` for a code that is not one Solder sizes.
/// The extended types (`fX`, `cX`) are left out: their size differs between platforms and was not measured.
fn element_of(type_code: i32) -> Option<Element> {
    let number = |size| Some(Element { size, alignment: size });
    match type_code {
        0x01 | 0x05 => number(1),        // iB, uB
        0x02 | 0x06 => number(2),        // iW, uW
        0x03 | 0x07 | 0x09 => number(4), // iL, uL, fS
        0x04 | 0x08 | 0x0A => number(8), // iQ, uQ, fD
        0x0C => Some(Element { size: 8, alignment: 4 }),   // cS
        0x0D => Some(Element { size: 16, alignment: 8 }),  // cD
        _ => None,
    }
}

/// The bytes of one dimension size: LabVIEW's `int32`.
const DIMENSION_SIZE_BYTES: usize = 4;

/// The bytes of an array's block: its dimension sizes, then its elements where their alignment puts them. On a 64-bit
/// system `extcode.h` keeps the compiler's alignment (it packs to one byte only on 32-bit Windows), as the host lays out
/// the blocks it builds (`core/runtime/call-library.mjs`).
fn array_block_size(dimension_count: usize, element_count: usize, element: &Element) -> Option<usize> {
    let elements_offset = (DIMENSION_SIZE_BYTES.checked_mul(dimension_count)?).next_multiple_of(element.alignment);
    element_count.checked_mul(element.size)?.checked_add(elements_offset)
}

/// A handle of a library's, or `None` when this host did not make it.
fn known(handle: UHandle) -> Option<Handle> {
    Handle::from_pointer(handle)
}

unsafe extern "C" fn new_handle(size: usize) -> UHandle {
    handles::new_zeroed(size).as_pointer()
}

unsafe extern "C" fn set_handle_size(handle: UHandle, size: usize) -> MgErr {
    match known(handle) {
        Some(handle) if handles::resize(handle, size) => NO_ERROR,
        _ => UNKNOWN_HANDLE_ERROR,
    }
}

/// The size of the handle's block; 0 for a handle this host did not make, where LabVIEW's answer was not measured.
unsafe extern "C" fn get_handle_size(handle: UHandle) -> usize {
    known(handle).and_then(handles::size_of).unwrap_or(0)
}

unsafe extern "C" fn dispose_handle(handle: UHandle) -> MgErr {
    match known(handle) {
        Some(handle) if handles::dispose(handle) => NO_ERROR,
        _ => UNKNOWN_HANDLE_ERROR,
    }
}

/// Gives the array's handle room for its dimension sizes and `element_count` elements of the type, or makes one when
/// the handle is null, as LabVIEW's does. The dimension sizes are the library's to write.
unsafe extern "C" fn numeric_array_resize(type_code: i32, dimension_count: i32, handle_address: *mut UHandle, element_count: usize) -> MgErr {
    let Some(element) = element_of(type_code) else { return ARGUMENT_ERROR };
    let Ok(dimension_count) = usize::try_from(dimension_count) else { return ARGUMENT_ERROR };
    if handle_address.is_null() {
        return ARGUMENT_ERROR;
    }
    let Some(size) = array_block_size(dimension_count, element_count, &element) else { return MEMORY_FULL_ERROR };
    // SAFETY: the library passes the address of its handle, which it owns for the call.
    let handle = unsafe { *handle_address };
    if handle.is_null() {
        // SAFETY: as above; the new handle is written where the library keeps its own.
        unsafe { *handle_address = handles::new_zeroed(size).as_pointer() };
        return NO_ERROR;
    }
    unsafe { set_handle_size(handle, size) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_array_block_is_its_dimension_sizes_then_its_elements_where_their_size_aligns_them() {
        let element = |type_code| element_of(type_code).expect("a numeric type code");
        const DOUBLE: i32 = 0x0A;
        assert_eq!(array_block_size(1, 3, &element(DOUBLE)), Some(8 + 24), "four bytes of padding before the doubles");
        assert_eq!(array_block_size(1, 3, &element(0x03)), Some(4 + 12));
        assert_eq!(array_block_size(3, 1, &element(DOUBLE)), Some(16 + 8));
        assert_eq!(array_block_size(3, 1, &element(0x02)), Some(12 + 2));
        assert_eq!(array_block_size(1, 2, &element(0x0D)), Some(8 + 32), "a complex double aligns as a double");
        assert_eq!(array_block_size(1, 2, &element(0x0C)), Some(4 + 16), "a complex single aligns as a single");
        assert_eq!(array_block_size(1, usize::MAX, &element(DOUBLE)), None, "a size that does not fit is memory full");
    }

    #[test]
    fn numeric_array_resize_makes_a_handle_where_there_is_none_and_refuses_an_unknown_type() {
        let mut handle: UHandle = std::ptr::null_mut();
        assert_eq!(unsafe { numeric_array_resize(0x0A, 1, &raw mut handle, 3) }, NO_ERROR);
        assert_eq!(unsafe { get_handle_size(handle) }, 32);
        assert_eq!(unsafe { numeric_array_resize(0x50, 1, &raw mut handle, 3) }, ARGUMENT_ERROR);
        assert_eq!(unsafe { dispose_handle(handle) }, NO_ERROR);
        assert_eq!(unsafe { dispose_handle(handle) }, UNKNOWN_HANDLE_ERROR);
    }
}
