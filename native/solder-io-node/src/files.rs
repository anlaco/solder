//! Solder's files for Node (DT-067 §6). Every operation runs on libuv's pool and answers a promise, so
//! a slow disk never blocks the JavaScript thread. Errors are LabVIEW's codes, 0 when there is none.

use std::sync::LazyLock;

use napi::bindgen_prelude::{AsyncTask, Buffer, ToNapiValue, TypeName};
use napi::{Env, Task};
use napi_derive::napi;
use solder_io::{Access, FileError, FileManager, FileRefnum, Operation};

/// One file manager for the process: a refnum names the same file for every Run that holds it.
static FILE_MANAGER: LazyLock<FileManager> = LazyLock::new(FileManager::new);

/// Not A Refnum: what an open that failed hands on.
const NOT_A_REFNUM: FileRefnum = 0;
const NO_ERROR: i32 = 0;

fn code_of(error: Option<FileError>) -> i32 {
    error.map_or(NO_ERROR, |error| error.0)
}

#[napi(object)]
pub struct FileOpenAnswer {
    pub refnum: u32,
    pub error: i32,
}

#[napi(object)]
pub struct FileCloseAnswer {
    pub name: String,
    pub error: i32,
}

#[napi(object)]
pub struct FileReadAnswer {
    pub text: Buffer,
    pub error: i32,
}

#[napi(object)]
pub struct FileLinesAnswer {
    pub lines: Vec<Buffer>,
    pub error: i32,
}

/// The size is a double: JavaScript's number holds every file size a disk has.
#[napi(object)]
pub struct FileSizeAnswer {
    pub size: f64,
    pub error: i32,
}

/// A file operation run on libuv's pool, whose answer goes to JavaScript as it is.
pub struct FileTask<Answer> {
    work: Option<Box<dyn FnOnce() -> Answer + Send>>,
}

impl<Answer> FileTask<Answer> {
    fn run(work: impl FnOnce() -> Answer + Send + 'static) -> AsyncTask<FileTask<Answer>>
    where
        FileTask<Answer>: Task,
    {
        AsyncTask::new(FileTask { work: Some(Box::new(work)) })
    }
}

impl<Answer: Send + ToNapiValue + TypeName + 'static> Task for FileTask<Answer> {
    type Output = Answer;
    type JsValue = Answer;

    fn compute(&mut self) -> napi::Result<Answer> {
        let work = self.work.take().expect("a file task runs once");
        Ok(work())
    }

    fn resolve(&mut self, _env: Env, answer: Answer) -> napi::Result<Answer> {
        Ok(answer)
    }
}

/// Open/Create/Replace File: `{ refnum, error }`, with refnum 0 when it failed.
#[napi]
pub fn file_open(name: String, operation: u32, access: u32) -> AsyncTask<FileTask<FileOpenAnswer>> {
    FileTask::run(move || {
        let (Some(operation), Some(access)) = (Operation::from_number(operation), Access::from_number(access)) else {
            return FileOpenAnswer { refnum: NOT_A_REFNUM, error: FileError::INVALID_INPUT.0 };
        };
        match FILE_MANAGER.open(&name, operation, access) {
            Ok(refnum) => FileOpenAnswer { refnum, error: NO_ERROR },
            Err(error) => FileOpenAnswer { refnum: NOT_A_REFNUM, error: error.0 },
        }
    })
}

/// Close File: `{ name, error }`, the name of the file it closed or "" with the error.
#[napi]
pub fn file_close(refnum: u32) -> AsyncTask<FileTask<FileCloseAnswer>> {
    FileTask::run(move || match FILE_MANAGER.close(refnum) {
        Ok(name) => FileCloseAnswer { name, error: NO_ERROR },
        Err(error) => FileCloseAnswer { name: String::new(), error: error.0 },
    })
}

/// Write to Text File at the current position: its error.
#[napi]
pub fn file_write(refnum: u32, text: Buffer, convert_end_of_line: bool) -> AsyncTask<FileTask<i32>> {
    let text = text.to_vec();
    FileTask::run(move || code_of(FILE_MANAGER.write_text(refnum, &text, convert_end_of_line).err()))
}

/// Write to Text File with an array of strings: its error.
#[napi]
pub fn file_write_lines(refnum: u32, lines: Vec<Buffer>, convert_end_of_line: bool) -> AsyncTask<FileTask<i32>> {
    let lines: Vec<Vec<u8>> = lines.iter().map(|line| line.to_vec()).collect();
    FileTask::run(move || code_of(FILE_MANAGER.write_lines(refnum, &lines, convert_end_of_line).err()))
}

/// Read from Text File with Read Lines and count unwired: `{ text, error }`, the next line with its end.
#[napi]
pub fn file_read_line(refnum: u32, convert_end_of_line: bool) -> AsyncTask<FileTask<FileReadAnswer>> {
    FileTask::run(move || {
        let read = FILE_MANAGER.read_line(refnum, convert_end_of_line);
        FileReadAnswer { text: read.text.into(), error: code_of(read.error) }
    })
}

/// Read from Text File: `{ text, error }`; a negative count reads to the end.
#[napi]
pub fn file_read(refnum: u32, count: f64, convert_end_of_line: bool) -> AsyncTask<FileTask<FileReadAnswer>> {
    FileTask::run(move || {
        let read = FILE_MANAGER.read_text(refnum, count as i64, convert_end_of_line);
        FileReadAnswer { text: read.text.into(), error: code_of(read.error) }
    })
}

/// Read from Text File with Read Lines: `{ lines, error }`; a negative count reads every line.
#[napi]
pub fn file_read_lines(refnum: u32, count: f64) -> AsyncTask<FileTask<FileLinesAnswer>> {
    FileTask::run(move || {
        let read = FILE_MANAGER.read_lines(refnum, count as i64);
        FileLinesAnswer { lines: read.lines.into_iter().map(Buffer::from).collect(), error: code_of(read.error) }
    })
}

/// Get File Size of an open file: `{ size, error }`.
#[napi]
pub fn file_size(refnum: u32) -> AsyncTask<FileTask<FileSizeAnswer>> {
    FileTask::run(move || match FILE_MANAGER.size(refnum) {
        Ok(size) => FileSizeAnswer { size: size as f64, error: NO_ERROR },
        Err(error) => FileSizeAnswer { size: 0.0, error: error.0 },
    })
}

/// Delete of a file or a folder: its error.
#[napi]
pub fn file_delete(name: String, entire_hierarchy: bool) -> AsyncTask<FileTask<i32>> {
    FileTask::run(move || code_of(FILE_MANAGER.delete(&name, entire_hierarchy).err()))
}

/// The name of the file a refnum has open, "" when it has none; at once, for an error's source.
#[napi]
pub fn file_name(refnum: u32) -> String {
    FILE_MANAGER.name(refnum).unwrap_or_default()
}
