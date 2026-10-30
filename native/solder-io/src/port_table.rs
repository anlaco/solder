//! The serial port table (DT-070 §2): which device each `ASRL<n>::INSTR` is, and the user's aliases, as
//! NI-VISA keeps them in `visaconf.ini` (measured: `Alias1="'COM1','ASRL1::INSTR'"`). On Windows `ASRL<n>`
//! is `COM<n>` and `COM<n>` is an alias of it. On Linux and macOS a port gets its number the first time it is
//! seen and keeps it, written in a file of lines `name = value`:
//!
//! ```text
//! ASRL5::INSTR = /dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART-if00-port0
//! ESP32 = ASRL5::INSTR
//! ```

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use crate::resource::ResourceAddress;
use crate::status::Status;

/// Where the table lives unless `SOLDER_VISA_PORTS` names another file.
const TABLE_FILE_NAME: &str = "visa-ports.conf";
const TABLE_VARIABLE: &str = "SOLDER_VISA_PORTS";
const HEADER: &str = "# Solder's serial ports and VISA aliases (DT-070). Lines: ASRL<n>::INSTR = <device>, or <alias> = <resource>.";

/// On Linux ASRL1–ASRL4 are the four first UARTs, as on a PC (the convention NI-VISA for Linux is said to
/// follow: unverified).
#[cfg(target_os = "linux")]
const BUILT_IN_PORTS: &[(u32, &str)] = &[(1, "/dev/ttyS0"), (2, "/dev/ttyS1"), (3, "/dev/ttyS2"), (4, "/dev/ttyS3")];
#[cfg(not(target_os = "linux"))]
const BUILT_IN_PORTS: &[(u32, &str)] = &[];

/// A resource string with the name VISA Open gives back for it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Resolved {
    pub address: ResourceAddress,
    /// An alias stays as it was typed (measured: `COM1` comes out as `COM1`); a resource gets its keywords
    /// in capitals (`asrl1::instr` comes out as `ASRL1::INSTR`).
    pub name_out: String,
}

#[derive(Debug, Default)]
pub struct PortTable {
    file: Option<PathBuf>,
    devices: BTreeMap<u32, String>,
    /// By name in capitals: an alias is found without regard to case, as a resource is.
    aliases: BTreeMap<String, String>,
}

impl PortTable {
    /// The user's table: the file `SOLDER_VISA_PORTS` names, or `visa-ports.conf` in Solder's settings folder.
    pub fn from_default_location() -> PortTable {
        let file = std::env::var_os(TABLE_VARIABLE).map(PathBuf::from).or_else(|| settings_folder().map(|folder| folder.join(TABLE_FILE_NAME)));
        file.map(PortTable::from_file).unwrap_or_default()
    }

    /// The table kept in `file`, which need not exist yet; a line that cannot be read is skipped.
    pub fn from_file(file: impl Into<PathBuf>) -> PortTable {
        let file = file.into();
        let mut table = PortTable { file: Some(file.clone()), ..PortTable::default() };
        if let Ok(text) = std::fs::read_to_string(&file) {
            table.read_lines(&text);
        }
        table
    }

    fn read_lines(&mut self, text: &str) {
        for line in text.lines().map(str::trim).filter(|line| !line.is_empty() && !line.starts_with('#')) {
            let Some((name, value)) = line.split_once('=') else { continue };
            let (name, value) = (name.trim(), value.trim());
            match ResourceAddress::parse(name) {
                Ok(ResourceAddress::SerialNumber(number)) => {
                    self.devices.insert(number, value.to_string());
                }
                _ => {
                    self.aliases.insert(name.to_ascii_uppercase(), value.to_string());
                }
            }
        }
    }

    /// Gives `alias` to `resource`, and keeps it.
    pub fn set_alias(&mut self, alias: &str, resource: &str) -> std::io::Result<()> {
        self.aliases.insert(alias.to_ascii_uppercase(), resource.to_string());
        self.save()
    }

    /// Reads a resource string or an alias.
    pub fn resolve(&self, name: &str) -> Result<Resolved, Status> {
        let typed = name.trim();
        if let Some(resource) = self.aliases.get(&typed.to_ascii_uppercase()) {
            return Ok(Resolved { address: ResourceAddress::parse(resource)?, name_out: typed.to_string() });
        }
        if let Some(number) = windows_com_port(typed) {
            return Ok(Resolved { address: ResourceAddress::SerialNumber(number), name_out: typed.to_string() });
        }
        let address = ResourceAddress::parse(typed)?;
        Ok(Resolved { name_out: address.canonical(), address })
    }

    /// The device of a serial address. A number the table does not know yet may be a port plugged in since:
    /// the new ports are numbered, kept, and looked at again.
    pub fn device_of(&mut self, address: &ResourceAddress) -> Result<String, Status> {
        match address {
            ResourceAddress::SerialDevice(device) => Ok(device.clone()),
            ResourceAddress::SerialNumber(number) => {
                if let Some(device) = self.known_device(*number) {
                    return Ok(device);
                }
                self.number_new_ports();
                self.known_device(*number).ok_or(Status::ERROR_RESOURCE_NOT_FOUND)
            }
            ResourceAddress::TcpSocket { .. } => Err(Status::ERROR_RESOURCE_NOT_FOUND),
        }
    }

    fn known_device(&self, number: u32) -> Option<String> {
        if cfg!(windows) {
            return Some(self.devices.get(&number).cloned().unwrap_or_else(|| format!("COM{number}")));
        }
        self.devices.get(&number).cloned().or_else(|| BUILT_IN_PORTS.iter().find(|(built_in, _)| *built_in == number).map(|(_, device)| device.to_string()))
    }

