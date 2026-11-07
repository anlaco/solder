//! Solder's input and output outside WebAssembly. Its own VISA (DT-065): a resource manager that opens
//! sessions to instruments and reads and writes them with the attributes and status codes VISA has, so a
//! VI behaves as it does in LabVIEW without NI-VISA installed (measured in LabVIEW 2026 Q3 with NI-VISA
//! 26.5: `labview-captures/reports/2026-10-25-visa-read-socket.md`). And files (DT-067), apart from VISA,
//! with LabVIEW's File I/O semantics and error codes. Serial ports since DT-070, VXI-11 instruments since DT-084. Calls into native libraries
//! for the Call Library Function Node (DT-080).

mod files;
mod library;
mod manager;
mod port_table;
mod resource;
mod serial;
mod session;
mod status;
mod vxi11;

pub use manager::{Opened, ResourceManager};
pub use port_table::{PortTable, Resolved};
pub use resource::ResourceAddress;
pub use serial::{EndMode, FlowControl, LineSettings, Parity, StopBits};
pub use session::{Attributes, AttributesChange, ReadResult, SerialAttributes, SessionId, WriteResult};
pub use status::Status;
pub use files::{Access, FileError, FileManager, FileRefnum, LinesRead, Operation, SYSTEM_END_OF_LINE, TextRead, convert_ends_of_line};
pub use library::{Argument, Call, CallResult, LibraryCaller, LibraryError, NumberKind, ReturnKind, platform_library_name};
