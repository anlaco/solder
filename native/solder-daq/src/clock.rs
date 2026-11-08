//! The engine's notion of time, injected so that no test depends on the machine's clock or speed: in a test, waiting a
//! second costs nothing and always lasts exactly a second.

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

/// Time since an origin, and a way to wait.
pub trait Clock: Send + Sync {
    fn now(&self) -> Duration;
    fn wait(&self, duration: Duration);
}

/// The machine's own clock: what a real acquisition runs on.
pub struct SystemClock {
    origin: Instant,
}

impl SystemClock {
    pub fn new() -> Self {
        Self { origin: Instant::now() }
    }
}

impl Default for SystemClock {
    fn default() -> Self {
        Self::new()
    }
}

impl Clock for SystemClock {
    fn now(&self) -> Duration {
        self.origin.elapsed()
    }

    fn wait(&self, duration: Duration) {
        thread::sleep(duration);
    }
}

/// A clock that moves only when told to, or when something waits on it: waiting is instant and exact.
#[derive(Default)]
pub struct VirtualClock {
    now: Mutex<Duration>,
}

impl VirtualClock {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn advance(&self, duration: Duration) {
        *self.now.lock().expect("the virtual clock's lock") += duration;
    }
}

impl Clock for VirtualClock {
    fn now(&self) -> Duration {
        *self.now.lock().expect("the virtual clock's lock")
    }

    fn wait(&self, duration: Duration) {
        self.advance(duration);
    }
}
