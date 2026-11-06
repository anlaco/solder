//! Solder's VISA for Node (DT-065). Every operation runs on libuv's pool and answers a promise, so
//! a Read waiting for its timeout never blocks the JavaScript thread. Statuses are VISA's codes.
//! The file functions (DT-067) are in `files`; the Call Library Function Node (DT-080) in `library`.

mod files;
mod library;

use std::sync::LazyLock;
use std::time::Duration;

use napi::bindgen_prelude::{AsyncTask, Buffer};
use napi::{Env, Task};
use napi_derive::napi;
use solder_io::{AttributesChange, Opened, ReadResult, ResourceManager, SessionId, Status, WriteResult};

/// One resource manager for the process, as VISA's default resource manager.
static RESOURCE_MANAGER: LazyLock<ResourceManager> = LazyLock::new(ResourceManager::new);

/// "No session": what an Open that failed hands on.
const NO_SESSION: SessionId = 0;

#[napi(object)]
pub struct OpenAnswer {
    pub session: u32,
    pub status: i32,
    /// What the resource name out shows: an alias as typed, a resource with its keywords in capitals.
    pub name_out: String,
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
    /// Serial Settings, as VISA's values, on a serial session only.
    pub serial: Option<SerialAttributesAnswer>,
}

#[napi(object)]
pub struct SerialAttributesAnswer {
    pub baud_rate: u32,
    pub data_bits: u32,
    pub parity: u32,
    pub stop_bits: u32,
    pub flow_control: u32,
    pub end_mode_for_reads: u32,
}

/// The attributes to change; those left out keep their value.
#[napi(object)]
pub struct AttributesRequest {
    pub timeout_ms: Option<u32>,
    pub termination_character: Option<u32>,
    pub termination_character_enabled: Option<bool>,
    pub baud_rate: Option<u32>,
    pub data_bits: Option<u32>,
    pub parity: Option<u32>,
    pub stop_bits: Option<u32>,
    pub flow_control: Option<u32>,
    pub end_mode_for_reads: Option<u32>,
}

#[napi(object)]
pub struct BytesAtPortAnswer {
    pub count: u32,
    pub status: i32,
}

pub struct OpenTask {
    resource: String,
}

impl Task for OpenTask {
    type Output = Result<Opened, Status>;
    type JsValue = OpenAnswer;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        Ok(RESOURCE_MANAGER.open(&self.resource))
    }

    fn resolve(&mut self, _env: Env, opened: Self::Output) -> napi::Result<OpenAnswer> {
        Ok(match opened {
            Ok(Opened { session, name_out }) => OpenAnswer { session, status: Status::SUCCESS.0, name_out },
            Err(status) => OpenAnswer { session: NO_SESSION, status: status.0, name_out: self.resource.clone() },
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
            serial: attributes.serial.map(|serial| SerialAttributesAnswer {
                baud_rate: serial.line.baud_rate,
                data_bits: u32::from(serial.line.data_bits),
                parity: serial.line.parity as u32,
                stop_bits: serial.line.stop_bits as u32,
                flow_control: u32::from(serial.line.flow_control.to_visa()),
                end_mode_for_reads: serial.end_mode_for_reads as u32,
            }),
        },
        Err(status) => AttributesAnswer {
            status: status.0,
            timeout_ms: 0,
            termination_character: 0,
            termination_character_enabled: false,
            serial: None,
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
        baud_rate: request.baud_rate,
        data_bits: request.data_bits.map(as_visa_u16),
        parity: request.parity.map(as_visa_u16),
        stop_bits: request.stop_bits.map(as_visa_u16),
        flow_control: request.flow_control.map(as_visa_u16),
        end_mode_for_reads: request.end_mode_for_reads.map(as_visa_u16),
    };
    RESOURCE_MANAGER.change_attributes(session, change).0
}

/// VISA's 16-bit serial attributes: a larger value can be no valid one, and its low bits must not make it one.
fn as_visa_u16(value: u32) -> u16 {
    u16::try_from(value).unwrap_or(u16::MAX)
}

/// Serial Settings ▸ Number of Bytes at Serial Port. It answers at once: it asks the driver, not the instrument.
#[napi]
pub fn bytes_at_port(session: u32) -> BytesAtPortAnswer {
    match RESOURCE_MANAGER.bytes_at_port(session) {
        Ok(count) => BytesAtPortAnswer { count: u32::try_from(count).unwrap_or(u32::MAX), status: Status::SUCCESS.0 },
        Err(status) => BytesAtPortAnswer { count: 0, status: status.0 },
    }
}
