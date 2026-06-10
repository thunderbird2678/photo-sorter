use crate::cache::PreviewCache;
use crate::{io, metadata, scanner};
use chrono::NaiveDate;
use dashmap::DashMap;
use rayon::iter::{IntoParallelIterator, ParallelBridge, ParallelIterator};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

static PREVIEW_SCAN_GENERATION: AtomicU64 = AtomicU64::new(0);
static DESTINATION_SCAN_GENERATION: AtomicU64 = AtomicU64::new(0);

// Small enough that the first visible batch lands quickly (sub-200ms on
// typical SSD / EXIF workloads) and big enough to keep IPC overhead amortized.
const BATCH_SIZE: usize = 32;
const DEST_COUNT_BATCH_SIZE: usize = 32;

#[derive(Serialize, Clone)]
pub struct PreviewFilePayload {
    pub folder_path: String,
    pub file_name: String,
    pub source: String,
}

#[derive(Serialize, Clone)]
pub struct PreviewDonePayload {
    pub finished: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct ProgressPayload {
    pub current: u32,
    pub total: u32,
    pub current_file: String,
}

#[derive(Serialize, Clone)]
pub struct DestinationScan {
    pub structure: HashMap<String, Vec<String>>,
    pub file_counts: HashMap<String, u32>,
}

#[derive(Serialize, Clone)]
pub struct DestinationStructurePayload {
    pub structure: HashMap<String, Vec<String>>,
}

#[derive(Serialize, Clone)]
pub struct DestinationCountsPayload {
    /// `(folder_path, count)` where `folder_path` is `"YYYY/YYYY-MM-DD"`.
    pub counts: Vec<(String, u32)>,
}

struct SourceRoot {
    trimmed: String,
    original: String,
    lower: Option<String>,
}

fn build_source_roots(inputs: &[String]) -> Vec<SourceRoot> {
    let mut roots: Vec<SourceRoot> = inputs
        .iter()
        .filter_map(|raw| {
            let trimmed = raw.trim_end_matches(['/', '\\']).to_string();
            if trimmed.is_empty() {
                return None;
            }
            let lower = if cfg!(windows) {
                Some(trimmed.to_ascii_lowercase())
            } else {
                None
            };
            Some(SourceRoot {
                trimmed,
                original: raw.clone(),
                lower,
            })
        })
        .collect();
    roots.sort_by(|a, b| b.trimmed.len().cmp(&a.trimmed.len()));
    roots
}

fn match_source<'a>(path_str: &str, roots: &'a [SourceRoot]) -> Option<&'a str> {
    let file_norm = if path_str.contains('\\') {
        path_str.replace('\\', "/")
    } else {
        path_str.to_string()
    };
    let file_lower = if cfg!(windows) {
        Some(file_norm.to_ascii_lowercase())
    } else {
        None
    };
    for root in roots {
        let (haystack, needle) = match (&file_lower, &root.lower) {
            (Some(fl), Some(rl)) => (fl.as_str(), rl.as_str()),
            _ => (file_norm.as_str(), root.trimmed.as_str()),
        };
        if haystack.len() < needle.len() {
            continue;
        }
        if !haystack.starts_with(needle) {
            continue;
        }
        let rest = &haystack[needle.len()..];
        if rest.is_empty() || rest.starts_with('/') {
            return Some(root.original.as_str());
        }
    }
    None
}

