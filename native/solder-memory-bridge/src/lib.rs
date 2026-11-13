//! LabVIEW's memory functions under LabVIEW's names (DT-088 §4), for a library built for LabVIEW that resizes the
//! handles it is given, and the task records the DAQ driver asks for, under Solder's names (DT-087). A library like
//! that calls `DSSetHandleSize` or `NumericArrayResize` by name and expects the process that loaded it to have them;
//! this library is what has them in Solder's I/O process.
//!
//! It holds no handles and knows nothing of them: the host (`solder-io`'s `memory_manager`) gives it its own functions
//! when it loads it, and every export but `MoveBlock` calls one of them, so the one table of handles is the host's.
//! It is a library apart because a name a library looks for must be offered by a module the system searches: on Linux
//! one loaded into the process' global scope, on Windows one whose file name is the name the library imports.

#![allow(non_snake_case, clippy::missing_safety_doc)]

use std::sync::atomic::{AtomicPtr, Ordering};

type MgErr = i32;
type UHandle = *mut *mut u8;

/// The version of [`HostFunctions`]; the host refuses a bridge that answers another.
const BRIDGE_VERSION: u32 = 2;

/// LabVIEW's `mFullErr`, answered while no host has installed its functions: nothing can be allocated.
const MEMORY_FULL_ERROR: MgErr = 2;

/// The host's functions, in the order and with the types `solder-io` declares them.
#[repr(C)]
pub struct HostFunctions {
    pub new_handle: unsafe extern "C" fn(size: usize) -> UHandle,
    pub set_handle_size: unsafe extern "C" fn(handle: UHandle, size: usize) -> MgErr,
    pub get_handle_size: unsafe extern "C" fn(handle: UHandle) -> usize,
    pub dispose_handle: unsafe extern "C" fn(handle: UHandle) -> MgErr,
    pub numeric_array_resize: unsafe extern "C" fn(type_code: i32, dimension_count: i32, handle_address: *mut UHandle, element_count: usize) -> MgErr,
    // Since version 2: the DAQ driver's task records (DT-087, amendment of 2026-11-13).
    pub new_task_record: unsafe extern "C" fn(name: *const u8, length: usize, task_object: usize) -> usize,
    pub dispose_task_record: unsafe extern "C" fn(address: usize) -> MgErr,
    pub task_object_of_record: unsafe extern "C" fn(address: usize) -> usize,
}

static HOST: AtomicPtr<HostFunctions> = AtomicPtr::new(std::ptr::null_mut());

fn host() -> Option<&'static HostFunctions> {
    // SAFETY: the host installs a table that lives as long as the process.
    unsafe { HOST.load(Ordering::Acquire).as_ref() }
}

/// Called by the host once, after loading this library: gives it the host's functions and answers its version.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn solder_memory_bridge_install(functions: *const HostFunctions) -> u32 {
    HOST.store(functions.cast_mut(), Ordering::Release);
    BRIDGE_VERSION
}

/// `UHandle DSNewHandle(size_t)`: a new handle of `size` bytes, or null.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DSNewHandle(size: usize) -> UHandle {
    host().map_or(std::ptr::null_mut(), |host| unsafe { (host.new_handle)(size) })
}

/// `UHandle DSNewHClr(size_t)`: a new handle of `size` bytes of zeros, or null. Solder's handles are always cleared.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DSNewHClr(size: usize) -> UHandle {
    unsafe { DSNewHandle(size) }
}

/// `MgErr DSSetHandleSize(void *, size_t)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DSSetHandleSize(handle: UHandle, size: usize) -> MgErr {
    host().map_or(MEMORY_FULL_ERROR, |host| unsafe { (host.set_handle_size)(handle, size) })
}

/// `size_t DSGetHandleSize(const void *)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DSGetHandleSize(handle: UHandle) -> usize {
    host().map_or(0, |host| unsafe { (host.get_handle_size)(handle) })
}

/// `MgErr DSDisposeHandle(void *)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn DSDisposeHandle(handle: UHandle) -> MgErr {
    host().map_or(MEMORY_FULL_ERROR, |host| unsafe { (host.dispose_handle)(handle) })
}

/// `MgErr NumericArrayResize(int32 typeCode, int32 numDims, UHandle *dataHP, size_t totalNewSize)`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn NumericArrayResize(type_code: i32, dimension_count: i32, handle_address: *mut UHandle, element_count: usize) -> MgErr {
    host().map_or(MEMORY_FULL_ERROR, |host| unsafe { (host.numeric_array_resize)(type_code, dimension_count, handle_address, element_count) })
}

/// `void MoveBlock(const void *source, void *destination, size_t size)`: copies bytes, the two blocks may overlap. It
/// needs nothing of the host.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn MoveBlock(source: *const u8, destination: *mut u8, size: usize) {
    unsafe { std::ptr::copy(source, destination, size) }
}

/// `uintptr_t SolderNewTaskRecord(const char *name, size_t length, uintptr_t taskObject)`: Solder's, not LabVIEW's. A
/// record the host keeps for a DAQ task, as LabVIEW keeps one (DT-087, amendment of 2026-11-13), and its address; 0
/// while no host has installed its functions.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn SolderNewTaskRecord(name: *const u8, length: usize, task_object: usize) -> usize {
    host().map_or(0, |host| unsafe { (host.new_task_record)(name, length, task_object) })
}

/// `MgErr SolderDisposeTaskRecord(uintptr_t record)`: Solder's. Disposes of a task's record.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn SolderDisposeTaskRecord(address: usize) -> MgErr {
    host().map_or(MEMORY_FULL_ERROR, |host| unsafe { (host.dispose_task_record)(address) })
}

/// `uintptr_t SolderTaskObjectOfRecord(uintptr_t record)`: Solder's. The driver's task object a record links to, 0 for
/// an address that is not a record.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn SolderTaskObjectOfRecord(address: usize) -> usize {
    host().map_or(0, |host| unsafe { (host.task_object_of_record)(address) })
}
