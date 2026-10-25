//! The resource manager: the open sessions, each behind its own lock, so a Read that waits on one
//! instrument does not hold back another.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use crate::resource::ResourceAddress;
use crate::session::{Attributes, AttributesChange, ReadResult, Session, WriteResult};
use crate::status::Status;

/// A session as VISA hands it out: a number that names it until it is closed.
pub type SessionId = u32;

/// Sessions are numbered from 1, so that 0 stays "no session", as an unwired VISA refnum.
const FIRST_SESSION: SessionId = 1;

pub struct ResourceManager {
    sessions: Mutex<HashMap<SessionId, Arc<Mutex<Session>>>>,
    next_session: AtomicU32,
}

impl Default for ResourceManager {
    fn default() -> Self {
        ResourceManager { sessions: Mutex::new(HashMap::new()), next_session: AtomicU32::new(FIRST_SESSION) }
    }
}

impl ResourceManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// VISA Open.
    pub fn open(&self, resource: &str) -> Result<SessionId, Status> {
        let address = ResourceAddress::parse(resource)?;
        let session = Session::open(&address)?;
        let id = self.next_session.fetch_add(1, Ordering::Relaxed);
        self.lock_sessions().insert(id, Arc::new(Mutex::new(session)));
        Ok(id)
    }

    /// VISA Close. Unverified: what LabVIEW's Close gives for a session that is not open.
    pub fn close(&self, session: SessionId) -> Status {
        match self.lock_sessions().remove(&session) {
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
        self.with_session(session, |open| open.change_attributes(change)).err().unwrap_or(Status::SUCCESS)
    }

    fn with_session<T>(&self, session: SessionId, operation: impl FnOnce(&mut Session) -> T) -> Result<T, Status> {
        let open = self.lock_sessions().get(&session).cloned().ok_or(Status::ERROR_INVALID_OBJECT)?;
        let mut open = open.lock().unwrap_or_else(PoisonError::into_inner);
        Ok(operation(&mut open))
    }

    fn lock_sessions(&self) -> std::sync::MutexGuard<'_, HashMap<SessionId, Arc<Mutex<Session>>>> {
        self.sessions.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
