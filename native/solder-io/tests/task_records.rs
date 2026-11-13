//! What a DAQ task wire passes through a Call Library Function Node (DT-087, amendment of 2026-11-13 §7): its task object
//! for a pointer-sized integer, 0 for an empty task or an address that is not a record (measured in LabVIEW,
//! `labview-captures/reports/2026-11-13-daq-taskid.md` Q6), and, after a call through a cell, the task the cell holds.

use solder_io::task_records::node::{task_answer, task_object_for};
use solder_io::task_records::{dispose_record, new_record};

const TASK_OBJECT: usize = 0x5000;

fn answer_parts(answer: &[u8]) -> (usize, u32, String) {
    let record = u64::from_le_bytes(answer[..8].try_into().unwrap()) as usize;
    let number = u32::from_le_bytes(answer[8..12].try_into().unwrap());
    (record, number, String::from_utf8(answer[12..].to_vec()).unwrap())
}

#[test]
fn a_record_gives_its_task_object_and_an_empty_task_or_a_stranger_gives_0() {
    let record = new_record("p1", TASK_OBJECT);
    assert_eq!(task_object_for(record), TASK_OBJECT);
    assert_eq!(task_object_for(0), 0);
    assert_eq!(task_object_for(record + 8), 0);
    dispose_record(record);
    assert_eq!(task_object_for(record), 0);
}

#[test]
fn a_cell_is_answered_with_the_record_it_holds_and_that_records_number_and_name() {
    let record = new_record("p1", TASK_OBJECT);
    let (answered, number, name) = answer_parts(&task_answer(&record.to_le_bytes()));
    assert_eq!((answered, name.as_str()), (record, "p1"));
    assert_ne!(number, 0);
    dispose_record(record);
}

#[test]
fn an_empty_cell_is_an_empty_task() {
    assert_eq!(answer_parts(&task_answer(&0usize.to_le_bytes())), (0, 0, String::new()));
}