#[tauri::command]
pub async fn scan_destination(output: String) -> Result<DestinationScan, String> {
    let output_path = Path::new(&output);

    if !output_path.exists() {
        return Ok(DestinationScan {
            structure: HashMap::new(),
            file_counts: HashMap::new(),
        });
    }

    let mut structure: HashMap<String, Vec<String>> = HashMap::new();
    let mut file_counts: HashMap<String, u32> = HashMap::new();

    let year_entries = std::fs::read_dir(output_path).map_err(|e| e.to_string())?;

    for year_entry in year_entries.filter_map(|e| e.ok()) {
        if year_entry.file_type().map(|t| !t.is_dir()).unwrap_or(true) {
            continue;
        }
        let year_name = year_entry.file_name().to_string_lossy().to_string();
        if year_name.len() != 4 || !year_name.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }

        let mut days: Vec<String> = Vec::new();

        if let Ok(day_entries) = std::fs::read_dir(year_entry.path()) {
            for day_entry in day_entries.filter_map(|e| e.ok()) {
                if day_entry.file_type().map(|t| !t.is_dir()).unwrap_or(true) {
                    continue;
                }
                let day_name = day_entry.file_name().to_string_lossy().to_string();
                if !is_valid_day_folder(&day_name) {
                    continue;
                }

                let count = count_images_in_dir(&day_entry.path());
                file_counts.insert(format!("{year_name}/{day_name}"), count);
                days.push(day_name);
            }
        }

        days.sort();
        structure.insert(year_name, days);
    }

    Ok(DestinationScan {
        structure,
        file_counts,
    })
}

fn is_valid_day_folder(name: &str) -> bool {
    if name.len() != 10 {
        return false;
    }
    let b = name.as_bytes();
    b[4] == b'-'
        && b[7] == b'-'
        && b[..4].iter().all(|c| c.is_ascii_digit())
        && b[5..7].iter().all(|c| c.is_ascii_digit())
        && b[8..].iter().all(|c| c.is_ascii_digit())
}

fn count_images_in_dir(path: &Path) -> u32 {
    std::fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| scanner::is_supported_extension(&e.path()))
                .count() as u32
        })
        .unwrap_or(0)
}

#[tauri::command]
pub fn cancel_preview_scan() -> Result<(), String> {
    PREVIEW_SCAN_GENERATION.fetch_add(1, Ordering::AcqRel);
    Ok(())
}

#[tauri::command]
pub fn cancel_destination_scan() -> Result<(), String> {
    DESTINATION_SCAN_GENERATION.fetch_add(1, Ordering::AcqRel);
    Ok(())
}

/// Enumerate the `YYYY/YYYY-MM-DD` skeleton under `output` without counting
/// files. Fast: two levels of `read_dir`.
fn enumerate_destination_structure(
    output: &Path,
) -> (
    HashMap<String, Vec<String>>,
    Vec<(String, std::path::PathBuf)>,
) {
    let mut structure: HashMap<String, Vec<String>> = HashMap::new();
    let mut day_paths: Vec<(String, std::path::PathBuf)> = Vec::new();

    let Ok(year_entries) = std::fs::read_dir(output) else {
        return (structure, day_paths);
    };

    for year_entry in year_entries.filter_map(|e| e.ok()) {
        if year_entry.file_type().map(|t| !t.is_dir()).unwrap_or(true) {
            continue;
        }
        let year_name = year_entry.file_name().to_string_lossy().to_string();
        if year_name.len() != 4 || !year_name.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }

        let mut days: Vec<String> = Vec::new();

        if let Ok(day_entries) = std::fs::read_dir(year_entry.path()) {
            for day_entry in day_entries.filter_map(|e| e.ok()) {
                if day_entry.file_type().map(|t| !t.is_dir()).unwrap_or(true) {
                    continue;
                }
                let day_name = day_entry.file_name().to_string_lossy().to_string();
                if !is_valid_day_folder(&day_name) {
                    continue;
                }
                day_paths.push((format!("{year_name}/{day_name}"), day_entry.path()));
                days.push(day_name);
            }
        }

        days.sort();
        structure.insert(year_name, days);
    }

    (structure, day_paths)
}

