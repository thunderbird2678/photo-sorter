use chrono::{Datelike, NaiveDate};
use std::path::Path;

/// Size cap for the on-disk cache. When `flush` sees the DB exceeds this,
/// it will clear the tree to reclaim space. Simple + predictable; re-fills
/// on next scan.
const CACHE_MAX_BYTES: u64 = 128 * 1024 * 1024;
const CACHE_SCHEMA_VERSION: u8 = 1;

#[derive(Clone)]
pub struct PreviewCache {
    db: Option<sled::Db>,
}

impl PreviewCache {
    pub fn open(dir: &Path) -> Self {
        let _ = std::fs::create_dir_all(dir);
        match sled::Config::new().path(dir).open() {
            Ok(db) => Self { db: Some(db) },
            Err(err) => {
                eprintln!("preview cache disabled: {err}");
                Self { db: None }
            }
        }
    }

    fn make_key(path: &str, mtime_ns: u64, size: u64) -> Vec<u8> {
        let path_bytes = path.as_bytes();
        let mut k = Vec::with_capacity(1 + path_bytes.len() + 1 + 8 + 1 + 8);
        k.push(CACHE_SCHEMA_VERSION);
        k.extend_from_slice(path_bytes);
        k.push(0);
        k.extend_from_slice(&mtime_ns.to_be_bytes());
        k.push(0);
        k.extend_from_slice(&size.to_be_bytes());
        k
    }

    pub fn get(&self, path: &str, mtime_ns: u64, size: u64) -> Option<NaiveDate> {
        let db = self.db.as_ref()?;
        let key = Self::make_key(path, mtime_ns, size);
        let val = db.get(&key).ok().flatten()?;
        if val.len() < 4 {
            return None;
        }
        let days = i32::from_be_bytes([val[0], val[1], val[2], val[3]]);
        NaiveDate::from_num_days_from_ce_opt(days)
    }

    pub fn put(&self, path: &str, mtime_ns: u64, size: u64, date: NaiveDate) {
        let Some(db) = self.db.as_ref() else {
            return;
        };
        let key = Self::make_key(path, mtime_ns, size);
        let val = date.num_days_from_ce().to_be_bytes();
        let _ = db.insert(key, &val);
    }

    pub fn flush(&self) {
        let Some(db) = self.db.as_ref() else {
            return;
        };
        let _ = db.flush();
        if db.size_on_disk().unwrap_or(0) > CACHE_MAX_BYTES {
            let _ = db.clear();
            let _ = db.flush();
        }
    }
}
