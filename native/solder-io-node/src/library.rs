//! The Call Library Function Node for Node (DT-080): `callLibrary` answers a promise with the return value's
//! bytes and each argument's bytes after the call, or LabVIEW's error code. Run in any thread calls on libuv's
//! pool; Run in UI thread calls on one thread of its own, always the same, as LabVIEW's UI thread is, for the
//! libraries that must be called from one thread.

use std::sync::mpsc::{Sender, channel};
use std::sync::{LazyLock, Mutex};
use std::thread;

use napi::bindgen_prelude::{AsyncTask, Buffer};
use napi::{Env, Task};
use napi_derive::napi;
use solder_io::{Argument, Call, CallResult, LibraryCaller, LibraryError, NumberKind, ReturnKind};

/// Every library loaded by the process, shared by both threads' calls.
static LIBRARY_CALLER: LazyLock<LibraryCaller> = LazyLock::new(LibraryCaller::new);

type Job = (Call, Sender<Result<CallResult, LibraryError>>);

/// The one thread that runs the calls set to Run in UI thread, started by the first of them.
static UI_THREAD: LazyLock<Mutex<Sender<Job>>> = LazyLock::new(|| {
    let (jobs, incoming) = channel::<Job>();
    thread::Builder::new()
        .name("solder-library-ui-thread".into())
        .spawn(move || {
            for (call, answer) in incoming {
                let _ = answer.send(LIBRARY_CALLER.call(call));
            }
        })
        .expect("the library UI thread starts");
    Mutex::new(jobs)
});

/// One argument as JavaScript hands it: `kind` is a data type (`i32`, `u64`, `f64`, …) for a number by value,
/// or `"buffer"` for a buffer passed by its address; `bytes` are its bytes as C sees them.
#[napi(object)]
pub struct LibraryArgument {
    pub kind: String,
    pub bytes: Buffer,
}

#[napi(object)]
pub struct LibraryCallRequest {
    pub library: String,
    pub function: String,
    /// `void`, `cstring`, or a data type.
    pub return_kind: String,
    pub arguments: Vec<LibraryArgument>,
    /// Run in UI thread (true) or Run in any thread.
    pub ui_thread: bool,
}

#[napi(object)]
pub struct LibraryCallAnswer {
    /// 0, or LabVIEW's code: 7 not found, 12 not a library, 15 no such function.
    pub status: i32,
    pub returned: Buffer,
    pub arguments: Vec<Buffer>,
}

/// The number kind of a data type's name; pointer-sized integers are 64 bits wide.
fn number_kind(name: &str) -> Option<NumberKind> {
    Some(match name {
        "i8" => NumberKind::I8,
        "i16" => NumberKind::I16,
        "i32" => NumberKind::I32,
        "i64" | "iptr" => NumberKind::I64,
        "u8" => NumberKind::U8,
        "u16" => NumberKind::U16,
        "u32" => NumberKind::U32,
        "u64" | "uptr" => NumberKind::U64,
        "f32" | "sgl" => NumberKind::F32,
        "f64" | "dbl" => NumberKind::F64,
        _ => return None,
    })
}

fn return_kind(name: &str) -> napi::Result<ReturnKind> {
    match name {
        "void" => Ok(ReturnKind::Void),
        "cstring" => Ok(ReturnKind::CString),
        other => number_kind(other).map(ReturnKind::Number).ok_or_else(|| napi::Error::from_reason(format!("unknown return kind {other}"))),
    }
}

fn argument(argument: &LibraryArgument) -> napi::Result<Argument> {
    if argument.kind == "buffer" {
        return Ok(Argument::Buffer(argument.bytes.to_vec()));
    }
    let kind = number_kind(&argument.kind).ok_or_else(|| napi::Error::from_reason(format!("unknown argument kind {}", argument.kind)))?;
    Ok(Argument::Value { kind, bytes: argument.bytes.to_vec() })
}

pub struct CallTask {
    call: Call,
    ui_thread: bool,
}

impl Task for CallTask {
    type Output = Result<CallResult, LibraryError>;
    type JsValue = LibraryCallAnswer;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let call = self.call.clone();
        if !self.ui_thread {
            return Ok(LIBRARY_CALLER.call(call));
        }
        let (answer, result) = channel();
        UI_THREAD.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).send((call, answer)).map_err(|_| napi::Error::from_reason("the library UI thread has stopped"))?;
        result.recv().map_err(|_| napi::Error::from_reason("the library UI thread has stopped"))
    }

    fn resolve(&mut self, _env: Env, outcome: Self::Output) -> napi::Result<LibraryCallAnswer> {
        Ok(match outcome {
            Ok(result) => LibraryCallAnswer {
                status: 0,
                returned: result.returned.into(),
                arguments: result.arguments.into_iter().map(Buffer::from).collect(),
            },
            Err(error) => LibraryCallAnswer { status: error.code(), returned: Vec::new().into(), arguments: Vec::new() },
        })
    }
}

/// Calls a function of a native library: `{ status, returned, arguments }`.
#[napi]
pub fn call_library(request: LibraryCallRequest) -> napi::Result<AsyncTask<CallTask>> {
    let call = Call {
        library: request.library,
        function: request.function,
        return_kind: return_kind(&request.return_kind)?,
        arguments: request.arguments.iter().map(argument).collect::<napi::Result<_>>()?,
    };
    Ok(AsyncTask::new(CallTask { call, ui_thread: request.ui_thread }))
}
