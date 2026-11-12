//! A test library that takes handles the way a library built for LabVIEW does (DT-088). The tests compile it with
//! `rustc` as they need it, so they depend on no C compiler.
//!
//! A string's block is `{ i32 length; bytes }` and an array's `{ i32 dimension sizes[N]; elements }`, as LabVIEW's
//! `extcode.h` lays them out with the compiler's alignment of a 64-bit system; a handle is a pointer to a pointer to that
//! block. The array functions are written over `#[repr(C)]` structs, as a C library declares them, so the padding before
//! the elements is the compiler's and not the test's.

#![allow(clippy::missing_safety_doc)]

unsafe fn read_i32(block: *const u8, offset: usize) -> i32 {
    unsafe { block.add(offset).cast::<i32>().read_unaligned() }
}

/// `int32_t string_length(LStrHandle)`: the length the block says.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_string_length(handle: *const *const u8) -> i32 {
    unsafe { read_i32(*handle, 0) }
}

/// `void string_to_upper(LStrHandle)`: upper-cases the string in place.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_string_to_upper(handle: *mut *mut u8) {
    unsafe {
        let block = *handle;
        for offset in 0..read_i32(block, 0) as usize {
            let letter = block.add(4 + offset);
            *letter = (*letter).to_ascii_uppercase();
        }
    }
}

/// `Array1DDouble`: one dimension size, then the doubles, where C puts them.
#[repr(C)]
pub struct Array1DDouble {
    dimension_size: i32,
    elements: [f64; 1],
}

/// The address of a one-dimensional array's first double.
unsafe fn first_double(block: *mut u8) -> *mut f64 {
    unsafe { (&raw mut (*block.cast::<Array1DDouble>()).elements).cast::<f64>() }
}

/// `double array_sum(Array1DDouble **)`: the sum of a one-dimensional array of doubles.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_array_sum_f64(handle: *const *const u8) -> f64 {
    unsafe {
        let block = (*handle).cast_mut();
        (0..read_i32(block, 0) as usize).map(|index| first_double(block).add(index).read()).sum()
    }
}

/// `void array_scale(Array1DDouble **, double factor)`: multiplies every element in place.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_array_scale_f64(handle: *mut *mut u8, factor: f64) {
    unsafe {
        let block = *handle;
        for index in 0..read_i32(block, 0) as usize {
            let element = first_double(block).add(index);
            element.write(element.read() * factor);
        }
    }
}

/// `void array2d_shape(Array2DDouble **, int32_t *rows, int32_t *columns)`: the two dimension sizes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_array2d_shape(handle: *const *const u8, rows: *mut i32, columns: *mut i32) {
    unsafe {
        let block = *handle;
        *rows = read_i32(block, 0);
        *columns = read_i32(block, 4);
    }
}

// The memory functions a library built for LabVIEW calls by name (DT-088 §4). They are left unresolved here, as in a
// library linked against LabVIEW, and the host offers them when it loads the library.
type MgErr = i32;
type UHandle = *mut *mut u8;

/// LabVIEW's type code for a double, as `NumericArrayResize` takes it.
const DOUBLE_TYPE_CODE: i32 = 10;

unsafe extern "C" {
    fn DSNewHandle(size: usize) -> UHandle;
    fn DSNewHClr(size: usize) -> UHandle;
    fn DSSetHandleSize(handle: UHandle, size: usize) -> MgErr;
    fn DSGetHandleSize(handle: UHandle) -> usize;
    fn DSDisposeHandle(handle: UHandle) -> MgErr;
    fn NumericArrayResize(type_code: i32, dimension_count: i32, handle_address: *mut UHandle, element_count: usize) -> MgErr;
    fn MoveBlock(source: *const u8, destination: *mut u8, size: usize);
}

/// `MgErr string_repeat(LStrHandle, uint8_t letter, int32_t count)`: leaves `count` letters in the string, resizing
/// its block first, as a library that returns a string of a length it learns only when called.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_string_repeat(handle: UHandle, letter: u8, count: i32) -> MgErr {
    unsafe {
        let error = DSSetHandleSize(handle, 4 + count as usize);
        if error != 0 {
            return error;
        }
        let block = *handle;
        block.cast::<i32>().write_unaligned(count);
        std::ptr::write_bytes(block.add(4), letter, count as usize);
        0
    }
}

/// `MgErr array_ramp(Array1DDouble **, int32_t count)`: leaves 0, 1, … count − 1 in the array, resizing it with
/// `NumericArrayResize` as a library that fills an array of doubles does.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_array_ramp_f64(handle: UHandle, count: i32) -> MgErr {
    unsafe {
        let mut handle = handle;
        let error = NumericArrayResize(DOUBLE_TYPE_CODE, 1, &raw mut handle, count as usize);
        if error != 0 {
            return error;
        }
        let block = *handle;
        block.cast::<i32>().write_unaligned(count);
        for index in 0..count as usize {
            first_double(block).add(index).write(index as f64);
        }
        0
    }
}