#[tauri::command]
pub async fn start_destination_scan(app: AppHandle, output: String) -> Result<(), String> {
    let my_gen = DESTINATION_SCAN_GENERATION.fetch_add(1, Ordering::AcqRel) + 1;
    let app_for_blocking = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let output_path = Path::new(&output);

        // Fast skeleton pass. Even for huge destinations this is just
        // `read_dir` on the root + one per year directory.
        let (structure, day_paths) = if output_path.exists() {
            enumerate_destination_structure(output_path)
        } else {
            (HashMap::new(), Vec::new())
        };

        if DESTINATION_SCAN_GENERATION.load(Ordering::Acquire) != my_gen {
            return;
        }

        let _ = app_for_blocking.emit(
            "destination://structure",
            DestinationStructurePayload { structure },
        );

        // Parallel count pass. Emits batches of counts as they complete so
        // the UI fills in progressively rather than waiting for all days.
        let count_buf: Arc<Mutex<Vec<(String, u32)>>> =
            Arc::new(Mutex::new(Vec::with_capacity(DEST_COUNT_BATCH_SIZE * 2)));

        let try_emit_counts = |payload: Vec<(String, u32)>| {
            if payload.is_empty() {
                return;
            }
            if DESTINATION_SCAN_GENERATION.load(Ordering::Acquire) != my_gen {
                return;
            }
            let _ = app_for_blocking.emit(
                "destination://counts",
                DestinationCountsPayload { counts: payload },
            );
        };

        day_paths.into_par_iter().for_each(|(key, path)| {
            if DESTINATION_SCAN_GENERATION.load(Ordering::Acquire) != my_gen {
                return;
            }
            let count = count_images_in_dir(&path);
            let drained: Option<Vec<(String, u32)>> = {
                let mut buf = count_buf.lock().unwrap();
                buf.push((key, count));
                if buf.len() >= DEST_COUNT_BATCH_SIZE {
                    Some(std::mem::take(&mut *buf))
                } else {
                    None
                }
            };
            if let Some(d) = drained {
                try_emit_counts(d);
            }
        });

        let remaining = std::mem::take(&mut *count_buf.lock().unwrap());
        try_emit_counts(remaining);
    })
    .await
    .map_err(|e| e.to_string())?;

    if DESTINATION_SCAN_GENERATION.load(Ordering::Acquire) == my_gen {
        let _ = app.emit("destination://done", ());
    }
    Ok(())
}

