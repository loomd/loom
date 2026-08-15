use std::env;
use std::path::{Path, PathBuf};

fn main() {
    embed_loom_cli();

    if let Err(e) = tauri_build::try_build(tauri_build::Attributes::default()) {
        panic!("tauri build failed: {e:#}");
    }
}

/// release 构建时把已编译的 `loom-cli` 产物内嵌进 GUI 二进制：
/// - 通过 `cargo:rustc-cfg=embed_loom_cli` + `cargo:rustc-env=LOOM_CLI_EMBED_PATH`
///   让 `main.rs` 以 `include_bytes!` 嵌入字节；
/// - dev/产物缺失时跳过（运行时注入会优雅降级）。
fn embed_loom_cli() {
    // 无条件声明 cfg，避免 dev/clippy 构建报 unexpected_cfgs
    println!("cargo:rustc-check-cfg=cfg(embed_loom_cli)");

    if env::var("PROFILE").as_deref() != Ok("release") {
        return; // dev 不内嵌
    }

    let Some(profile_dir) = profile_target_dir() else {
        println!("cargo:warning=无法解析 target 目录，loom CLI 未内嵌");
        return;
    };
    let loom_exe = find_loom_exe(&profile_dir);
    let Some(loom_exe) = loom_exe else {
        println!(
            "cargo:warning=loom.exe 不存在（在 {} 下未找到），loom CLI 未内嵌。请先执行 cargo build --release --package loom-cli",
            profile_dir.display()
        );
        return;
    };

    println!("cargo:rustc-cfg=embed_loom_cli");
    println!("cargo:rustc-env=LOOM_CLI_EMBED_PATH={}", loom_exe.display());
    println!("cargo:rerun-if-changed={}", loom_exe.display());
}

/// 从 `OUT_DIR`（`{target}/{profile}/build/{pkg}-{hash}/out` 或 `{target}/{triple}/{profile}/build/{pkg}-{hash}/out`）
/// 向上推导 current profile target 目录（即 `loom.exe` 所在的输出目录）。
fn profile_target_dir() -> Option<PathBuf> {
    let out_dir = env::var("OUT_DIR").ok()?;
    let out_path = Path::new(&out_dir);
    out_path.ancestors().nth(3).map(|p| p.to_path_buf())
}

fn find_loom_exe(profile_dir: &Path) -> Option<PathBuf> {
    // 1. 同 Profile 输出路径下的 loom.exe
    let candidate = profile_dir.join("loom.exe");
    if candidate.is_file() {
        return Some(candidate);
    }
    // 2. 备选：防止跨 target 架构编译时 loom.exe 在 workspace target/release/loom.exe
    if let Some(parent) = profile_dir.parent() {
        if let Some(grandparent) = parent.parent() {
            let candidate = grandparent.join("release").join("loom.exe");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}
