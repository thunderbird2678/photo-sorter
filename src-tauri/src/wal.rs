use serde::Deserialize;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
struct WalFile {
    colors: HashMap<String, String>,
    special: WalSpecial,
}

#[derive(Debug, Deserialize)]
struct WalSpecial {
    background: String,
    foreground: String,
}

#[derive(Debug, Serialize)]
pub struct WalThemes {
    pub light: HashMap<String, String>,
    pub dark: HashMap<String, String>,
}

pub fn read_wal_themes() -> Option<WalThemes> {
    let path = wal_json_path()?;
    let data = std::fs::read_to_string(path).ok()?;
    let wal: WalFile = serde_json::from_str(&data).ok()?;
    Some(WalThemes {
        light: map_wal_light(&wal),
        dark: map_wal_dark(&wal),
    })
}

fn wal_json_path() -> Option<PathBuf> {
    let cache = dirs::cache_dir().map(|c| c.join("wal").join("colors.json"));
    if let Some(ref p) = cache {
        if p.is_file() {
            return Some(p.clone());
        }
    }
    let fallback = dirs::home_dir().map(|h| h.join(".cache").join("wal").join("colors.json"));
    fallback.filter(|p| p.is_file())
}

fn pick_color(colors: &HashMap<String, String>, key: &str, fallback: &str) -> String {
    colors
        .get(key)
        .cloned()
        .filter(|s| s.starts_with('#') && s.len() >= 4)
        .unwrap_or_else(|| fallback.to_string())
}

/// Dark UI: follows pywal `special.*` and dark terminal colors (color0 base).
fn map_wal_dark(wal: &WalFile) -> HashMap<String, String> {
    let c = &wal.colors;
    let bg = wal.special.background.clone();
    let fg = wal.special.foreground.clone();

    let c0 = pick_color(c, "color0", &bg);
    let c1 = pick_color(c, "color1", "#cc0000");
    let c4 = pick_color(c, "color4", &fg);
    let c6 = pick_color(c, "color6", &c4);
    let c7 = pick_color(c, "color7", &fg);
    let c8 = pick_color(c, "color8", &c7);

    semantic_map(&bg, &fg, &c0, &c1, &c4, &c6, &c7, &c8, &c0, &fg, c)
}

/// Light UI: inverted terminal roles — bright backgrounds, dark text, same accents from wal.
fn map_wal_light(wal: &WalFile) -> HashMap<String, String> {
    let c = &wal.colors;
    let bg_dark = wal.special.background.clone();
    let fg_bright = wal.special.foreground.clone();

    let c0 = pick_color(c, "color0", &bg_dark);
    let c1 = pick_color(c, "color1", "#cc0000");
    let c4 = pick_color(c, "color4", &fg_bright);
    let c6 = pick_color(c, "color6", &c4);
    let c7 = pick_color(c, "color7", &c0);
    let c8 = pick_color(c, "color8", &c7);
    let c15 = pick_color(c, "color15", "#f5f5f5");
    let c14 = pick_color(c, "color14", &c15);

    let bg = c15.clone();
    let fg = c0.clone();

    semantic_map(&bg, &fg, &c14, &c1, &c4, &c6, &c7, &c8, &c15, &c0, c)
}

fn semantic_map(
    background: &str,
    foreground: &str,
    card: &str,
    c1: &str,
    c4: &str,
    c6: &str,
    c7: &str,
    c8: &str,
    primary_fg: &str,
    accent_fg: &str,
    c: &HashMap<String, String>,
) -> HashMap<String, String> {
    let fg = foreground.to_string();
    let mut m = HashMap::new();
    m.insert("background".into(), background.to_string());
    m.insert("foreground".into(), fg.clone());
    m.insert("card".into(), card.to_string());
    m.insert("card-foreground".into(), fg.clone());
    m.insert("popover".into(), card.to_string());
    m.insert("popover-foreground".into(), fg.clone());
    m.insert("primary".into(), c4.to_string());
    m.insert("primary-foreground".into(), primary_fg.to_string());
    m.insert("secondary".into(), c8.to_string());
    m.insert("secondary-foreground".into(), fg.clone());
    m.insert("muted".into(), c8.to_string());
    m.insert("muted-foreground".into(), c7.to_string());
    m.insert("accent".into(), c8.to_string());
    m.insert("accent-foreground".into(), accent_fg.to_string());
    m.insert("destructive".into(), c1.to_string());
    m.insert("border".into(), c8.to_string());
    m.insert("input".into(), c8.to_string());
    m.insert("ring".into(), c6.to_string());
    m.insert("sidebar".into(), card.to_string());
    m.insert("sidebar-foreground".into(), fg.clone());
    m.insert("sidebar-primary".into(), c4.to_string());
    m.insert("sidebar-primary-foreground".into(), primary_fg.to_string());
    m.insert("sidebar-accent".into(), c8.to_string());
    m.insert("sidebar-accent-foreground".into(), accent_fg.to_string());
    m.insert("sidebar-border".into(), c8.to_string());
    m.insert("sidebar-ring".into(), c6.to_string());
    for i in 1..=5u8 {
        let key = format!("color{i}");
        let fallback = if i == 1 {
            c1.to_string()
        } else {
            c4.to_string()
        };
        m.insert(format!("chart-{i}"), pick_color(c, &key, &fallback));
    }
    m
}