/// `void handle_round_trip(size_t size, int32_t results[6])`: makes handles of its own and reports what the host's
/// functions answered: the size of a new handle, the first byte of a cleared one, a byte copied with `MoveBlock`, the
/// size after a resize, and the errors of disposing of a handle once and twice.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_handle_round_trip(size: usize, results: *mut i32) {
    unsafe {
        let plain = DSNewHandle(size);
        let cleared = DSNewHClr(size);
        **plain = 42;
        MoveBlock(*plain, *cleared, 1);
        let first_byte_after_move = i32::from(**cleared);
        let resize_error = DSSetHandleSize(plain, size * 2);
        results.add(0).write(DSGetHandleSize(cleared) as i32);
        results.add(1).write(first_byte_after_move);
        results.add(2).write(if resize_error == 0 { DSGetHandleSize(plain) as i32 } else { -resize_error });
        results.add(3).write(DSDisposeHandle(plain));
        results.add(4).write(DSDisposeHandle(cleared));
        results.add(5).write(DSDisposeHandle(cleared));
    }
}

/// `int32_t cleared_handle_is_zeros(size_t size)`: 1 when a handle from `DSNewHClr` holds only zeros.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_cleared_handle_is_zeros(size: usize) -> i32 {
    unsafe {
        let handle = DSNewHClr(size);
        let zeros = std::slice::from_raw_parts(*handle, size).iter().all(|&byte| byte == 0);
        DSDisposeHandle(handle);
        i32::from(zeros)
    }
}

/// `MgErr resize_a_stranger(void)`: asks the host to resize a cell it did not make, which it must refuse.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_resize_a_stranger() -> MgErr {
    let mut block = [0u8; 8];
    let mut cell: *mut u8 = block.as_mut_ptr();
    unsafe { DSSetHandleSize(&raw mut cell, 64) }
}

/// `int32_t pascal_length(PStr)`: the length byte of a Pascal string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_pascal_length(text: *const u8) -> i32 {
    unsafe { i32::from(*text) }
}

/// `void pascal_set(PStr, uint8_t count, uint8_t letter)`: leaves `count` letters in the string, as many as it likes.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_pascal_set(text: *mut u8, count: u8, letter: u8) {
    unsafe {
        *text = count;
        std::ptr::write_bytes(text.add(1), letter, usize::from(count));
    }
}

/// `PStr pascal_return_long(void)`: a Pascal string of 200 letters, longer than a signed length byte holds.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_pascal_return_long() -> *const u8 {
    static LONG: [u8; 201] = {
        let mut text = [b'x'; 201];
        text[0] = 200;
        text
    };
    LONG.as_ptr()
}

/// `int32_t handle_pointer_is_null(LStrHandle *)`: 1 when the cell holds a null handle, as for an empty value.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_handle_pointer_is_null(cell: *const UHandle) -> i32 {
    unsafe { i32::from((*cell).is_null()) }
}

/// `MgErr string_pointer_replace(LStrHandle *, uint8_t letter, int32_t count)`: disposes of the handle in the cell, if
/// any, and leaves there a new one with `count` letters, as a library that makes its own string does.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_string_pointer_replace(cell: *mut UHandle, letter: u8, count: i32) -> MgErr {
    unsafe {
        if !(*cell).is_null() {
            DSDisposeHandle(*cell);
        }
        let handle = DSNewHandle(4 + count as usize);
        let block = *handle;
        block.cast::<i32>().write_unaligned(count);
        std::ptr::write_bytes(block.add(4), letter, count as usize);
        *cell = handle;
        0
    }
}

/// `MgErr array_pointer_ramp(Array1DDouble ***, int32_t count)`: leaves 0, 1, … count − 1 in the array, making it with
/// `NumericArrayResize` when the cell holds none.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_array_pointer_ramp_f64(cell: *mut UHandle, count: i32) -> MgErr {
    unsafe {
        let error = NumericArrayResize(DOUBLE_TYPE_CODE, 1, cell, count as usize);
        if error != 0 {
            return error;
        }
        let block = **cell;
        block.cast::<i32>().write_unaligned(count);
        for index in 0..count as usize {
            first_double(block).add(index).write(index as f64);
        }
        0
    }
}

/// `void handle_pointer_clear(LStrHandle *)`: leaves the cell null, keeping the handle that was there.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_handle_pointer_clear(cell: *mut UHandle) {
    unsafe { *cell = std::ptr::null_mut() };
}

/// `void handle_pointer_stranger(LStrHandle *)`: leaves in the cell an address the host did not make.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_handle_pointer_stranger(cell: *mut UHandle) {
    static mut STRANGER: *mut u8 = std::ptr::null_mut();
    unsafe { *cell = &raw mut STRANGER };
}
