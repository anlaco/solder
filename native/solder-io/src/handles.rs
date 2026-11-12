//! LabVIEW's handles (DT-088): a handle is the address of a cell that holds the address of a block, so that the block
//! can be moved or resized without the holders of the handle noticing. A library built for LabVIEW fills a string or an
//! array through one, and asks the host to resize it (`DSSetHandleSize`, `NumericArrayResize`).
//!
//! Every handle made here is entered in a table with its block's size, so that the memory functions answer for it and
//! refuse an address they did not make, instead of trusting a pointer that a library may have kept after disposing of it.
//! The layout of the block (a string's length first, an array's dimension sizes first) is the caller's: a handle is only
//! bytes here.

use std::alloc::{Layout, alloc_zeroed, dealloc, realloc};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// The alignment of a block: enough for any number a library puts in it.
const BLOCK_ALIGNMENT: usize = 8;

/// A handle: the address of the cell that holds the address of the block.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Handle(*mut *mut u8);

// SAFETY: a handle is an address; what it points to is reached only through the table's lock, or by the library that
// was handed it, as in LabVIEW.
unsafe impl Send for Handle {}
unsafe impl Sync for Handle {}

impl Handle {
    /// The handle as a library receives it: the address of the cell.
    pub fn as_pointer(self) -> *mut *mut u8 {
        self.0
    }

    /// The handle a library handed back, from its address. It is a handle only if this module made it.
    pub fn from_pointer(pointer: *mut *mut u8) -> Option<Self> {
        let handle = Handle(pointer);
        SIZES.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).contains_key(&handle).then_some(handle)
    }
}

/// The handles that exist, each with its block's size in bytes.
static SIZES: LazyLock<Mutex<HashMap<Handle, usize>>> = LazyLock::new(Default::default);

/// A block's layout; a block of no bytes still owns one, since the allocator takes no empty layout.
fn layout_of(size: usize) -> Layout {
    Layout::from_size_align(size.max(1), BLOCK_ALIGNMENT).expect("a block's size fits an allocation")
}

/// A new handle whose block is `size` bytes of zeros.
pub fn new_zeroed(size: usize) -> Handle {
    // SAFETY: the layout is not empty, and a null result is checked.
    let block = unsafe { alloc_zeroed(layout_of(size)) };
    assert!(!block.is_null(), "out of memory for a handle's block");
    let handle = Handle(Box::into_raw(Box::new(block)));
    SIZES.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).insert(handle, size);
    handle
}

/// A new handle whose block holds `content`.
pub fn new_with(content: &[u8]) -> Handle {
    let handle = new_zeroed(content.len());
    // SAFETY: the block was just made, with room for `content`, and nothing else holds the handle yet.
    unsafe { std::ptr::copy_nonoverlapping(content.as_ptr(), *handle.0, content.len()) };
    handle
}

/// The size of a handle's block, or `None` for an address this module did not make.
pub fn size_of(handle: Handle) -> Option<usize> {
    SIZES.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).get(&handle).copied()
}

/// Gives a handle's block a new size, keeping what fits and zeroing what is new. `false` for an unknown handle.
pub fn resize(handle: Handle, new_size: usize) -> bool {
    let mut sizes = SIZES.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(size) = sizes.get_mut(&handle) else { return false };
    // SAFETY: the table says the cell is live, so it holds the block made with `layout_of(*size)`.
    unsafe {
        let old_block = *handle.0;
        let new_block = realloc(old_block, layout_of(*size), new_size.max(1));
        assert!(!new_block.is_null(), "out of memory for a handle's block");
        if new_size > *size {
            std::ptr::write_bytes(new_block.add(*size), 0, new_size - *size);
        }
        *handle.0 = new_block;
    }
    *size = new_size;
    true
}

/// A copy of a handle's block as it is now: what a library left in it, resized or not. `None` for an unknown handle.
pub fn content(handle: Handle) -> Option<Vec<u8>> {
    let sizes = SIZES.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let size = *sizes.get(&handle)?;
    // SAFETY: the table says the cell is live and its block is `size` bytes; the lock keeps it from being resized meanwhile.
    Some(unsafe { std::slice::from_raw_parts(*handle.0, size) }.to_vec())
}

/// Frees a handle and its block. `false` for an unknown handle, so disposing of one twice does nothing.
pub fn dispose(handle: Handle) -> bool {
    let mut sizes = SIZES.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let Some(size) = sizes.remove(&handle) else { return false };
    // SAFETY: the entry was live, so the cell is a leaked box and the block was made with `layout_of(size)`.
    unsafe {
        dealloc(*handle.0, layout_of(size));
        drop(Box::from_raw(handle.0));
    }
    true
}

/// A cell that holds a handle, or a null one: what a library receives for a pointer to a handle, `LStrHandle *` or
/// `Array1DDouble ***` (DT-088 §8). The library may resize the handle, put another one in the cell (its own, made with
/// the memory functions) or leave the cell null, and the host takes what is there after the call.
pub struct HandleCell(Box<*mut *mut u8>);

