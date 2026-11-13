//! What the library asks of the process that loaded it, as a library built for LabVIEW does: LabVIEW's memory
//! functions, to fill the strings and arrays it is handed (DT-088), and Solder's task records (DT-087, amendment of
//! 2026-11-13). In Solder they come from the memory bridge the I/O process installs: on Linux it is loaded into the
//! process' global scope, so the names below are left for the system to resolve when the library loads; on Windows it
//! is a module named `lvrt.dll`, which is where a LabVIEW library looks for them (DT-088 §4).
//!
//! The layouts are those of LabVIEW's `extcode.h` on 64 bits: a string block is `{ int32 length; bytes }`, an array of
//! doubles `{ int32 dimension sizes[N]; doubles }` with the doubles aligned to 8.

type MgErr = i32;
/// LabVIEW's `LStrHandle`, `Array1DDouble **` and `Array2DDouble **`: the address of the cell holding the block's address.
pub type Handle = *mut *mut u8;

/// LabVIEW's numeric type code of a double (`fD`), for `NumericArrayResize`.
const DOUBLE_TYPE_CODE: i32 = 0x0A;
/// The bytes of a string block's length, and of one dimension size of an array.
const LENGTH_BYTES: usize = 4;
/// Where an array's doubles start: after its dimension sizes, aligned to 8.
const DOUBLES_ALIGNMENT: usize = 8;

#[cfg_attr(windows, link(name = "lvrt", kind = "raw-dylib"))]
unsafe extern "C" {
    fn DSSetHandleSize(handle: Handle, size: usize) -> MgErr;
    fn NumericArrayResize(type_code: i32, dimension_count: i32, handle_address: *mut Handle, element_count: usize) -> MgErr;
    fn SolderNewTaskRecord(name: *const u8, length: usize, task_object: usize) -> usize;
    fn SolderDisposeTaskRecord(record: usize) -> MgErr;
    fn SolderTaskObjectOfRecord(record: usize) -> usize;
}

/// The text of a string handle; an empty string for a null handle or a null block.
///
/// # Safety
/// `handle` is null or a LabVIEW string handle.
pub unsafe fn read_string(handle: Handle) -> String {
    // SAFETY: the caller guarantees a string handle; its block starts with its length.
    unsafe {
        if handle.is_null() || (*handle).is_null() {
            return String::new();
        }
        let block = *handle;
        let length = block.cast::<i32>().read_unaligned().max(0) as usize;
        String::from_utf8_lossy(std::slice::from_raw_parts(block.add(LENGTH_BYTES), length)).into_owned()
    }
}

/// Puts `text` into a string handle, resizing its block; nothing for a null handle, which has no room to give.
///
/// # Safety
/// `handle` is null or a LabVIEW string handle made by the host.
pub unsafe fn write_string(handle: Handle, text: &str) -> Result<(), MgErr> {
    if handle.is_null() {
        return Ok(());
    }
    // SAFETY: the host resized the block to hold the length and the bytes.
    unsafe {
        check(DSSetHandleSize(handle, LENGTH_BYTES + text.len()))?;
        let block = *handle;
        block.cast::<i32>().write_unaligned(text.len() as i32);
        std::ptr::copy_nonoverlapping(text.as_ptr(), block.add(LENGTH_BYTES), text.len());
    }
    Ok(())
}

/// Fills an array handle of doubles with `dimension_sizes` and `values`, row after row.
///
/// # Safety
/// `handle` is an array handle of doubles made by the host, with as many dimensions as `dimension_sizes` has.
pub unsafe fn write_doubles(mut handle: Handle, dimension_sizes: &[usize], values: &[f64]) -> Result<(), MgErr> {
    // SAFETY: after the host resized it, the block holds the dimension sizes and then `values.len()` doubles.
    unsafe {
        check(NumericArrayResize(DOUBLE_TYPE_CODE, dimension_sizes.len() as i32, &raw mut handle, values.len()))?;
        let block = *handle;
        for (index, size) in dimension_sizes.iter().enumerate() {
            block.add(index * LENGTH_BYTES).cast::<i32>().write_unaligned(*size as i32);
        }
        let doubles = block.add((dimension_sizes.len() * LENGTH_BYTES).next_multiple_of(DOUBLES_ALIGNMENT));
        std::ptr::copy_nonoverlapping(values.as_ptr(), doubles.cast::<f64>(), values.len());
    }
    Ok(())
}

fn check(error: MgErr) -> Result<(), MgErr> {
    if error == 0 { Ok(()) } else { Err(error) }
}

/// A task record from the host, linking `name` to the task object at `task_object`; `None` when no host offers them.
pub fn new_task_record(name: &str, task_object: usize) -> Option<usize> {
    // SAFETY: the host reads `name.len()` bytes at the address given.
    let record = unsafe { SolderNewTaskRecord(name.as_ptr(), name.len(), task_object) };
    (record != 0).then_some(record)
}

pub fn dispose_task_record(record: usize) {
    // SAFETY: the host checks the address itself; one that is not a record is refused.
    unsafe { SolderDisposeTaskRecord(record) };
}

/// The task object a record links to, `None` for an address that is not a record.
pub fn task_object_of_record(record: usize) -> Option<usize> {
    // SAFETY: as above.
    let task_object = unsafe { SolderTaskObjectOfRecord(record) };
    (task_object != 0).then_some(task_object)
}
