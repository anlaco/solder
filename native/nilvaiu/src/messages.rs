//! The text a function leaves in its `extendedErrorInfo`: what DAQmx's VIs add to the description of the error code.
//! Measured (`labview-captures/reports/2026-11-13-daq-create-task.md`): it begins `<append>` and a line, then the
//! task's name as `<B>Task Name: </B>p1`; an error about no task is `<append>` and the line alone; no error leaves it
//! empty. The other fields' labels are Solder's, written anew (DT-076 §6); DAQmx's own were not measured.

use solder_daq::error::{DaqError, ErrorDetails, codes};

const APPEND: &str = "<append>\n";

/// The text for an error, as `extendedErrorInfo` takes it.
pub fn extended_error_info(error: &DaqError) -> String {
    let mut text = String::from(APPEND);
    let details = &error.details;
    let mut field = |label: &str, value: &str| text.push_str(&format!("<B>{label}: </B>{value}\n"));
    if let Some(property) = details.property {
        field("Property", property);
    }
    if let Some(device) = &details.device {
        field("Device", device);
    }
    if !details.suggested_devices.is_empty() {
        field("Devices present", &details.suggested_devices.join(", "));
    }
    if let Some(channel) = &details.channel {
        field("Physical Channel", channel);
    }
    if let Some(requested) = details.requested_name {
        field("Requested Value", requested);
    }
    if let Some(possible) = details.possible_names {
        field("Possible Values", possible);
    }
    push_numbers(details, &mut field);
    if let Some((in_task, in_data)) = details.channel_counts {
        field("Number of Channels in Task", &in_task.to_string());
        field("Number of Channels in Data", &in_data.to_string());
    }
    if let Some((in_channel, in_data)) = details.line_counts {
        field("Number of Lines in Channel", &in_channel.to_string());
        field("Number of Lines in Data", &in_data.to_string());
    }
    if let Some(task_name) = &details.task_name {
        field("Task Name", task_name);
    }
    trim_last_line_end(text)
}

fn push_numbers(details: &ErrorDetails, field: &mut impl FnMut(&str, &str)) {
    let numbers = [("Requested Value", details.requested), ("Maximum Value", details.maximum), ("Minimum Value", details.minimum)];
    for (label, value) in numbers {
        if let Some(value) = value {
            field(label, &value.to_string());
        }
    }
}

/// The measured text ends with the task's name, with no line end after it; `<append>` alone keeps its own.
fn trim_last_line_end(mut text: String) -> String {
    if text.len() > APPEND.len() && text.ends_with('\n') {
        text.pop();
    }
    text
}

/// The error of a function the library does not do yet, saying which.
pub fn not_built(function: &str) -> (DaqError, String) {
    let error = DaqError::bare(codes::NOT_BUILT_IN_SOLDER);
    let text = format!("{APPEND}Solder's DAQ driver does not do {function} yet.");
    (error, text)
}
