//! Files as LabVIEW's File I/O functions see them (DT-067 §6): refnums to open files, the operations
//! and access modes of Open/Create/Replace File, text written and read at the current position with
//! Convert EOL, and LabVIEW's error codes. Measured in LabVIEW 2026 Q3 on Windows:
//! `labview-captures/reports/2026-10-26-file-io-behavior.md`.
//!
//! Every name handed in is the system's own name of the file; turning a Solder path into it is the
//! host's work.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, ErrorKind, Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

/// A file refnum: a number that names an open file until it is closed; 0 is Not A Refnum.
pub type FileRefnum = u32;

/// Refnums are numbered from 1, so that 0 stays Not A Refnum (DT-067 §5).
const FIRST_REFNUM: FileRefnum = 1;

/// The end of line Convert EOL writes: the system's (measured CRLF on Windows; LF elsewhere is unverified).
#[cfg(windows)]
pub const SYSTEM_END_OF_LINE: &[u8] = b"\r\n";
#[cfg(not(windows))]
pub const SYSTEM_END_OF_LINE: &[u8] = b"\n";

const CARRIAGE_RETURN: u8 = b'\r';
const LINE_FEED: u8 = b'\n';

/// A LabVIEW error code, as the error cluster shows it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FileError(pub i32);

impl FileError {
    /// An input is not acceptable: Close File of a refnum that is not open (measured).
    pub const INVALID_INPUT: FileError = FileError(1);
    /// The end of the file came before the count asked for; the data read still come (measured).
    pub const END_OF_FILE: FileError = FileError(4);
    /// The file is open: Delete refuses it (measured).
    pub const ALREADY_OPEN: FileError = FileError(5);
    /// A file operation failed in a way LabVIEW has no closer code for (measured: Delete of a folder
    /// that is not empty without entire hierarchy; any other system error here is unverified).
    pub const GENERIC: FileError = FileError(6);
    /// The file does not exist (measured: open or replace of a missing file).
    pub const NOT_FOUND: FileError = FileError(7);
    /// The refnum's access does not allow it, or the system refuses it (measured: write on read-only).
    pub const PERMISSION_DENIED: FileError = FileError(8);
    /// The file already exists (measured: create of an existing file).
    pub const ALREADY_EXISTS: FileError = FileError(10);
    /// The operation was cancelled (measured: op 5's confirmation answered Cancel).
    pub const CANCELLED: FileError = FileError(43);
    /// The path names a folder where a file is needed (measured on Get File Size).
    pub const IS_A_FOLDER: FileError = FileError(1059);
}

/// Open/Create/Replace File's operation, numbered as its enum (measured).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Operation {
    Open,
    Replace,
    Create,
    OpenOrCreate,
    ReplaceOrCreate,
    ReplaceOrCreateWithConfirmation,
}

impl Operation {
    pub fn from_number(number: u32) -> Option<Operation> {
        use Operation::*;
        [Open, Replace, Create, OpenOrCreate, ReplaceOrCreate, ReplaceOrCreateWithConfirmation].get(number as usize).copied()
    }

    fn needs_existing(self) -> bool {
        matches!(self, Operation::Open | Operation::Replace)
    }

    fn truncates(self) -> bool {
        matches!(self, Operation::Replace | Operation::ReplaceOrCreate | Operation::ReplaceOrCreateWithConfirmation)
    }
}

/// Open/Create/Replace File's access, numbered as its enum (measured).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Access {
    ReadWrite,
    ReadOnly,
    WriteOnly,
}

impl Access {
    pub fn from_number(number: u32) -> Option<Access> {
        [Access::ReadWrite, Access::ReadOnly, Access::WriteOnly].get(number as usize).copied()
    }

    fn reads(self) -> bool {
        self != Access::WriteOnly
    }

    fn writes(self) -> bool {
        self != Access::ReadOnly
    }
}

/// What Read from Text File gives: the text read, even when it ends in an error (measured: error 4
/// still returns what was read).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TextRead {
    pub text: Vec<u8>,
    pub error: Option<FileError>,
}

/// What Read from Text File gives with Read Lines on: the lines, without their ends of line.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LinesRead {
    pub lines: Vec<Vec<u8>>,
    pub error: Option<FileError>,
}

struct OpenFile {
    file: File,
    name: String,
    /// The file's name with every link and relative step resolved, to know whether Delete names it.
    canonical_name: PathBuf,
    access: Access,
}

