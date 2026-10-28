//! Solder's input and output outside WebAssembly. Its own VISA (DT-065): a resource manager that opens
//! sessions to instruments and reads and writes them with the attributes and status codes VISA has, so a
//! VI behaves as it does in LabVIEW without NI-VISA installed (measured in LabVIEW 2026 Q3 with NI-VISA
//! 26.5: `labview-captures/reports/2026-10-25-visa-read-socket.md`). And files (DT-067), apart from VISA,
//! with LabVIEW's File I/O semantics and error codes.

mod files;
mod manager;
mod resource;
mod session;
mod status;

pub use manager::{ResourceManager, SessionId};
pub use resource::ResourceAddress;
pub use session::{Attributes, AttributesChange, ReadResult, WriteResult};
pub use status::Status;
pub use files::{Access, FileError, FileManager, FileRefnum, LinesRead, Operation, SYSTEM_END_OF_LINE, TextRead, convert_ends_of_line};
