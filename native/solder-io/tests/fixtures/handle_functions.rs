//! A test library that takes handles the way a library built for LabVIEW does (DT-088). The tests compile it with
//! `rustc` as they need it, so they depend on no C compiler.
//!
//! A string's block is `{ i32 length; bytes }` and an array's `{ i32 dimension sizes[N]; elements }`, as LabVIEW's
//! `extcode.h` lays them out; a handle is a pointer to a pointer to that block.

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

/// `double array_sum(Array1DDouble **)`: the sum of a one-dimensional array of doubles.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_array_sum_f64(handle: *const *const u8) -> f64 {
    unsafe {
        let block = *handle;
        (0..read_i32(block, 0) as usize).map(|index| block.add(4 + index * 8).cast::<f64>().read_unaligned()).sum()
    }
}

/// `void array_scale(Array1DDouble **, double factor)`: multiplies every element in place.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fixture_array_scale_f64(handle: *mut *mut u8, factor: f64) {
    unsafe {
        let block = *handle;
        for index in 0..read_i32(block, 0) as usize {
            let element = block.add(4 + index * 8).cast::<f64>();
            element.write_unaligned(element.read_unaligned() * factor);
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
