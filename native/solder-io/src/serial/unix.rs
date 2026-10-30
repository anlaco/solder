//! A serial device on Linux and macOS, through termios: raw bytes, no echo, no line discipline, and
//! `poll` for the waits, so a Read gets each byte as soon as it arrives.

use std::ffi::CString;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::time::Duration;

use super::{LineSettings, Parity, StopBits};
use crate::status::Status;

pub(crate) struct Device {
    descriptor: OwnedFd,
}

impl Device {
    /// Opens the device at `path` without making it the controlling terminal. Anything that keeps it from
    /// opening means the resource is not there.
    pub(crate) fn open(path: &str) -> Result<Device, Status> {
        let path = CString::new(path).map_err(|_| Status::ERROR_RESOURCE_NOT_FOUND)?;
        let flags = libc::O_RDWR | libc::O_NOCTTY | libc::O_NONBLOCK | libc::O_CLOEXEC;
        // SAFETY: `path` is a valid C string that lives through the call.
        let descriptor = unsafe { libc::open(path.as_ptr(), flags) };
        if descriptor < 0 {
            return Err(Status::ERROR_RESOURCE_NOT_FOUND);
        }
        // SAFETY: `open` has just handed us this descriptor, and nothing else owns it.
        let device = Device { descriptor: unsafe { OwnedFd::from_raw_fd(descriptor) } };
        // A descriptor that is not a terminal (a plain file, a socket) is no serial port.
        // SAFETY: the descriptor is open.
        if unsafe { libc::isatty(device.fd()) } != 1 {
            return Err(Status::ERROR_RESOURCE_NOT_FOUND);
        }
        Ok(device)
    }

    fn fd(&self) -> libc::c_int {
        self.descriptor.as_raw_fd()
    }

    /// Sets the line: raw mode, the receiver on, modem lines ignored, and `settings`.
    pub(crate) fn apply(&mut self, settings: &LineSettings) -> Result<(), Status> {
        let mut terminal = self.attributes()?;
        // SAFETY: `terminal` is a termios that tcgetattr filled.
        unsafe { libc::cfmakeraw(&mut terminal) };
        terminal.c_cflag |= libc::CREAD | libc::CLOCAL;
        terminal.c_cflag &= !(libc::CSIZE | libc::PARENB | libc::PARODD | libc::CSTOPB | libc::CRTSCTS);
        terminal.c_cflag |= character_size(settings.data_bits);
        apply_parity(&mut terminal, settings.parity)?;
        // POSIX has no one and a half stop bits: two is what a UART sends for them with more than 5 data bits.
        if settings.stop_bits != StopBits::One {
            terminal.c_cflag |= libc::CSTOPB;
        }
        terminal.c_iflag &= !(libc::IXON | libc::IXOFF | libc::IXANY);
        if settings.flow_control.xon_xoff {
            terminal.c_iflag |= libc::IXON | libc::IXOFF;
        }
        if settings.flow_control.rts_cts {
            terminal.c_cflag |= libc::CRTSCTS;
        }
        // DTR/DSR flow control has no termios flag: it is taken, as NI-VISA takes it, and does nothing here.
        // Reads never block in the driver: `poll` does the waiting.
        terminal.c_cc[libc::VMIN] = 0;
        terminal.c_cc[libc::VTIME] = 0;
        let standard_speed = standard_speed(settings.baud_rate);
        if let Some(speed) = standard_speed {
            // SAFETY: as above.
            unsafe { libc::cfsetspeed(&mut terminal, speed) };
        }
        // SAFETY: the descriptor is open and `terminal` is a complete termios.
        if unsafe { libc::tcsetattr(self.fd(), libc::TCSANOW, &terminal) } != 0 {
            return Err(Status::ERROR_ATTRIBUTE_STATE_NOT_SUPPORTED);
        }
        if standard_speed.is_none() {
            set_any_speed(self.fd(), settings.baud_rate)?;
        }
        Ok(())
    }

    fn attributes(&self) -> Result<libc::termios, Status> {
        // SAFETY: termios is plain data; tcgetattr fills all of it.
        let mut terminal: libc::termios = unsafe { std::mem::zeroed() };
        // SAFETY: the descriptor is open and `terminal` is writable.
        if unsafe { libc::tcgetattr(self.fd(), &mut terminal) } != 0 {
            return Err(Status::ERROR_IO);
        }
        Ok(terminal)
    }

    /// Waits up to `patience` for bytes and puts them in `buffer`: how many, 0 if none came.
    pub(crate) fn receive(&mut self, buffer: &mut [u8], patience: Duration) -> Result<usize, Status> {
        if !self.wait_for(libc::POLLIN, patience)? {
            return Ok(0);
        }
        // SAFETY: `buffer` is writable for its whole length.
        let length = unsafe { libc::read(self.fd(), buffer.as_mut_ptr().cast(), buffer.len()) };
        match length {
            length if length > 0 => Ok(length as usize),
            0 => Ok(0),
            _ => would_block_or(Status::ERROR_IO),
        }
    }

    /// Sends what the driver takes within `patience`: how many bytes, 0 if it took none.
    pub(crate) fn send(&mut self, data: &[u8], patience: Duration) -> Result<usize, Status> {
        if !self.wait_for(libc::POLLOUT, patience)? {
            return Ok(0);
        }
        // SAFETY: `data` is readable for its whole length.
        let written = unsafe { libc::write(self.fd(), data.as_ptr().cast(), data.len()) };
        if written >= 0 { Ok(written as usize) } else { would_block_or(Status::ERROR_IO) }
    }

