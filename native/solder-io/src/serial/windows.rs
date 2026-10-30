//! A serial device on Windows, through the Win32 communications API: `COM<n>` opened as `\\.\COM<n>`, its
//! line in a DCB, and each wait in the port's timeouts, so a Read returns as soon as a byte arrives.

use std::time::Duration;

use windows_sys::Win32::Devices::Communication::{
    COMMTIMEOUTS, COMSTAT, ClearCommError, DCB, EVENPARITY, GetCommState, MARKPARITY, NOPARITY, ODDPARITY, ONE5STOPBITS,
    ONESTOPBIT, SPACEPARITY, SetCommState, SetCommTimeouts, TWOSTOPBITS,
};
use windows_sys::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{CreateFileW, OPEN_EXISTING, ReadFile, WriteFile};

use super::{LineSettings, Parity, StopBits};
use crate::status::Status;

pub(crate) struct Device {
    handle: HANDLE,
}

// SAFETY: the handle is used by one thread at a time (the port's lock), and Win32 handles may move between threads.
unsafe impl Send for Device {}

/// The DCB's flags, packed in one word as `winbase.h` lays them out.
mod flags {
    pub const BINARY: u32 = 1 << 0;
    pub const PARITY: u32 = 1 << 1;
    pub const OUT_CTS_FLOW: u32 = 1 << 2;
    pub const OUT_DSR_FLOW: u32 = 1 << 3;
    pub const DTR_CONTROL_SHIFT: u32 = 4;
    pub const DTR_CONTROL_MASK: u32 = 0b11 << DTR_CONTROL_SHIFT;
    pub const DSR_SENSITIVITY: u32 = 1 << 6;
    pub const OUT_X: u32 = 1 << 8;
    pub const IN_X: u32 = 1 << 9;
    pub const NULL: u32 = 1 << 11;
    pub const RTS_CONTROL_SHIFT: u32 = 12;
    pub const RTS_CONTROL_MASK: u32 = 0b11 << RTS_CONTROL_SHIFT;
    pub const ABORT_ON_ERROR: u32 = 1 << 14;
    /// DTR_CONTROL_ENABLE, RTS_CONTROL_ENABLE: the line held on.
    pub const LINE_ON: u32 = 1;
    /// DTR_CONTROL_HANDSHAKE, RTS_CONTROL_HANDSHAKE: the line used for flow control.
    pub const LINE_HANDSHAKE: u32 = 2;
}

/// Win32's MAXDWORD, which has meanings of its own in COMMTIMEOUTS.
const MAXDWORD: u32 = u32::MAX;

impl Device {
    /// Opens `COM<n>` or any device path the port table names.
    pub(crate) fn open(path: &str) -> Result<Device, Status> {
        let name: Vec<u16> = device_name(path).encode_utf16().chain(Some(0)).collect();
        // SAFETY: `name` is a NUL-terminated UTF-16 string that lives through the call.
        let handle = unsafe {
            CreateFileW(name.as_ptr(), GENERIC_READ | GENERIC_WRITE, 0, std::ptr::null(), OPEN_EXISTING, 0, std::ptr::null_mut())
        };
        if handle == INVALID_HANDLE_VALUE {
            return Err(Status::ERROR_RESOURCE_NOT_FOUND);
        }
        Ok(Device { handle })
    }

    pub(crate) fn apply(&mut self, settings: &LineSettings) -> Result<(), Status> {
        // SAFETY: DCB is plain data; GetCommState fills it.
        let mut control: DCB = unsafe { std::mem::zeroed() };
        control.DCBlength = std::mem::size_of::<DCB>() as u32;
        // SAFETY: the handle is open and `control` is writable.
        if unsafe { GetCommState(self.handle, &mut control) } == 0 {
            return Err(Status::ERROR_IO);
        }
        control.BaudRate = settings.baud_rate;
        control.ByteSize = settings.data_bits as u8;
        control.Parity = match settings.parity {
            Parity::None => NOPARITY,
            Parity::Odd => ODDPARITY,
            Parity::Even => EVENPARITY,
            Parity::Mark => MARKPARITY,
            Parity::Space => SPACEPARITY,
        };
        control.StopBits = match settings.stop_bits {
            StopBits::One => ONESTOPBIT,
            StopBits::OneAndHalf => ONE5STOPBITS,
            StopBits::Two => TWOSTOPBITS,
        };
        let flow = settings.flow_control;
        let mut word = control._bitfield;
        word &= !(flags::PARITY | flags::OUT_CTS_FLOW | flags::OUT_DSR_FLOW | flags::DTR_CONTROL_MASK | flags::DSR_SENSITIVITY);
        word &= !(flags::OUT_X | flags::IN_X | flags::NULL | flags::RTS_CONTROL_MASK | flags::ABORT_ON_ERROR);
        word |= flags::BINARY;
        if settings.parity != Parity::None {
            word |= flags::PARITY;
        }
        if flow.xon_xoff {
            word |= flags::OUT_X | flags::IN_X;
        }
        let rts = if flow.rts_cts { flags::LINE_HANDSHAKE } else { flags::LINE_ON };
        let dtr = if flow.dtr_dsr { flags::LINE_HANDSHAKE } else { flags::LINE_ON };
        word |= rts << flags::RTS_CONTROL_SHIFT | dtr << flags::DTR_CONTROL_SHIFT;
        if flow.rts_cts {
            word |= flags::OUT_CTS_FLOW;
        }
        if flow.dtr_dsr {
            word |= flags::OUT_DSR_FLOW;
        }
        control._bitfield = word;
        // SAFETY: the handle is open and `control` is a complete DCB.
        if unsafe { SetCommState(self.handle, &control) } == 0 {
            return Err(Status::ERROR_ATTRIBUTE_STATE_NOT_SUPPORTED);
        }
        Ok(())
    }

