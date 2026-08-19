use std::fs;
use std::path::Path;

fn parse_version(s: &str) -> Option<(u32, u32, u32)> {
    let s = s.trim().trim_start_matches('v');
    let mut parts = s.split(|c: char| !c.is_ascii_digit()).filter(|p| !p.is_empty());
    let major: u32 = parts.next()?.parse().ok()?;
    let minor: u32 = parts.next()?.parse().ok()?;
    let patch: u32 = parts.next()?.parse().ok()?;
    Some((major, minor, patch))
}

fn version_from_file_name(name: &str) -> Option<(u32, u32, u32)> {
    let stem = name.strip_suffix(".md")?;
    parse_version(stem)
}

pub fn collect_entries(
    dir: &Path,
    last_version: Option<&str>,
    current_version: Option<&str>,
) -> Vec<(String, String)> {
    let last = last_version.and_then(parse_version);
    let Some(last) = last else {
        return Vec::new();
    };
    let current = current_version.and_then(parse_version);

    let mut entries: Vec<((u32, u32, u32), String, String)> = Vec::new();
    let Ok(read_dir) = fs::read_dir(dir) else {
        return Vec::new();
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Some(version) = version_from_file_name(name) else {
            continue;
        };
        if version <= last {
            continue;
        }
        if let Some(current) = current {
            if version > current {
                continue;
            }
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        entries.push((version, name.trim_end_matches(".md").to_string(), content));
    }

    entries.sort_by_key(|(version, _, _)| std::cmp::Reverse(*version));
    entries.into_iter().map(|(_, version, content)| (version, content)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version() {
        assert_eq!(parse_version("0.6.5"), Some((0, 6, 5)));
        assert_eq!(parse_version("v0.6.5"), Some((0, 6, 5)));
        assert_eq!(parse_version("1.0.0-rc.3"), Some((1, 0, 0)));
        assert_eq!(parse_version("0.10.0"), Some((0, 10, 0)));
        assert_eq!(parse_version("abc"), None);
        assert_eq!(parse_version(""), None);
    }

    #[test]
    fn test_version_from_file_name() {
        assert_eq!(version_from_file_name("v0.6.5.md"), Some((0, 6, 5)));
        assert_eq!(version_from_file_name("0.6.5.md"), Some((0, 6, 5)));
        assert_eq!(version_from_file_name("readme.md"), None);
    }

    struct TempDir(std::path::PathBuf);

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn temp_dir_with(files: &[(&str, &str)]) -> TempDir {
        let path = std::env::temp_dir().join(format!(
            "loom-whats-new-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::create_dir_all(&path).expect("Failed to create temp dir");
        for (name, content) in files {
            std::fs::write(path.join(name), content).expect("Failed to write file");
        }
        TempDir(path)
    }

    #[test]
    fn test_collect_entries_filters_and_sorts() {
        let dir = temp_dir_with(&[
            ("v0.6.1.md", "c1"),
            ("v0.6.5.md", "c5"),
            ("v0.6.3.md", "c3"),
            ("v0.6.4.md", "c4"),
            ("not-a-version.txt", "x"),
        ]);

        let entries = collect_entries(&dir.0, Some("0.6.2"), Some("0.6.5"));
        let versions: Vec<&String> = entries.iter().map(|(v, _)| v).collect();
        assert_eq!(versions, vec!["v0.6.5", "v0.6.4", "v0.6.3"]);
        assert_eq!(entries[0].1, "c5");
        assert_eq!(entries[2].1, "c3");
    }

    #[test]
    fn test_collect_entries_none_last_returns_empty() {
        let dir = temp_dir_with(&[("v0.6.5.md", "c5")]);
        let entries = collect_entries(&dir.0, None, Some("0.6.5"));
        assert!(entries.is_empty());
    }

    #[test]
    fn test_collect_entries_up_to_date_returns_empty() {
        let dir = temp_dir_with(&[("v0.6.5.md", "c5")]);
        let entries = collect_entries(&dir.0, Some("0.6.5"), Some("0.6.5"));
        assert!(entries.is_empty());
    }

    #[test]
    fn test_collect_entries_numeric_order() {
        let dir = temp_dir_with(&[("v0.9.0.md", "c9"), ("v0.10.0.md", "c10")]);
        let entries = collect_entries(&dir.0, Some("0.8.0"), Some("0.10.0"));
        let versions: Vec<&String> = entries.iter().map(|(v, _)| v).collect();
        assert_eq!(versions, vec!["v0.10.0", "v0.9.0"]);
    }

    #[test]
    fn test_collect_entries_excludes_future_versions() {
        let dir = temp_dir_with(&[("v0.6.5.md", "c5"), ("v0.6.6.md", "c6")]);
        let entries = collect_entries(&dir.0, Some("0.6.2"), Some("0.6.5"));
        let versions: Vec<&String> = entries.iter().map(|(v, _)| v).collect();
        assert_eq!(versions, vec!["v0.6.5"]);
    }
}
