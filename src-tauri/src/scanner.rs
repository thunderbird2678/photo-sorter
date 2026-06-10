use std::path::{Path, PathBuf};
use std::sync::mpsc::Sender;
use walkdir::WalkDir;

static SUPPORTED: phf::Set<&'static str> = phf::phf_set! {
    // raster images
    "jpg", "jpeg", "jfif", "png", "gif", "webp", "bmp",
    "tiff", "tif", "heic", "heif", "jxl",
    // common video containers / codecs
    "mp4", "m4v", "mov", "avi", "mkv", "webm", "wmv", "flv",
    "mpg", "mpeg", "m2v", "3gp", "3g2", "ts", "mts", "m2ts", "ogv",
    // camera raw
    "raf", "dng", "cr2", "cr3", "crw", "nef", "nrw", "arw", "srf", "sr2",
    "orf", "rw2", "pef", "srw", "3fr", "mos", "iiq", "erf", "mef", "mrw",
    "raw", "kdc", "dcr", "k25", "x3f", "rwl",
    // raw / cinema raw video
    "r3d", "braw", "crm",
};

pub fn is_supported_extension(path: &Path) -> bool {
    let Some(ext_os) = path.extension() else {
        return false;
    };
    let Some(ext) = ext_os.to_str() else {
        return false;
    };
    let len = ext.len();
    if len == 0 || len > 8 {
        return false;
    }
    let mut buf = [0u8; 8];
    for (i, &b) in ext.as_bytes().iter().enumerate() {
        if !b.is_ascii() {
            return false;
        }
        buf[i] = b.to_ascii_lowercase();
    }
    match std::str::from_utf8(&buf[..len]) {
        Ok(lower) => SUPPORTED.contains(lower),
        Err(_) => false,
    }
}

/// Walk `inputs` sequentially and push each matching path into `tx`. Designed
/// to be run on a dedicated thread; pairs with `Receiver::into_iter().par_bridge()`
/// on the consumer side so processing happens concurrently with the walk.
///
/// We use `walkdir` (sequential) instead of `jwalk` (parallel) here: jwalk's
/// internal rayon usage conflicts with a downstream `par_bridge()` consumer
/// and starves the walker, and for typical photo-folder shapes (flat or
/// lightly nested) sequential `read_dir` is fast enough that the walk is
/// rarely the bottleneck — per-file metadata/EXIF reads are.
///
/// The `is_cancelled` callback lets callers bail out early when their scan
/// has been superseded, rather than walking the entire tree only to discard
/// the results.
pub fn walk_streaming(inputs: &[String], tx: Sender<PathBuf>, is_cancelled: impl Fn() -> bool) {
    for input in inputs {
        for entry in WalkDir::new(Path::new(input))
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if is_cancelled() {
                return;
            }
            if !entry.file_type().is_file() {
                continue;
            }
            let p = entry.into_path();
            if !is_supported_extension(&p) {
                continue;
            }
            if tx.send(p).is_err() {
                return;
            }
        }
    }
}

/// Eager version used by `execute_transfer`, which needs a total file count
/// up front for progress reporting.
pub fn scan_paths(inputs: &[String]) -> Vec<PathBuf> {
    inputs
        .iter()
        .flat_map(|input| {
            WalkDir::new(Path::new(input))
                .follow_links(true)
                .into_iter()
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_file())
                .map(|e| e.into_path())
                .filter(|p| is_supported_extension(p))
        })
        .collect()
}