#[tauri::command]
pub async fn start_preview_scan(app: AppHandle, inputs: Vec<String>) -> Result<(), String> {
    let my_gen = PREVIEW_SCAN_GENERATION.fetch_add(1, Ordering::AcqRel) + 1;
    let finished_list = inputs.clone();
    eprintln!("[preview] start my_gen={} inputs={:?}", my_gen, inputs);

    let cache: PreviewCache = app.state::<PreviewCache>().inner().clone();
    let app_for_blocking = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let roots = build_source_roots(&inputs);
        let fallback_source = inputs.first().cloned().unwrap_or_default();
        let day_labels: DashMap<NaiveDate, Arc<str>> = DashMap::new();
        let batch_buf: Arc<Mutex<Vec<PreviewFilePayload>>> =
            Arc::new(Mutex::new(Vec::with_capacity(BATCH_SIZE * 2)));
        let files_seen = std::sync::atomic::AtomicUsize::new(0);
        let files_processed = std::sync::atomic::AtomicUsize::new(0);
        let batches_emitted = std::sync::atomic::AtomicUsize::new(0);

        let try_emit = |payload: Vec<PreviewFilePayload>| {
            if payload.is_empty() {
                return;
            }
            let cur = PREVIEW_SCAN_GENERATION.load(Ordering::Acquire);
            if cur != my_gen {
                eprintln!(
                    "[preview] skip emit: gen={} my_gen={} (cancelled)",
                    cur, my_gen
                );
                return;
            }
            let n = payload.len();
            match app_for_blocking.emit("preview://batch", payload) {
                Ok(()) => {
                    batches_emitted.fetch_add(1, Ordering::Relaxed);
                    eprintln!("[preview] emitted batch of {} files", n);
                }
                Err(e) => eprintln!("[preview] emit error: {e}"),
            }
        };

        let (tx, rx) = mpsc::channel::<std::path::PathBuf>();
        let walker_inputs = inputs.clone();
        let walker = std::thread::spawn(move || {
            scanner::walk_streaming(&walker_inputs, tx, || {
                PREVIEW_SCAN_GENERATION.load(Ordering::Acquire) != my_gen
            });
        });

        rx.into_iter().par_bridge().for_each(|path| {
            files_seen.fetch_add(1, Ordering::Relaxed);
            if PREVIEW_SCAN_GENERATION.load(Ordering::Acquire) != my_gen {
                return;
            }

            let meta = match std::fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => return,
            };
            let size = meta.len();
            let mtime_ns: u64 = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_nanos() as u64)
                .unwrap_or(0);

            let path_str = path.to_string_lossy().to_string();

            let date = match cache.get(&path_str, mtime_ns, size) {
                Some(d) => d,
                None => match metadata::extract_date_with_meta(&path, &meta) {
                    Some(d) => {
                        cache.put(&path_str, mtime_ns, size, d);
                        d
                    }
                    None => return,
                },
            };

            let folder_path_arc: Arc<str> = day_labels
                .entry(date)
                .or_insert_with(|| {
                    Arc::<str>::from(format!("{}/{}", date.format("%Y"), date.format("%Y-%m-%d")))
                })
                .value()
                .clone();

            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let source = match_source(&path_str, &roots)
                .map(|s| s.to_string())
                .unwrap_or_else(|| fallback_source.clone());

            let payload = PreviewFilePayload {
                folder_path: folder_path_arc.as_ref().to_string(),
                file_name,
                source,
            };

            files_processed.fetch_add(1, Ordering::Relaxed);
            let drained: Option<Vec<PreviewFilePayload>> = {
                let mut buf = batch_buf.lock().unwrap();
                buf.push(payload);
                if buf.len() >= BATCH_SIZE {
                    Some(std::mem::take(&mut *buf))
                } else {
                    None
                }
            };
            if let Some(d) = drained {
                try_emit(d);
            }
        });

        walker.join().ok();

        let remaining = std::mem::take(&mut *batch_buf.lock().unwrap());
        let remaining_len = remaining.len();
        try_emit(remaining);
        cache.flush();
        eprintln!(
            "[preview] scan body done: files_seen={} files_processed={} final_drain={} batches_emitted={}",
            files_seen.load(Ordering::Relaxed),
            files_processed.load(Ordering::Relaxed),
            remaining_len,
            batches_emitted.load(Ordering::Relaxed),
        );
    })
    .await
    .map_err(|e| e.to_string())?;

    let cur = PREVIEW_SCAN_GENERATION.load(Ordering::Acquire);
    if cur == my_gen {
        eprintln!("[preview] emitting done my_gen={}", my_gen);
        let _ = app.emit(
            "preview://done",
            PreviewDonePayload {
                finished: finished_list,
            },
        );
    } else {
        eprintln!(
            "[preview] skip done emit: gen={} my_gen={} (cancelled)",
            cur, my_gen
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn execute_transfer(
    app: AppHandle,
    inputs: Vec<String>,
    output: String,
    mode: String,
) -> Result<(), String> {
    let transfer_mode = io::TransferMode::from_str(&mode)?;
    let files = scanner::scan_paths(&inputs);
    let total = files.len() as u32;
    let output_root = Path::new(&output);

    for (index, path) in files.iter().enumerate() {
        let current = (index + 1) as u32;

        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        app.emit(
            "transfer://progress",
            ProgressPayload {
                current,
                total,
                current_file: filename.to_string(),
            },
        )
        .map_err(|e| e.to_string())?;

        let date = metadata::extract_date(path)
            .ok_or_else(|| format!("Could not determine date for {}", path.display()))?;

        let dest = io::destination_path(output_root, date, filename);
        io::transfer_file(path, &dest, &transfer_mode)?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_wal_themes() -> Option<crate::wal::WalThemes> {
    crate::wal::read_wal_themes()
}
