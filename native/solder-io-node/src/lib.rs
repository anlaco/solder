//! Solder's VISA for Node (DT-065). Every operation runs on libuv's pool and answers a promise, so
//! a Read waiting for its timeout never blocks the JavaScript thread. Statuses are VISA's codes.
//! The file functions (DT-067) are in `files`.

mod files;

use std::sync::LazyLock;
use std::time::Duration;

use napi::bindgen_prelude::{AsyncTask, Buffer};
use napi::{Env, Task};
use napi_derive::napi;
use solder_io::{AttributesChange, ReadResult, ResourceManager, SessionId, Status, WriteResult};

/// One resource manager for the process, as VISA's default resource manager.
static RESOURCE_MANAGER: LazyLock<ResourceManager> = LazyLock::new(ResourceManager::new);

/// "No session": what an Open that failed hands on.
const NO_SESSION: SessionId = 0;

#[napi(object)]
pub struct OpenAnswer {
    pub session: u32,
    pub status: i32,
}

#[napi(object)]
pub struct WriteAnswer {
    pub count: u32,
    pub status: i32,
}

#[napi(object)]
pub struct ReadAnswer {
    pub data: Buffer,
    pub status: i32,
}

#[napi(object)]
pub struct AttributesAnswer {
    pub status: i32,
    pub timeout_ms: u32,
    pub termination_character: u32,
    pub termination_character_enabled: bool,
}

/// The attributes to change; those left out keep their value.
#[napi(object)]
pub struct AttributesRequest {
    pub timeout_ms: Option<u32>,
    pub termination_character: Option<u32>,
    pub termination_character_enabled: Option<bool>,
}

pub struct OpenTask {
    resource: String,
}

impl Task for OpenTask {
    type Output = Result<SessionId, Status>;
    type JsValue = OpenAnswer;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        Ok(RESOURCE_MANAGER.open(&self.resource))
    }

    fn resolve(&mut self, _env: Env, opened: Self::Output) -> napi::Result<OpenAnswer> {
        Ok(match opened {
            Ok(session) => OpenAnswer { session, status: Status::SUCCESS.0 },
            Err(status) => OpenAnswer { session: NO_SESSION, status: status.0 },
        })
    }
}

pub struct WriteTask {
    session: SessionId,
    data: Vec<u8>,
}

impl Task for WriteTask {
    type Output = WriteResult;
    type JsValue = WriteAnswer;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        Ok(RESOURCE_MANAGER.write(self.session, &self.data))
    }

    fn resolve(&mut self, _env: Env, written: Self::Output) -> napi::Result<WriteAnswer> {
        Ok(WriteAnswer { count: written.count as u32, status: written.status.0 })
    }
}

pub struct ReadTask {
    session: SessionId,
    count: usize,
}

impl Task for ReadTask {
    type Output = ReadResult;
    type JsValue = ReadAnswer;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        Ok(RESOURCE_MANAGER.read(self.session, self.count))
    }

    fn resolve(&mut self, _env: Env, read: Self::Output) -> napi::Result<ReadAnswer> {
        Ok(ReadAnswer { data: read.data.into(), status: read.status.0 })
    }
}

pub struct CloseTask {
    session: SessionId,
}

impl Task for CloseTask {
    type Output = Status;
    type JsValue = i32;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        Ok(RESOURCE_MANAGER.close(self.session))
    }

    fn resolve(&mut self, _env: Env, status: Self::Output) -> napi::Result<i32> {
        Ok(status.0)
    }
}

/// VISA Open: `{ session, status }`, with session 0 when it failed.
#[napi]
pub fn open(resource: String) -> AsyncTask<OpenTask> {
    AsyncTask::new(OpenTask { resource })
}

/// VISA Write: `{ count, status }`.
#[napi]
pub fn write(session: u32, data: Buffer) -> AsyncTask<WriteTask> {
    AsyncTask::new(WriteTask { session, data: data.to_vec() })
}

/// VISA Read: `{ data, status }`; the data comes even with an error, as a timeout's does.
#[napi]
pub fn read(session: u32, count: u32) -> AsyncTask<ReadTask> {
    AsyncTask::new(ReadTask { session, count: count as usize })
}

/// VISA Close: its status.
#[napi]
pub fn close(session: u32) -> AsyncTask<CloseTask> {
    AsyncTask::new(CloseTask { session })
}

/// A VISA Property Node that reads. It answers at once: attributes never wait for the instrument.
#[napi]
pub fn attributes(session: u32) -> AttributesAnswer {
    match RESOURCE_MANAGER.attributes(session) {
        Ok(attributes) => AttributesAnswer {
            status: Status::SUCCESS.0,
            timeout_ms: attributes.timeout.as_millis() as u32,
            termination_character: u32::from(attributes.termination_character),
            termination_character_enabled: attributes.termination_character_enabled,
        },
        Err(status) => AttributesAnswer {
            status: status.0,
            timeout_ms: 0,
            termination_character: 0,
            termination_character_enabled: false,
        },
    }
}

/// A VISA Property Node that writes: its status. A termination character keeps its low byte, as
/// VISA's attribute is one byte wide.
#[napi]
pub fn change_attributes(session: u32, request: AttributesRequest) -> i32 {
    let change = AttributesChange {
        timeout: request.timeout_ms.map(|milliseconds| Duration::from_millis(u64::from(milliseconds))),
        termination_character: request.termination_character.map(|character| character as u8),
        termination_character_enabled: request.termination_character_enabled,
    };
    RESOURCE_MANAGER.change_attributes(session, change).0
}
