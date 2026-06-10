use chrono::NaiveDate;
use std::path::{Path, PathBuf};

pub enum TransferMode {
    Copy,
    Move,
}

impl TransferMode {
    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "copy" => Ok(TransferMode::Copy),
            "move" => Ok(TransferMode::Move),
            other => Err(format!("Unknown transfer mode: {other}")),
        }
    }
}

pub fn destination_path(output_root: &Path, date: NaiveDate, filename: &str) -> PathBuf {
    let year = date.format("%Y").to_string();
    let day = date.format("%Y-%m-%d").to_string();
    output_root.join(year).join(day).join(filename)
}

pub fn transfer_file(source: &Path, destination: &Path, mode: &TransferMode) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {e}", parent.display()))?;
    }

    if destination.exists() {
        return Ok(());
    }

    match mode {
        TransferMode::Copy => {
            std::fs::copy(source, destination)
                .map_err(|e| format!("Copy failed for {}: {e}", source.display()))?;
        }
        TransferMode::Move => {
            std::fs::rename(source, destination).or_else(|_| {
                std::fs::copy(source, destination)
                    .map_err(|e| format!("Move (copy) failed for {}: {e}", source.display()))?;
                std::fs::remove_file(source)
                    .map_err(|e| format!("Move (remove) failed for {}: {e}", source.display()))
            })?;
        }
    }

    Ok(())
}