    /// Waits up to `patience` for bytes: ReadFile returns as soon as one arrives (the "MAXDWORD,
    /// MAXDWORD, constant" timeouts of the documentation), or with none when the constant runs out.
    pub(crate) fn receive(&mut self, buffer: &mut [u8], patience: Duration) -> Result<usize, Status> {
        let timeouts = if patience.is_zero() {
            // Return at once with what is in the queue.
            COMMTIMEOUTS { ReadIntervalTimeout: MAXDWORD, ReadTotalTimeoutMultiplier: 0, ReadTotalTimeoutConstant: 0, WriteTotalTimeoutMultiplier: 0, WriteTotalTimeoutConstant: 0 }
        } else {
            COMMTIMEOUTS {
                ReadIntervalTimeout: MAXDWORD,
                ReadTotalTimeoutMultiplier: MAXDWORD,
                ReadTotalTimeoutConstant: milliseconds(patience),
                WriteTotalTimeoutMultiplier: 0,
                WriteTotalTimeoutConstant: 0,
            }
        };
        self.set_timeouts(&timeouts)?;
        let mut length = 0u32;
        let asked = buffer.len().min(MAXDWORD as usize) as u32;
        // SAFETY: `buffer` is writable for `asked` bytes; the call is synchronous.
        if unsafe { ReadFile(self.handle, buffer.as_mut_ptr(), asked, &mut length, std::ptr::null_mut()) } == 0 {
            return Err(Status::ERROR_IO);
        }
        Ok(length as usize)
    }

    pub(crate) fn send(&mut self, data: &[u8], patience: Duration) -> Result<usize, Status> {
        let timeouts = COMMTIMEOUTS {
            ReadIntervalTimeout: 0,
            ReadTotalTimeoutMultiplier: 0,
            ReadTotalTimeoutConstant: 0,
            WriteTotalTimeoutMultiplier: 0,
            WriteTotalTimeoutConstant: milliseconds(patience).max(1),
        };
        self.set_timeouts(&timeouts)?;
        let mut written = 0u32;
        let offered = data.len().min(MAXDWORD as usize) as u32;
        // SAFETY: `data` is readable for `offered` bytes; the call is synchronous.
        if unsafe { WriteFile(self.handle, data.as_ptr(), offered, &mut written, std::ptr::null_mut()) } == 0 {
            return Err(Status::ERROR_IO);
        }
        Ok(written as usize)
    }

    pub(crate) fn bytes_waiting(&mut self) -> Result<usize, Status> {
        let mut errors = 0;
        // SAFETY: COMSTAT is plain data that ClearCommError fills.
        let mut state: COMSTAT = unsafe { std::mem::zeroed() };
        // SAFETY: the handle is open; both outputs are writable.
        if unsafe { ClearCommError(self.handle, &mut errors, &mut state) } == 0 {
            return Err(Status::ERROR_IO);
        }
        Ok(state.cbInQue as usize)
    }

    fn set_timeouts(&self, timeouts: &COMMTIMEOUTS) -> Result<(), Status> {
        // SAFETY: the handle is open and `timeouts` is complete.
        if unsafe { SetCommTimeouts(self.handle, timeouts) } == 0 { Err(Status::ERROR_IO) } else { Ok(()) }
    }
}

impl Drop for Device {
    fn drop(&mut self) {
        // SAFETY: the handle is open and owned by this device alone.
        unsafe { CloseHandle(self.handle) };
    }
}

/// `COM10` and above open only as `\\.\COM10`; the prefix does no harm to the others.
fn device_name(path: &str) -> String {
    if path.starts_with(r"\\") { path.to_string() } else { format!(r"\\.\{path}") }
}

fn milliseconds(patience: Duration) -> u32 {
    // MAXDWORD as a total timeout would mean "return at once" with the interval at MAXDWORD: keep below it.
    patience.as_millis().min(u128::from(MAXDWORD - 1)) as u32
}