/// The open files, each behind its own lock, so a read of one file does not hold back another.
pub struct FileManager {
    files: Mutex<HashMap<FileRefnum, Arc<Mutex<OpenFile>>>>,
    next_refnum: AtomicU32,
}

impl Default for FileManager {
    fn default() -> Self {
        FileManager { files: Mutex::new(HashMap::new()), next_refnum: AtomicU32::new(FIRST_REFNUM) }
    }
}

impl FileManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Open/Create/Replace File. The position starts at 0 whatever the operation (measured: never at
    /// the end). Op 5 on an existing file is cancelled until the editor has its confirmation dialog
    /// (DT-067, amendment of 2026-10-28).
    pub fn open(&self, name: &str, operation: Operation, access: Access) -> Result<FileRefnum, FileError> {
        let existing = fs::metadata(name).ok();
        if existing.as_ref().is_some_and(|metadata| metadata.is_dir()) {
            // Measured on Open/Create/Replace File, Read from Text File, Write to Text File and Get File Size.
            return Err(FileError::IS_A_FOLDER);
        }
        let exists = existing.is_some();
        match (operation, exists) {
            (operation, false) if operation.needs_existing() => return Err(FileError::NOT_FOUND),
            (Operation::Create, true) => return Err(FileError::ALREADY_EXISTS),
            (Operation::ReplaceOrCreateWithConfirmation, true) => return Err(FileError::CANCELLED),
            _ => {}
        }
        if !exists {
            File::create_new(name).map_err(error_of)?;
        } else if operation.truncates() {
            OpenOptions::new().write(true).truncate(true).open(name).map_err(error_of)?;
        }
        let file = OpenOptions::new().read(access.reads()).write(access.writes()).open(name).map_err(error_of)?;
        let canonical_name = fs::canonicalize(name).map_err(error_of)?;
        let refnum = self.next_refnum.fetch_add(1, Ordering::Relaxed);
        self.lock_files().insert(refnum, Arc::new(Mutex::new(OpenFile { file, name: name.to_owned(), canonical_name, access })));
        Ok(refnum)
    }

    /// Delete: a file, or a folder, which must be empty unless `entire_hierarchy` (measured: error 6).
    /// A file that is open is refused with error 5 on every system, as LabVIEW on Windows does (measured).
    pub fn delete(&self, name: &str, entire_hierarchy: bool) -> Result<(), FileError> {
        let metadata = fs::symlink_metadata(name).map_err(error_of)?;
        if !metadata.is_dir() {
            let canonical_name = fs::canonicalize(name).map_err(error_of)?;
            if self.is_open(&canonical_name) {
                return Err(FileError::ALREADY_OPEN);
            }
            return fs::remove_file(name).map_err(error_of);
        }
        if entire_hierarchy {
            return fs::remove_dir_all(name).map_err(error_of);
        }
        fs::remove_dir(name).map_err(|error| if error.kind() == ErrorKind::DirectoryNotEmpty { FileError::GENERIC } else { error_of(error) })
    }

    fn is_open(&self, canonical_name: &PathBuf) -> bool {
        let files: Vec<_> = self.lock_files().values().cloned().collect();
        files.iter().any(|open| open.lock().unwrap_or_else(PoisonError::into_inner).canonical_name == *canonical_name)
    }

    /// Close File: the name of the file it closed. A refnum that is not open is error 1 (measured).
    pub fn close(&self, refnum: FileRefnum) -> Result<String, FileError> {
        let open = self.lock_files().remove(&refnum).ok_or(FileError::INVALID_INPUT)?;
        let open = open.lock().unwrap_or_else(PoisonError::into_inner);
        Ok(open.name.clone())
    }

    /// The name of the file a refnum has open, for the error sources that carry it.
    pub fn name(&self, refnum: FileRefnum) -> Option<String> {
        self.with_file(refnum, |open| open.name.clone()).ok()
    }

    /// Write to Text File at the current position. With Convert EOL every end of line (CR, LF, CRLF,
    /// LFCR) is written as the system's (measured on Windows).
    pub fn write_text(&self, refnum: FileRefnum, text: &[u8], convert_end_of_line: bool) -> Result<(), FileError> {
        self.with_file(refnum, |open| {
            if !open.access.writes() {
                return Err(FileError::PERMISSION_DENIED);
            }
            let bytes = if convert_end_of_line { convert_ends_of_line(text, SYSTEM_END_OF_LINE) } else { text.to_vec() };
            open.file.write_all(&bytes).map_err(error_of)
        })?
    }

    /// Write to Text File with an array of strings: each element followed by the system's end of line,
    /// the last too, with or without Convert EOL, which converts only the ends of line inside the elements
    /// (measured: `["a\rb","y"]` with it off gives `61 0d 62 0d 0a 79 0d 0a`).
    pub fn write_lines(&self, refnum: FileRefnum, lines: &[Vec<u8>], convert_end_of_line: bool) -> Result<(), FileError> {
        let mut bytes = Vec::new();
        for line in lines {
            if convert_end_of_line {
                bytes.extend(convert_ends_of_line(line, SYSTEM_END_OF_LINE));
            } else {
                bytes.extend_from_slice(line);
            }
            bytes.extend_from_slice(SYSTEM_END_OF_LINE);
        }
        self.write_text(refnum, &bytes, false)
    }

    /// Read from Text File: up to `count` bytes of the file from the current position, all of them
    /// when `count` is negative. Asking for more than there is gives what there is and error 4
    /// (measured). With Convert EOL every end of line becomes one LF.
    pub fn read_text(&self, refnum: FileRefnum, count: i64, convert_end_of_line: bool) -> TextRead {
        let read = self.with_file(refnum, |open| {
            if !open.access.reads() {
                return Err(FileError::PERMISSION_DENIED);
            }
            let rest = read_rest(&mut open.file)?;
            let wanted = usize::try_from(count).unwrap_or(rest.len());
            let taken = wanted.min(rest.len());
            move_back(&mut open.file, rest.len() - taken)?;
            let text = &rest[..taken];
            let text = if convert_end_of_line { convert_ends_of_line(text, &[LINE_FEED]) } else { text.to_vec() };
            Ok(TextRead { text, error: (wanted > rest.len()).then_some(FileError::END_OF_FILE) })
        });
        flatten(read).unwrap_or_else(|error| TextRead { text: Vec::new(), error: Some(error) })
    }

    /// Read from Text File with Read Lines: up to `count` lines, all of them when it is negative. A
    /// line ends at CR, LF or CRLF, and LFCR is two ends of line (measured); reaching the end of the file
    /// before `count` ended lines is error 4, with the lines read (measured).
    pub fn read_lines(&self, refnum: FileRefnum, count: i64) -> LinesRead {
        let read = self.with_file(refnum, |open| {
            if !open.access.reads() {
                return Err(FileError::PERMISSION_DENIED);
            }
            let rest = read_rest(&mut open.file)?;
            let (lines, consumed, complete) = split_lines(&rest, count);
            move_back(&mut open.file, rest.len() - consumed)?;
            Ok(LinesRead { lines, error: (!complete).then_some(FileError::END_OF_FILE) })
        });
        flatten(read).unwrap_or_else(|error| LinesRead { lines: Vec::new(), error: Some(error) })
    }

    /// Read from Text File with Read Lines and count unwired: a string, the next line with its end of line
    /// (measured: `ab\r\ncd\r\n` gives "ab\n" with Convert EOL, `a\n\rb` gives "a\n"). Unverified: an empty
    /// rest is error 4, and a last line with no end of line comes with no error.
    pub fn read_line(&self, refnum: FileRefnum, convert_end_of_line: bool) -> TextRead {
        let read = self.with_file(refnum, |open| {
            if !open.access.reads() {
                return Err(FileError::PERMISSION_DENIED);
            }
            let rest = read_rest(&mut open.file)?;
            let (_, consumed, _) = split_lines(&rest, 1);
            move_back(&mut open.file, rest.len() - consumed)?;
            let line = &rest[..consumed];
            let text = if convert_end_of_line { convert_ends_of_line(line, &[LINE_FEED]) } else { line.to_vec() };
            Ok(TextRead { text, error: rest.is_empty().then_some(FileError::END_OF_FILE) })
        });
        flatten(read).unwrap_or_else(|error| TextRead { text: Vec::new(), error: Some(error) })
    }

    /// Get File Size of an open file; the position does not move.
    pub fn size(&self, refnum: FileRefnum) -> Result<u64, FileError> {
        self.with_file(refnum, |open| open.file.metadata().map(|metadata| metadata.len()).map_err(error_of))?
    }

    fn with_file<T>(&self, refnum: FileRefnum, operation: impl FnOnce(&mut OpenFile) -> T) -> Result<T, FileError> {
        let open = self.lock_files().get(&refnum).cloned().ok_or(FileError::INVALID_INPUT)?;
        let mut open = open.lock().unwrap_or_else(PoisonError::into_inner);
        Ok(operation(&mut open))
    }

    fn lock_files(&self) -> MutexGuard<'_, HashMap<FileRefnum, Arc<Mutex<OpenFile>>>> {
        self.files.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

fn flatten<T>(result: Result<Result<T, FileError>, FileError>) -> Result<T, FileError> {
    result.and_then(|inner| inner)
}

/// Every byte from the current position to the end; the position ends at the end.
fn read_rest(file: &mut File) -> Result<Vec<u8>, FileError> {
    let mut rest = Vec::new();
    file.read_to_end(&mut rest).map_err(error_of)?;
    Ok(rest)
}

/// Moves the position back over the bytes read but not handed out.
fn move_back(file: &mut File, unused: usize) -> Result<(), FileError> {
    if unused > 0 {
        file.seek(SeekFrom::Current(-(unused as i64))).map_err(error_of)?;
    }
    Ok(())
}

/// The length of the end of line that starts at `index`, or 0 if none does. CRLF and LFCR are one end
/// of line each, so `\n\n` is two and `\r\n\r\n` is two (measured on writing and reading).
fn end_of_line_length(bytes: &[u8], index: usize) -> usize {
    match (bytes[index], bytes.get(index + 1)) {
        (CARRIAGE_RETURN, Some(&LINE_FEED)) | (LINE_FEED, Some(&CARRIAGE_RETURN)) => 2,
        (CARRIAGE_RETURN, _) | (LINE_FEED, _) => 1,
        _ => 0,
    }
}

/// The length of the end of a line that starts at `index` for Read Lines, or 0 if none does: CRLF, CR or
/// LF, so LFCR is two (measured: `a\n\rb` gives ["a", "", "b"]).
fn line_end_length(bytes: &[u8], index: usize) -> usize {
    match (bytes[index], bytes.get(index + 1)) {
        (CARRIAGE_RETURN, Some(&LINE_FEED)) => 2,
        (CARRIAGE_RETURN, _) | (LINE_FEED, _) => 1,
        _ => 0,
    }
}

/// `text` with every end of line replaced by `end_of_line`.
pub fn convert_ends_of_line(text: &[u8], end_of_line: &[u8]) -> Vec<u8> {
    let mut converted = Vec::with_capacity(text.len());
    let mut index = 0;
    while index < text.len() {
        match end_of_line_length(text, index) {
            0 => {
                converted.push(text[index]);
                index += 1;
            }
            length => {
                converted.extend_from_slice(end_of_line);
                index += length;
            }
        }
    }
    converted
}

/// Up to `count` lines of `bytes` (all when negative), how many bytes they took with their ends of
/// line, and whether `count` ended lines were found. A last line with no end of line counts when all
/// lines are asked for (measured: `ab\ncd` with -1 gives both and no error, with 2 gives both and error 4).
fn split_lines(bytes: &[u8], count: i64) -> (Vec<Vec<u8>>, usize, bool) {
    let wanted = usize::try_from(count).ok();
    let mut lines = Vec::new();
    let mut start = 0;
    let mut index = 0;
    while wanted.is_none_or(|wanted| lines.len() < wanted) {
        if index == bytes.len() {
            if index > start {
                lines.push(bytes[start..].to_vec());
                start = index;
            }
            return (lines, start, wanted.is_none());
        }
        match line_end_length(bytes, index) {
            0 => index += 1,
            length => {
                lines.push(bytes[start..index].to_vec());
                index += length;
                start = index;
            }
        }
    }
    (lines, start, true)
}

/// The LabVIEW code of a system error.
fn error_of(error: io::Error) -> FileError {
    match error.kind() {
        ErrorKind::NotFound => FileError::NOT_FOUND,
        ErrorKind::PermissionDenied => FileError::PERMISSION_DENIED,
        ErrorKind::AlreadyExists => FileError::ALREADY_EXISTS,
        _ => FileError::GENERIC,
    }
}