    /// Serial Settings ▸ Number of Bytes at Serial Port: what the driver holds unread.
    pub(crate) fn bytes_waiting(&mut self) -> Result<usize, Status> {
        let mut waiting: libc::c_int = 0;
        // SAFETY: FIONREAD writes one int.
        if unsafe { libc::ioctl(self.fd(), libc::FIONREAD as _, &mut waiting) } != 0 {
            return Err(Status::ERROR_IO);
        }
        Ok(waiting.max(0) as usize)
    }

    /// Whether the device is ready for `event` within `patience`. A device that hung up (a USB adapter
    /// pulled out) is an I/O error, as no more bytes can come.
    fn wait_for(&self, event: libc::c_short, patience: Duration) -> Result<bool, Status> {
        let mut request = libc::pollfd { fd: self.fd(), events: event, revents: 0 };
        let milliseconds = patience.as_millis().min(libc::c_int::MAX as u128) as libc::c_int;
        // SAFETY: one pollfd, valid for the call.
        let ready = unsafe { libc::poll(&mut request, 1, milliseconds) };
        if ready < 0 {
            return if std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted { Ok(false) } else { Err(Status::ERROR_IO) };
        }
        if request.revents & (libc::POLLHUP | libc::POLLERR | libc::POLLNVAL) != 0 && request.revents & event == 0 {
            return Err(Status::ERROR_IO);
        }
        Ok(ready > 0)
    }
}

fn would_block_or(status: Status) -> Result<usize, Status> {
    match std::io::Error::last_os_error().kind() {
        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted => Ok(0),
        _ => Err(status),
    }
}

fn character_size(data_bits: u16) -> libc::tcflag_t {
    match data_bits {
        5 => libc::CS5,
        6 => libc::CS6,
        7 => libc::CS7,
        _ => libc::CS8,
    }
}

fn apply_parity(terminal: &mut libc::termios, parity: Parity) -> Result<(), Status> {
    match parity {
        Parity::None => {}
        Parity::Odd => terminal.c_cflag |= libc::PARENB | libc::PARODD,
        Parity::Even => terminal.c_cflag |= libc::PARENB,
        Parity::Mark | Parity::Space => sticky_parity(terminal, parity)?,
    }
    Ok(())
}

/// Mark and space parity: a parity bit that is always 1 or always 0, which Linux calls CMSPAR.
#[cfg(target_os = "linux")]
fn sticky_parity(terminal: &mut libc::termios, parity: Parity) -> Result<(), Status> {
    terminal.c_cflag |= libc::PARENB | libc::CMSPAR;
    if parity == Parity::Mark {
        terminal.c_cflag |= libc::PARODD;
    }
    Ok(())
}

/// macOS's termios has no mark or space parity.
#[cfg(not(target_os = "linux"))]
fn sticky_parity(_terminal: &mut libc::termios, _parity: Parity) -> Result<(), Status> {
    Err(Status::ERROR_ATTRIBUTE_STATE_NOT_SUPPORTED)
}

/// The termios constant of a baud rate that has one.
fn standard_speed(baud_rate: u32) -> Option<libc::speed_t> {
    Some(match baud_rate {
        50 => libc::B50,
        75 => libc::B75,
        110 => libc::B110,
        134 => libc::B134,
        150 => libc::B150,
        200 => libc::B200,
        300 => libc::B300,
        600 => libc::B600,
        1200 => libc::B1200,
        1800 => libc::B1800,
        2400 => libc::B2400,
        4800 => libc::B4800,
        9600 => libc::B9600,
        19200 => libc::B19200,
        38400 => libc::B38400,
        57600 => libc::B57600,
        115200 => libc::B115200,
        230400 => libc::B230400,
        _ => return None,
    })
}

/// Any other baud rate (NI-VISA takes any but 0, measured): Linux's termios2 with BOTHER.
#[cfg(target_os = "linux")]
fn set_any_speed(descriptor: libc::c_int, baud_rate: u32) -> Result<(), Status> {
    // SAFETY: termios2 is plain data; TCGETS2 fills all of it.
    let mut terminal: libc::termios2 = unsafe { std::mem::zeroed() };
    // SAFETY: the descriptor is open; TCGETS2 and TCSETS2 read and write one termios2.
    unsafe {
        if libc::ioctl(descriptor, libc::TCGETS2 as _, &mut terminal) != 0 {
            return Err(Status::ERROR_IO);
        }
        terminal.c_cflag &= !libc::CBAUD;
        terminal.c_cflag |= libc::BOTHER;
        terminal.c_ispeed = baud_rate;
        terminal.c_ospeed = baud_rate;
        if libc::ioctl(descriptor, libc::TCSETS2 as _, &terminal) != 0 {
            return Err(Status::ERROR_ATTRIBUTE_STATE_NOT_SUPPORTED);
        }
    }
    Ok(())
}

/// Any other baud rate on macOS: IOKit's IOSSIOSPEED request.
#[cfg(target_os = "macos")]
fn set_any_speed(descriptor: libc::c_int, baud_rate: u32) -> Result<(), Status> {
    /// `_IOW('T', 2, speed_t)` of `<IOKit/serial/ioss.h>`.
    const IOSSIOSPEED: libc::c_ulong = 0x8008_5402;
    let speed = libc::speed_t::from(baud_rate);
    // SAFETY: IOSSIOSPEED reads one speed_t.
    if unsafe { libc::ioctl(descriptor, IOSSIOSPEED, &speed) } != 0 {
        return Err(Status::ERROR_ATTRIBUTE_STATE_NOT_SUPPORTED);
    }
    Ok(())
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn set_any_speed(_descriptor: libc::c_int, _baud_rate: u32) -> Result<(), Status> {
    Err(Status::ERROR_ATTRIBUTE_STATE_NOT_SUPPORTED)
}
