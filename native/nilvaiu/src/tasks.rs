//! The library's tasks: the engine they live in, and the task objects whose addresses are their `taskID` (DT-087,
//! amendment of 2026-11-13). Measured in LabVIEW: the `taskID` a node passes is the address of the driver's own task
//! object, and 0 or any address that is not one gives -200088. Every address is looked up in the table of live objects
//! before it is used, so a wrong one is an error and never a crash.
//!
//! One engine serves the process, over the simulated devices and the machine's clock. Its lock is never held across a
//! wait: a read or Wait Until Done asks the engine how long to wait, waits on the clock, and then takes the lock again.

use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex, MutexGuard};

use solder_daq::clock::{Clock, SystemClock};
use solder_daq::device::DeviceTable;
use solder_daq::engine::{Engine, TaskId, Wait};
use solder_daq::error::{DaqError, codes};

use crate::host;

/// A task as the library hands it out. Boxed, so its address, the `taskID`, stays put.
struct TaskObject {
    engine_task: TaskId,
    /// The host's record of it, which the VIs' task wire holds.
    record: usize,
}

static ENGINE: LazyLock<Mutex<Engine>> = LazyLock::new(|| Mutex::new(Engine::new(DeviceTable::simulated(), Arc::new(SystemClock::new()))));
static CLOCK: LazyLock<Arc<dyn Clock>> = LazyLock::new(|| engine().clock());
static LIVE: LazyLock<Mutex<HashMap<usize, Box<TaskObject>>>> = LazyLock::new(Default::default);

pub fn engine() -> MutexGuard<'static, Engine> {
    ENGINE.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn live() -> MutexGuard<'static, HashMap<usize, Box<TaskObject>>> {
    LIVE.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// A new task named `name` (an empty name is the engine's to choose), with its host record; the record's address.
pub fn create(name: &str) -> Result<usize, DaqError> {
    let engine_task = engine().create_task(name);
    let task_name = engine().task_name(engine_task).unwrap_or_default();
    let mut object = Box::new(TaskObject { engine_task, record: 0 });
    let task_id = &raw const *object as usize;
    let Some(record) = host::new_task_record(&task_name, task_id) else {
        let _ = engine().clear(engine_task);
        return Err(DaqError::bare(codes::NOT_BUILT_IN_SOLDER));
    };
    object.record = record;
    live().insert(task_id, object);
    Ok(record)
}

/// The engine's task behind a `taskID`.
pub fn from_task_id(task_id: usize) -> Result<TaskId, DaqError> {
    live().get(&task_id).map(|object| object.engine_task).ok_or_else(|| DaqError::bare(codes::INVALID_TASK))
}

/// The engine's task behind a record's address, as the create and destroy functions are given it.
pub fn from_record(record: usize) -> Result<TaskId, DaqError> {
    host::task_object_of_record(record).map_or_else(|| Err(DaqError::bare(codes::INVALID_TASK)), from_task_id)
}

/// Clears a task and lets go of its object and its record. Clearing what is no longer a task is not an error
/// (measured on the engine: Clear twice).
pub fn destroy(record: usize) -> Result<(), DaqError> {
    let Some(task_id) = host::task_object_of_record(record) else { return Ok(()) };
    let Some(object) = live().remove(&task_id) else { return Ok(()) };
    host::dispose_task_record(object.record);
    engine().clear(object.engine_task)
}

/// Makes a wait the engine asked for, holding nothing, and gives its outcome.
pub fn wait_outside<T>(wait: Wait<T>) -> Result<T, DaqError> {
    CLOCK.wait(wait.duration);
    wait.outcome
}
