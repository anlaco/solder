//! Files on a temporary folder per test, compared with what LabVIEW 2026 Q3 did on Windows
//! (`labview-captures/reports/2026-10-26-file-io-behavior.md`). The ends of line Convert EOL writes are
//! the system's, so the measured CRLF tables are checked on the conversion itself.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};

use solder_io::{Access, FileError, FileManager, Operation, SYSTEM_END_OF_LINE, convert_ends_of_line};

const MEASURED_END_OF_LINE: &[u8] = b"\r\n";
const EXISTING_CONTENT: &[u8] = b"hello";

/// A folder of its own for each test, emptied first.
fn scratch_folder() -> PathBuf {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let folder = std::env::temp_dir().join(format!("solder-io-files-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).unwrap();
    folder
}

fn name_in(folder: &PathBuf, file: &str) -> String {
    folder.join(file).to_string_lossy().into_owned()
}

fn existing_file(folder: &PathBuf) -> String {
    let name = name_in(folder, "x.txt");
    fs::write(&name, EXISTING_CONTENT).unwrap();
    name
}

fn file_with(folder: &PathBuf, content: &[u8]) -> String {
    let name = name_in(folder, "r.txt");
    fs::write(&name, content).unwrap();
    name
}

#[test]
fn each_operation_on_an_existing_file_does_what_labview_does() {
    let measured: [(Operation, Result<&[u8], FileError>); 6] = [
        (Operation::Open, Ok(EXISTING_CONTENT)),
        (Operation::Replace, Ok(b"")),
        (Operation::Create, Err(FileError::ALREADY_EXISTS)),
        (Operation::OpenOrCreate, Ok(EXISTING_CONTENT)),
        (Operation::ReplaceOrCreate, Ok(b"")),
        // Cancelled until the editor has the confirmation dialog (DT-067, amendment of 2026-10-28).
        (Operation::ReplaceOrCreateWithConfirmation, Err(FileError::CANCELLED)),
    ];
    for (operation, expected) in measured {
        let folder = scratch_folder();
        let name = existing_file(&folder);
        let files = FileManager::new();
        match expected {
            Ok(content) => {
                let refnum = files.open(&name, operation, Access::ReadWrite).unwrap();
                assert_ne!(refnum, 0, "{operation:?}");
                assert_eq!(fs::read(&name).unwrap(), content, "{operation:?}");
            }
            Err(error) => {
                assert_eq!(files.open(&name, operation, Access::ReadWrite), Err(error), "{operation:?}");
                assert_eq!(fs::read(&name).unwrap(), EXISTING_CONTENT, "{operation:?} leaves the file untouched");
            }
        }
    }
}

#[test]
fn each_operation_on_a_missing_file_does_what_labview_does() {
    let measured = [
        (Operation::Open, Some(FileError::NOT_FOUND)),
        (Operation::Replace, Some(FileError::NOT_FOUND)),
        (Operation::Create, None),
        (Operation::OpenOrCreate, None),
        (Operation::ReplaceOrCreate, None),
        (Operation::ReplaceOrCreateWithConfirmation, None),
    ];
    for (operation, error) in measured {
        let folder = scratch_folder();
        let name = name_in(&folder, "missing.txt");
        let opened = FileManager::new().open(&name, operation, Access::ReadWrite);
        match error {
            Some(error) => {
                assert_eq!(opened, Err(error), "{operation:?}");
                assert!(fs::metadata(&name).is_err(), "{operation:?} creates nothing");
            }
            None => {
                assert!(opened.is_ok(), "{operation:?}");
                assert_eq!(fs::read(&name).unwrap(), b"", "{operation:?} creates an empty file");
            }
        }
    }
}

#[test]
fn every_open_gives_a_new_nonzero_refnum() {
    let folder = scratch_folder();
    let name = existing_file(&folder);
    let files = FileManager::new();
    let first = files.open(&name, Operation::Open, Access::ReadOnly).unwrap();
    let second = files.open(&name, Operation::Open, Access::ReadOnly).unwrap();
    assert!(first != 0 && second != 0 && first != second);
}

#[test]
fn the_position_starts_at_zero_and_writes_overwrite_from_there() {
    let folder = scratch_folder();
    let name = existing_file(&folder);
    let files = FileManager::new();
    let refnum = files.open(&name, Operation::Open, Access::ReadWrite).unwrap();
    files.write_text(refnum, b"XY", true).unwrap();
    assert_eq!(fs::read(&name).unwrap(), b"XYllo", "measured: 58 59 6c 6c 6f");
    files.write_text(refnum, b"Z", true).unwrap();
    assert_eq!(fs::read(&name).unwrap(), b"XYZlo", "a second write continues");
}

#[test]
fn the_access_mode_refuses_with_error_8() {
    let folder = scratch_folder();
    let name = existing_file(&folder);
    let files = FileManager::new();
    let read_only = files.open(&name, Operation::Open, Access::ReadOnly).unwrap();
    assert_eq!(files.write_text(read_only, b"XY", true), Err(FileError::PERMISSION_DENIED));
    assert_eq!(fs::read(&name).unwrap(), EXISTING_CONTENT);
    let write_only = files.open(&name, Operation::Open, Access::WriteOnly).unwrap();
    let read = files.read_text(write_only, -1, true);
    assert_eq!((read.text.as_slice(), read.error), (&b""[..], Some(FileError::PERMISSION_DENIED)));
    files.write_text(write_only, b"XY", true).unwrap();
    assert_eq!(fs::read(&name).unwrap(), b"XYllo");
}

#[test]
fn convert_eol_writes_every_end_of_line_as_the_systems() {
    let measured: [(&[u8], &[u8]); 8] = [
        (b"a\nb", b"a\r\nb"),
        (b"a\rb", b"a\r\nb"),
        (b"a\r\nb", b"a\r\nb"),
        (b"a\n\rb", b"a\r\nb"),
        (b"a\n\nb", b"a\r\n\r\nb"),
        (b"a\nb\n", b"a\r\nb\r\n"),
        (b"\t", b"\t"),
        (b"", b""),
    ];
    for (text, bytes) in measured {
        assert_eq!(convert_ends_of_line(text, MEASURED_END_OF_LINE), bytes, "{:?}", String::from_utf8_lossy(text));
    }
    let folder = scratch_folder();
    let name = name_in(&folder, "w.txt");
    let files = FileManager::new();
    let refnum = files.open(&name, Operation::ReplaceOrCreate, Access::ReadWrite).unwrap();
    files.write_text(refnum, b"a\rb\n", true).unwrap();
    assert_eq!(fs::read(&name).unwrap(), [b"a", SYSTEM_END_OF_LINE, b"b", SYSTEM_END_OF_LINE].concat());
}

#[test]
fn without_convert_eol_the_text_is_written_as_it_is() {
    let folder = scratch_folder();
    let name = name_in(&folder, "w.txt");
    let files = FileManager::new();
    let refnum = files.open(&name, Operation::ReplaceOrCreate, Access::ReadWrite).unwrap();
    files.write_text(refnum, b"a\rb", false).unwrap();
    files.write_text(refnum, b"a\n\nb", false).unwrap();
    assert_eq!(fs::read(&name).unwrap(), b"a\rba\n\nb", "measured: 61 0d 62 and 61 0a 0a 62");
}

#[test]
fn read_text_gives_labviews_text_position_and_error() {
    let measured: [(i64, &[u8], i64, Option<FileError>); 7] = [
        (-1, b"ab\ncd\n", 8, None),
        (0, b"", 0, None),
        (3, b"ab\n", 3, None),
        (4, b"ab\n", 4, None),
        (8, b"ab\ncd\n", 8, None),
        (9, b"ab\ncd\n", 8, Some(FileError::END_OF_FILE)),
        (100, b"ab\ncd\n", 8, Some(FileError::END_OF_FILE)),
    ];
    for (count, text, position, error) in measured {
        let folder = scratch_folder();
        let name = file_with(&folder, b"ab\r\ncd\r\n");
        let files = FileManager::new();
        let refnum = files.open(&name, Operation::Open, Access::ReadWrite).unwrap();
        let read = files.read_text(refnum, count, true);
        assert_eq!((read.text.as_slice(), read.error), (text, error), "count {count}");
        // What a following read gets shows where the position was left.
        let rest = files.read_text(refnum, -1, false).text;
        assert_eq!(8 - rest.len() as i64, position, "count {count}");
    }
}

#[test]
fn read_text_turns_every_end_of_line_into_one_lf() {
    let folder = scratch_folder();
    let name = file_with(&folder, b"a\rb\nc\n\rd\r\ne");
    let files = FileManager::new();
    let refnum = files.open(&name, Operation::Open, Access::ReadOnly).unwrap();
    assert_eq!(files.read_text(refnum, -1, true).text, b"a\nb\nc\nd\ne");
}

#[test]
fn read_lines_gives_labviews_lines_position_and_error() {
    let measured: [(&[u8], i64, &[&[u8]], i64, Option<FileError>); 17] = [
        (b"ab\r\ncd\r\n", 1, &[b"ab"], 4, None),
        (b"ab\r\ncd\r\n", 2, &[b"ab", b"cd"], 8, None),
        (b"ab\r\ncd\r\n", 3, &[b"ab", b"cd"], 8, Some(FileError::END_OF_FILE)),
        (b"ab\r\ncd\r\n", -1, &[b"ab", b"cd"], 8, None),
        (b"ab\r\ncd\r\n", 0, &[], 0, None),
        (b"ab\ncd", 1, &[b"ab"], 3, None),
        (b"ab\ncd", 2, &[b"ab", b"cd"], 5, Some(FileError::END_OF_FILE)),
        (b"ab\ncd", -1, &[b"ab", b"cd"], 5, None),
        (b"ab\n\ncd\n", 3, &[b"ab", b"", b"cd"], 7, None),
        (b"ab\n\ncd\n", -1, &[b"ab", b"", b"cd"], 7, None),
        (b"ab\rcd\r", 2, &[b"ab", b"cd"], 6, None),
        (b"", 1, &[], 0, Some(FileError::END_OF_FILE)),
        (b"", 3, &[], 0, Some(FileError::END_OF_FILE)),
        (b"", -1, &[], 0, None),
        (b"a\n\rb", -1, &[b"a", b"", b"b"], 4, None),
        (b"a\n\rb", 2, &[b"a", b""], 3, None),
        (b"a\n\rb", 3, &[b"a", b"", b"b"], 4, Some(FileError::END_OF_FILE)),
    ];
    for (content, count, lines, position, error) in measured {
        let folder = scratch_folder();
        let name = file_with(&folder, content);
        let files = FileManager::new();
        let refnum = files.open(&name, Operation::Open, Access::ReadOnly).unwrap();
        let read = files.read_lines(refnum, count);
        let label = format!("{:?} count {count}", String::from_utf8_lossy(content));
        assert_eq!(read.lines, lines.iter().map(|line| line.to_vec()).collect::<Vec<_>>(), "{label}");
        assert_eq!(read.error, error, "{label}");
        let rest = files.read_text(refnum, -1, false).text;
        assert_eq!((content.len() - rest.len()) as i64, position, "{label}");
    }
}

#[test]
fn close_gives_the_name_and_a_second_close_is_error_1() {
    let folder = scratch_folder();
    let name = existing_file(&folder);
    let files = FileManager::new();
    let refnum = files.open(&name, Operation::Open, Access::ReadWrite).unwrap();
    assert_eq!(files.close(refnum), Ok(name));
    assert_eq!(files.close(refnum), Err(FileError::INVALID_INPUT));
    assert_eq!(files.close(0), Err(FileError::INVALID_INPUT), "Not A Refnum");
    assert_eq!(files.write_text(refnum, b"x", true), Err(FileError::INVALID_INPUT));
}

#[test]
fn get_file_size_of_an_open_file_keeps_the_position() {
    let folder = scratch_folder();
    let name = file_with(&folder, b"ab\r\ncd\r\n");
    let files = FileManager::new();
    let refnum = files.open(&name, Operation::Open, Access::ReadWrite).unwrap();
    files.read_text(refnum, 3, false);
    assert_eq!(files.size(refnum), Ok(8));
    assert_eq!(files.read_text(refnum, -1, false).text, b"\ncd\r\n");
}

#[test]
fn delete_does_what_labview_does() {
    let folder = scratch_folder();
    let files = FileManager::new();
    let name = existing_file(&folder);
    assert_eq!(files.delete(&name, false), Ok(()));
    assert!(fs::metadata(&name).is_err());
    assert_eq!(files.delete(&name, false), Err(FileError::NOT_FOUND), "missing file");
    assert_eq!(files.delete(&name_in(&folder, "no/such.txt"), false), Err(FileError::NOT_FOUND), "missing folder in the path");

    let empty = name_in(&folder, "empty");
    fs::create_dir(&empty).unwrap();
    assert_eq!(files.delete(&empty, false), Ok(()), "an empty folder");

    let full = name_in(&folder, "full");
    fs::create_dir_all(format!("{full}/inner")).unwrap();
    fs::write(format!("{full}/a.txt"), b"a").unwrap();
    assert_eq!(files.delete(&full, false), Err(FileError::GENERIC), "a folder that is not empty");
    assert!(fs::metadata(&full).is_ok());
    assert_eq!(files.delete(&full, true), Ok(()), "with entire hierarchy");
    assert!(fs::metadata(&full).is_err());
}

#[test]
fn an_open_file_is_not_deleted_and_a_folder_is_not_opened() {
    let folder = scratch_folder();
    let files = FileManager::new();
    let name = existing_file(&folder);
    let refnum = files.open(&name, Operation::Open, Access::ReadWrite).unwrap();
    assert_eq!(files.delete(&name, false), Err(FileError::ALREADY_OPEN));
    assert_eq!(files.close(refnum), Ok(name.clone()));
    assert_eq!(files.delete(&name, false), Ok(()), "once closed");
    assert_eq!(files.open(&folder.to_string_lossy(), Operation::Open, Access::ReadWrite), Err(FileError::IS_A_FOLDER));
}

#[test]
fn an_array_of_strings_ends_every_element_with_the_systems_end_of_line() {
    let folder = scratch_folder();
    let files = FileManager::new();
    for convert in [true, false] {
        let name = name_in(&folder, "lines.txt");
        let refnum = files.open(&name, Operation::ReplaceOrCreate, Access::ReadWrite).unwrap();
        files.write_lines(refnum, &[b"a\rb".to_vec(), b"y".to_vec()], convert).unwrap();
        files.close(refnum).unwrap();
        let inner: &[u8] = if convert { SYSTEM_END_OF_LINE } else { b"\r" };
        assert_eq!(fs::read(&name).unwrap(), [b"a", inner, b"b", SYSTEM_END_OF_LINE, b"y", SYSTEM_END_OF_LINE].concat(), "convert {convert}");
    }
}

#[test]
fn read_lines_with_count_unwired_gives_the_next_line_with_its_end() {
    let measured: [(&[u8], &[u8]); 2] = [(b"ab\r\ncd\r\n", b"ab\n"), (b"a\n\rb", b"a\n")];
    for (content, line) in measured {
        let folder = scratch_folder();
        let name = file_with(&folder, content);
        let files = FileManager::new();
        let refnum = files.open(&name, Operation::Open, Access::ReadOnly).unwrap();
        assert_eq!(files.read_line(refnum, true), solder_io::TextRead { text: line.to_vec(), error: None });
    }
}
