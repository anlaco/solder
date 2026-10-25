//! Solder's own VISA (DT-065): a resource manager that opens sessions to instruments and reads and
//! writes them with the attributes and status codes VISA has, so a VI behaves as it does in LabVIEW
//! without NI-VISA installed. Measured in LabVIEW 2026 Q3 with NI-VISA 26.5:
//! `labview-captures/reports/2026-10-25-visa-read-socket.md`.

mod manager;
mod resource;
mod session;
mod status;

pub use manager::{ResourceManager, SessionId};
pub use resource::ResourceAddress;
pub use session::{Attributes, AttributesChange, ReadResult, WriteResult};
pub use status::Status;
