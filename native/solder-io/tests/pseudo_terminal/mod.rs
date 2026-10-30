//! A test instrument on a pseudo-terminal: Solder opens its device as a serial port, and a thread on the
//! other side answers line commands as the responder on the virtual machine's COM1 did when LabVIEW was
//! measured (`labview-captures/reports/2026-10-30-visa-serial-com1.md`). Shared by the Rust tests and by
//! the `serial-test-instrument` program that the Node tests start.

use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::{FromRawFd, OwnedFd};

pub const IDENTITY: &[u8] = b"SOLDER,SERIAL-RESPONDER,0,1\n";

/// The answer to each command, a line ended by LF (a CR before it is ignored).
fn answer(command: &[u8]) -> Option<&'static [u8]> {
    Some(match command {
        b"*IDN?" => IDENTITY,
        // Two answers in one: the termination character in the middle.
        b"MID?" => b"AB\nCD\n",
        b"NOTERM?" => b"XYZ",
        b"CRLF?" => b"line\r\n",
        // 31 bytes: 30 digits and a line feed.
        b"LONG?" => b"012345678901234567890123456789\n",
        _ => return None,
    })
}

pub struct Instrument {
    /// `ASRL<device>::INSTR`.
    pub resource: String,
}

/// Opens a pseudo-terminal and answers on it until the process ends.
pub fn start_instrument() -> Instrument {
    let (controller, device, path) = open_pseudo_terminal();
    std::thread::spawn(move || {
        // The device end stays open, so the controller's reads wait instead of failing between sessions.
        let _device = device;
        serve(File::from(controller));
    });
    Instrument { resource: format!("ASRL{path}::INSTR") }
}

fn open_pseudo_terminal() -> (OwnedFd, OwnedFd, String) {
    let (mut controller, mut device) = (0, 0);
    // SAFETY: openpty writes the two descriptors; no name, termios or window size is passed.
    let opened = unsafe { libc::openpty(&mut controller, &mut device, std::ptr::null_mut(), std::ptr::null(), std::ptr::null()) };
    assert_eq!(opened, 0, "openpty failed");
    let mut name = [0 as libc::c_char; 128];
    // SAFETY: `name` is writable for its length; `controller` is open.
    assert_eq!(unsafe { libc::ptsname_r(controller, name.as_mut_ptr(), name.len()) }, 0, "ptsname_r failed");
    // SAFETY: ptsname_r wrote a NUL-terminated string.
    let path = unsafe { std::ffi::CStr::from_ptr(name.as_ptr()) }.to_string_lossy().into_owned();
    // SAFETY: openpty has just handed us both descriptors.
    unsafe { (OwnedFd::from_raw_fd(controller), OwnedFd::from_raw_fd(device), path) }
}

fn serve(mut controller: File) {
    let mut line = Vec::new();
    let mut chunk = [0u8; 256];
    loop {
        let Ok(length) = controller.read(&mut chunk) else { return };
        if length == 0 {
            return;
        }
        for &byte in &chunk[..length] {
            if byte != b'\n' {
                line.push(byte);
                continue;
            }
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            if let Some(answer) = answer(&line) {
                let _ = controller.write_all(answer);
            }
            line.clear();
        }
    }
}