    /// Gives each port of the system that has no number the next free one, and keeps the table.
    fn number_new_ports(&mut self) {
        let mut added = false;
        for device in system_ports() {
            let known = self.devices.values().any(|kept| *kept == device) || BUILT_IN_PORTS.iter().any(|(_, built_in)| *built_in == device);
            if !known {
                let number = self.next_free_number();
                self.devices.insert(number, device);
                added = true;
            }
        }
        if added {
            // A table that cannot be written still serves this run; the numbers are given again next time.
            let _ = self.save();
        }
    }

    fn next_free_number(&self) -> u32 {
        let taken = |number: &u32| self.devices.contains_key(number) || BUILT_IN_PORTS.iter().any(|(built_in, _)| built_in == number);
        (1..).find(|number| !taken(number)).expect("a free port number")
    }

    fn save(&self) -> std::io::Result<()> {
        let Some(file) = &self.file else { return Ok(()) };
        let mut text = format!("{HEADER}\n");
        for (number, device) in &self.devices {
            text.push_str(&format!("{} = {device}\n", ResourceAddress::SerialNumber(*number).canonical()));
        }
        for (alias, resource) in &self.aliases {
            text.push_str(&format!("{alias} = {resource}\n"));
        }
        if let Some(folder) = file.parent() {
            std::fs::create_dir_all(folder)?;
        }
        std::fs::write(file, text)
    }
}

/// `COM<n>` on Windows: an alias of `ASRL<n>::INSTR` that NI-VISA makes for every port (measured).
fn windows_com_port(name: &str) -> Option<u32> {
    if !cfg!(windows) {
        return None;
    }
    let digits = name.get(..3).filter(|prefix| prefix.eq_ignore_ascii_case("COM")).map(|_| &name[3..])?;
    digits.parse().ok().filter(|_| digits.chars().all(|character| character.is_ascii_digit()))
}

/// Solder's settings folder, the one Electron gives the editor (`userData`).
fn settings_folder() -> Option<PathBuf> {
    let home = || std::env::var_os("HOME").map(PathBuf::from);
    if cfg!(windows) {
        std::env::var_os("APPDATA").map(|folder| Path::new(&folder).join("Solder"))
    } else if cfg!(target_os = "macos") {
        home().map(|folder| folder.join("Library/Application Support/Solder"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).or_else(|| home().map(|folder| folder.join(".config"))).map(|folder| folder.join("Solder"))
    }
}

/// The serial ports plugged in that are not built in, by the name that stays the same when they are
/// plugged in again: `/dev/serial/by-id` on Linux, the call-out devices on macOS.
fn system_ports() -> Vec<String> {
    let (folder, keep): (&str, fn(&str) -> bool) = if cfg!(target_os = "macos") {
        ("/dev", |name| name.starts_with("cu.") && name != "cu.Bluetooth-Incoming-Port")
    } else {
        ("/dev/serial/by-id", |_| true)
    };
    let Ok(entries) = std::fs::read_dir(folder) else { return Vec::new() };
    let mut ports: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_name().to_str().is_some_and(keep))
        .map(|entry| entry.path().to_string_lossy().into_owned())
        .collect();
    ports.sort();
    ports
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table_in(folder: &Path, text: &str) -> PortTable {
        let file = folder.join(TABLE_FILE_NAME);
        std::fs::write(&file, text).unwrap();
        PortTable::from_file(file)
    }

    fn scratch_folder(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("solder-io-port-table-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    #[test]
    fn an_alias_is_found_without_regard_to_case_and_comes_out_as_typed() {
        let table = table_in(&scratch_folder("alias"), "ASRL5::INSTR = /dev/ttyUSB0\nESP32 = ASRL5::INSTR\n");
        let resolved = table.resolve("esp32").unwrap();
        assert_eq!(resolved.address, ResourceAddress::SerialNumber(5));
        assert_eq!(resolved.name_out, "esp32");
    }

    #[test]
    fn a_resource_comes_out_in_capitals() {
        let resolved = PortTable::default().resolve("asrl1::instr").unwrap();
        assert_eq!(resolved.name_out, "ASRL1::INSTR");
    }

    #[test]
    fn a_numbered_port_is_the_device_the_table_gives() {
        let mut table = table_in(&scratch_folder("device"), "ASRL7::INSTR = /dev/ttyACM0\n");
        assert_eq!(table.device_of(&ResourceAddress::SerialNumber(7)), Ok("/dev/ttyACM0".into()));
    }

    #[test]
    fn an_alias_set_is_kept_in_the_file() {
        let folder = scratch_folder("kept");
        let file = folder.join(TABLE_FILE_NAME);
        let _ = std::fs::remove_file(&file);
        PortTable::from_file(&file).set_alias("Scope", "ASRL/dev/ttyUSB1::INSTR").unwrap();
        let again = PortTable::from_file(&file);
        assert_eq!(again.resolve("SCOPE").unwrap().address, ResourceAddress::SerialDevice("/dev/ttyUSB1".into()));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn on_linux_the_first_four_ports_are_the_pc_uarts() {
        let mut table = PortTable::default();
        assert_eq!(table.device_of(&ResourceAddress::SerialNumber(1)), Ok("/dev/ttyS0".into()));
        assert_eq!(table.device_of(&ResourceAddress::SerialNumber(4)), Ok("/dev/ttyS3".into()));
    }

    #[test]
    fn com_is_an_alias_only_on_windows() {
        assert_eq!(PortTable::default().resolve("COM3").is_ok(), cfg!(windows));
    }
}
