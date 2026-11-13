//! Task records (DT-087, amendment of 2026-11-13): what LabVIEW keeps for each DAQ task, kept here because the I/O
//! process plays LabVIEW's part. Measured in LabVIEW (`labview-captures/reports/2026-11-13-daq-create-task.md`): a DAQ
//! task wire holds the address of a record with the task's name, the number its value shows beside the name, and a link
//! to the driver's own task object, whose address is what a node passes for the wire as a `uintptr_t`.
//!
//! The driver asks for a record when it creates a task, writes its address where LabVIEW gave it room, and gives it back
//! when the task is destroyed. Solder's record is its own layout, not LabVIEW's, whose other fields were not understood.
//! An address is a record only if this module made it and has not disposed of it: one a library invents is refused.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// A task's record. Boxed, so its address stays put while the table grows.
#[derive(Debug)]
struct TaskRecord {
    name: String,
    /// The address of the driver's task object: the `taskID` a node passes.
    task_object: usize,
    /// The number a DAQ task value shows beside its name (measured: a new one for each task).
    number: u32,
}

/// What the table holds, under one lock.
struct Records {
    by_address: HashMap<usize, Box<TaskRecord>>,
    next_number: u32,
}

static RECORDS: LazyLock<Mutex<Records>> = LazyLock::new(|| Mutex::new(Records { by_address: HashMap::new(), next_number: 1 }));

fn records() -> std::sync::MutexGuard<'static, Records> {
    RECORDS.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// A new record for a task, and its address.
pub fn new_record(name: &str, task_object: usize) -> usize {
    let mut records = records();
    let number = records.next_number;
    records.next_number = records.next_number.wrapping_add(1).max(1);
    let record = Box::new(TaskRecord { name: name.to_string(), task_object, number });
    let address = &raw const *record as usize;
    records.by_address.insert(address, record);
    address
}

/// Disposes of a record; `false` for an address that is not one.
pub fn dispose_record(address: usize) -> bool {
    records().by_address.remove(&address).is_some()
}

/// The driver's task object a record links to, or `None` for an address that is not a record.
pub fn task_object_of(address: usize) -> Option<usize> {
    records().by_address.get(&address).map(|record| record.task_object)
}

/// The name and number a task value shows, or `None` for an address that is not a record.
pub fn name_and_number_of(address: usize) -> Option<(String, u32)> {
    records().by_address.get(&address).map(|record| (record.name.clone(), record.number))
}

/// The functions the memory bridge offers a driver (DT-087), with C's types: [`new_record`] over a name in UTF-8.
pub(crate) unsafe extern "C" fn bridge_new_record(name: *const u8, length: usize, task_object: usize) -> usize {
    // SAFETY: the driver passes the address and length of its name's bytes.
    let bytes = if name.is_null() { &[][..] } else { unsafe { std::slice::from_raw_parts(name, length) } };
    new_record(&String::from_utf8_lossy(bytes), task_object)
}

/// [`dispose_record`]: 0, or LabVIEW's `mgArgErr` (1) for an address that is not a record.
pub(crate) unsafe extern "C" fn bridge_dispose_record(address: usize) -> i32 {
    if dispose_record(address) { 0 } else { 1 }
}

/// [`task_object_of`]: 0 for an address that is not a record.
pub(crate) unsafe extern "C" fn bridge_task_object_of(address: usize) -> usize {
    task_object_of(address).unwrap_or(0)
}