impl HandleCell {
    /// A cell holding a new handle with `content`, or a null handle for no bytes at all, as LabVIEW passes an empty
    /// string or array from the diagram (measured 2026-11-12,
    /// `labview-captures/reports/2026-11-12-clfn-handle-pointers.md`).
    pub fn holding(content: &[u8]) -> Self {
        let handle = if content.is_empty() { std::ptr::null_mut() } else { new_with(content).as_pointer() };
        HandleCell(Box::new(handle))
    }

    /// The cell as a library receives it: the address of the handle.
    pub fn as_pointer(&mut self) -> *mut *mut *mut u8 {
        &raw mut *self.0
    }

    /// What the cell holds after the call: no bytes for a null handle (an empty value, measured), or the block of the
    /// handle there, which is then disposed of. `None` for an address the host did not make, which is not read.
    ///
    /// A handle the library took out of the cell is left alone, not disposed of: a library built for LabVIEW may keep
    /// it for a later call, and LabVIEW does not dispose of it either (measured: replacing it never failed).
    pub fn take_content(self) -> Option<Vec<u8>> {
        let pointer = *self.0;
        if pointer.is_null() {
            return Some(Vec::new());
        }
        let handle = Handle::from_pointer(pointer)?;
        let block = content(handle);
        dispose(handle);
        block
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_handle_holds_the_bytes_it_was_made_with_and_reports_its_size() {
        let handle = new_with(b"hello");
        assert_eq!(size_of(handle), Some(5));
        assert_eq!(content(handle).as_deref(), Some(&b"hello"[..]));
        assert!(dispose(handle));
    }

    #[test]
    fn a_handle_is_the_address_of_a_cell_that_holds_the_address_of_the_block() {
        let handle = new_with(&[7, 8, 9]);
        // SAFETY: the handle is live; reading through it as a library would.
        let first_byte = unsafe { **handle.as_pointer() };
        assert_eq!(first_byte, 7);
        dispose(handle);
    }

    #[test]
    fn resizing_keeps_what_fits_zeroes_what_is_new_and_leaves_the_handle_where_it_is() {
        let handle = new_with(&[1, 2, 3, 4]);
        let address = handle.as_pointer();
        assert!(resize(handle, 6));
        assert_eq!(handle.as_pointer(), address, "the handle does not move, only its block may");
        assert_eq!(content(handle).unwrap(), [1, 2, 3, 4, 0, 0]);
        assert!(resize(handle, 2));
        assert_eq!(content(handle).unwrap(), [1, 2]);
        assert!(resize(handle, 0));
        assert_eq!(size_of(handle), Some(0));
        assert_eq!(content(handle).unwrap(), Vec::<u8>::new());
        dispose(handle);
    }

    #[test]
    fn a_zeroed_handle_is_zeros() {
        let handle = new_zeroed(4);
        assert_eq!(content(handle).unwrap(), [0, 0, 0, 0]);
        dispose(handle);
    }

    #[test]
    fn an_address_this_module_did_not_make_is_refused_and_so_is_a_disposed_one() {
        let mut cell: *mut u8 = std::ptr::null_mut();
        assert_eq!(Handle::from_pointer(&raw mut cell), None, "a stranger's cell");
        let handle = new_with(b"x");
        assert_eq!(Handle::from_pointer(handle.as_pointer()), Some(handle));
        assert!(dispose(handle));
        assert!(!dispose(handle), "disposing twice does nothing");
        assert_eq!(size_of(handle), None);
        assert!(!resize(handle, 10));
        assert_eq!(content(handle), None);
        assert_eq!(Handle::from_pointer(handle.as_pointer()), None);
    }

    #[test]
    fn a_cell_with_no_bytes_holds_a_null_handle_and_gives_back_no_bytes() {
        let mut cell = HandleCell::holding(&[]);
        // SAFETY: the cell is live; reading it as a library would.
        assert!(unsafe { *cell.as_pointer() }.is_null());
        assert_eq!(cell.take_content(), Some(Vec::new()));
    }

    #[test]
    fn a_cell_gives_back_the_handle_a_library_put_in_it_and_leaves_the_one_it_took_out() {
        let mut cell = HandleCell::holding(b"abc");
        // SAFETY: the cell is live; replacing its handle as a library would.
        let taken = Handle(unsafe { *cell.as_pointer() });
        let replacement = new_with(b"new");
        unsafe { *cell.as_pointer() = replacement.as_pointer() };
        assert_eq!(cell.take_content().as_deref(), Some(&b"new"[..]));
        assert_eq!(size_of(replacement), None, "the handle read is disposed of");
        assert_eq!(content(taken).as_deref(), Some(&b"abc"[..]), "the one taken out stays the library's");
        dispose(taken);
    }

    #[test]
    fn a_cell_left_holding_an_address_the_host_did_not_make_is_not_read() {
        let mut cell = HandleCell::holding(b"abc");
        // SAFETY: the cell is live; a library leaving a stranger's address in it.
        let given = Handle(unsafe { *cell.as_pointer() });
        let mut stranger: *mut u8 = std::ptr::null_mut();
        unsafe { *cell.as_pointer() = &raw mut stranger };
        assert_eq!(cell.take_content(), None);
        dispose(given);
    }
}
