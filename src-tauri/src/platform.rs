//! macOS file birth time. Downloads and sync use it so copied files keep
//! the phone timestamp in Finder. Other platforms no-op. Does not set mtime.



/// Sets the creation/birth time of a file on macOS using `setattrlist`.
#[cfg(target_os = "macos")]
pub(crate) fn set_creation_time(path: &std::path::Path, timestamp_secs: u64) -> std::io::Result<()> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    #[repr(C, packed(4))]
    struct AttrList {
        bitmapcount: u16,
        reserved: u16,
        commonattr: u32,
        volattr: u32,
        dirattr: u32,
        fileattr: u32,
        forkattr: u32,
    }

    const ATTR_BIT_MAP_COUNT: u16 = 5;
    const ATTR_CMN_CRTIME: u32 = 0x00000200;

    let c_path = CString::new(path.as_os_str().as_bytes())
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))?;

    let attrlist = AttrList {
        bitmapcount: ATTR_BIT_MAP_COUNT,
        reserved: 0,
        commonattr: ATTR_CMN_CRTIME,
        volattr: 0,
        dirattr: 0,
        fileattr: 0,
        forkattr: 0,
    };

    let crtime = libc::timespec {
        tv_sec: timestamp_secs as libc::time_t,
        tv_nsec: 0,
    };

    let ret = unsafe {
        libc::setattrlist(
            c_path.as_ptr(),
            &attrlist as *const AttrList as *mut libc::c_void,
            &crtime as *const libc::timespec as *mut libc::c_void,
            std::mem::size_of::<libc::timespec>(),
            0,
        )
    };

    if ret == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}


#[cfg(not(target_os = "macos"))]
pub(crate) fn set_creation_time(_path: &std::path::Path, _timestamp_secs: u64) -> std::io::Result<()> {
    Ok(())
}

