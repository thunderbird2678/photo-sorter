use chrono::NaiveDate;
use exif::{In, Tag};
use std::fs::{File, Metadata};
use std::io::{Cursor, Read};
use std::path::Path;

const EXIF_MAX_READ_BYTES: u64 = 128 * 1024;

pub fn extract_date(path: &Path) -> Option<NaiveDate> {
    let meta = std::fs::metadata(path).ok()?;
    extract_date_with_meta(path, &meta)
}

pub fn extract_date_with_meta(path: &Path, meta: &Metadata) -> Option<NaiveDate> {
    exif_date_bounded(path).or_else(|| filesystem_date_from_meta(meta))
}

fn exif_date_bounded(path: &Path) -> Option<NaiveDate> {
    let file = File::open(path).ok()?;
    let mut buf = Vec::with_capacity(EXIF_MAX_READ_BYTES.min(64 * 1024) as usize);
    file.take(EXIF_MAX_READ_BYTES).read_to_end(&mut buf).ok()?;

    let mut cursor = Cursor::new(&buf);
    let exif = exif::Reader::new().read_from_container(&mut cursor).ok()?;

    for tag in [
        Tag::DateTimeOriginal,
        Tag::DateTimeDigitized,
        Tag::DateTime,
    ] {
        let Some(field) = exif.get_field(tag, In::PRIMARY) else {
            continue;
        };
        if let Some(date) = parse_exif_datetime_display(&field.display_value().to_string()) {
            return Some(date);
        }
    }

    None
}

fn parse_exif_datetime_display(raw: &str) -> Option<NaiveDate> {
    let date_part = raw.split_whitespace().next()?.trim_matches('"');

    if let Ok(date) = NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
        return Some(date);
    }

    let parts: Vec<&str> = date_part.split(':').collect();
    if parts.len() < 3 {
        return None;
    }

    let year: i32 = parts[0].parse().ok()?;
    let month: u32 = parts[1].parse().ok()?;
    let day: u32 = parts[2].parse().ok()?;

    NaiveDate::from_ymd_opt(year, month, day)
}

fn filesystem_date_from_meta(meta: &Metadata) -> Option<NaiveDate> {
    use chrono::{DateTime, Local};
    use std::time::SystemTime;

    let system_time: SystemTime = meta.created().or_else(|_| meta.modified()).ok()?;
    let datetime: DateTime<Local> = system_time.into();
    Some(datetime.date_naive())
}

#[cfg(test)]
mod tests {
    use super::parse_exif_datetime_display;
    use chrono::NaiveDate;

    #[test]
    fn parses_kamadak_display_format() {
        assert_eq!(
            parse_exif_datetime_display("2026-05-07 02:29:53"),
            NaiveDate::from_ymd_opt(2026, 5, 7)
        );
    }

    #[test]
    fn parses_raw_exif_colon_format() {
        assert_eq!(
            parse_exif_datetime_display("2026:05:07 02:29:53"),
            NaiveDate::from_ymd_opt(2026, 5, 7)
        );
    }
}
