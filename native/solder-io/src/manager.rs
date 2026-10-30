//! The resource manager: the open sessions, each behind its own lock, so a Read that waits on one
//! instrument does not hold back another; the serial ports they share; and the port table.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, Weak};

use crate::port_table::PortTable;
use crate::resource::ResourceAddress;
use crate::session::{Attributes, AttributesChange, ReadResult, SerialPort, Session, SessionId, WriteResult};
use crate::status::Status;

/// Sessions are numbered from 1, so that 0 stays "no session", as an unwired VISA refnum.
const FIRST_SESSION: SessionId = 1;

/// What VISA Open gives: the session, and the name its resource name out shows.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Opened {
    pub session: SessionId,
    pub name_out: String,
}

pub struct ResourceManager {
    sessions: Mutex<HashMap<SessionId, Arc<Mutex<Session>>>>,
    next_session: AtomicU32,
    /// By device: a port stays open while a session is on it, and a second Open shares it (measured: two
    /// sessions on ASRL1 both open, which Windows allows only through one handle).
    serial_ports: Mutex<HashMap<String, Weak<Mutex<SerialPort>>>>,
    port_table: Mutex<PortTable>,
}

impl Default for ResourceManager {
    fn default() -> Self {
        ResourceManager::with_port_table(PortTable::from_default_location())
    }
}

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl ResourceManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_port_table(port_table: PortTable) -> Self {
        ResourceManager {
            sessions: Mutex::new(HashMap::new()),
            next_session: AtomicU32::new(FIRST_SESSION),
            serial_ports: Mutex::new(HashMap::new()),
            port_table: Mutex::new(port_table),
        }
    }

    /// VISA Open: a resource string or an alias.
    pub fn open(&self, resource: &str) -> Result<Opened, Status> {
        let resolved = locked(&self.port_table).resolve(resource)?;
        let id = self.next_session.fetch_add(1, Ordering::Relaxed);
        let session = match &resolved.address {
            ResourceAddress::TcpSocket { host, port } => Session::open_socket(host, *port)?,
            serial => {
                let device = locked(&self.port_table).device_of(serial)?;
                Session::open_serial(self.serial_port(&device)?, id)
            }
        };
        locked(&self.sessions).insert(id, Arc::new(Mutex::new(session)));
        Ok(Opened { session: id, name_out: resolved.name_out })
    }

    /// The port open on `device`, or the device opened now.
    fn serial_port(&self, device: &str) -> Result<Arc<Mutex<SerialPort>>, Status> {
        let mut ports = locked(&self.serial_ports);
        if let Some(open) = ports.get(device).and_then(Weak::upgrade) {
            return Ok(open);
        }
        let port = SerialPort::open(device)?;
        ports.retain(|_, port| port.strong_count() > 0);
        ports.insert(device.to_string(), Arc::downgrade(&port));
        Ok(port)
    }

    /// VISA Close of a session that is open. (LabVIEW's warning for one that is not is given by the runtime,
    /// which knows whether the session was ever live.)
    pub fn close(&self, session: SessionId) -> Status {
        match locked(&self.sessions).remove(&session) {
            Some(_) => Status::SUCCESS,
            None => Status::ERROR_INVALID_OBJECT,
        }
    }

    /// VISA Write.
    pub fn write(&self, session: SessionId, data: &[u8]) -> WriteResult {
        self.with_session(session, |open| open.write(data))
            .unwrap_or_else(|status| WriteResult { count: 0, status })
    }

    /// VISA Read.
    pub fn read(&self, session: SessionId, count: usize) -> ReadResult {
        self.with_session(session, |open| open.read(count))
            .unwrap_or_else(|status| ReadResult { data: Vec::new(), status })
    }

    /// A VISA Property Node that reads.
    pub fn attributes(&self, session: SessionId) -> Result<Attributes, Status> {
        self.with_session(session, |open| open.attributes())
    }

    /// A VISA Property Node that writes.
    pub fn change_attributes(&self, session: SessionId, change: AttributesChange) -> Status {
        self.with_session(session, |open| open.change_attributes(change)).unwrap_or_else(|status| status)
    }

    /// Serial Settings ▸ Number of Bytes at Serial Port.
    pub fn bytes_at_port(&self, session: SessionId) -> Result<usize, Status> {
        self.with_session(session, |open| open.bytes_at_port())?
    }

    fn with_session<T>(&self, session: SessionId, operation: impl FnOnce(&mut Session) -> T) -> Result<T, Status> {
        let open = locked(&self.sessions).get(&session).cloned().ok_or(Status::ERROR_INVALID_OBJECT)?;
        let mut open = locked(&open);
        Ok(operation(&mut open))
    }
}
