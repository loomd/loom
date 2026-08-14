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

    let Some(target_dir) = workspace_target_dir() else {
        println!("cargo:warning=无法解析 target 目录，loom CLI 未内嵌");
        return;
    };
    let profile = env::var("PROFILE").unwrap_or_default();
    let loom_exe = target_dir.join(&profile).join("loom.exe");
    if !loom_exe.is_file() {
        println!(
            "cargo:warning=loom.exe 不存在（{}），loom CLI 未内嵌。请先执行 cargo build --release --package loom-cli",
            loom_exe.display()
        );
        return;
    }

    println!("cargo:rustc-cfg=embed_loom_cli");
    println!("cargo:rustc-env=LOOM_CLI_EMBED_PATH={}", loom_exe.display());
    println!("cargo:rerun-if-changed={}", loom_exe.display());
}

/// 从 `OUT_DIR`（`{target}/{profile}/build/{pkg}-{hash}/out`）向上推导 workspace target 目录。
fn workspace_target_dir() -> Option<PathBuf> {
    let out_dir = env::var("OUT_DIR").ok()?;
    let out_path = Path::new(&out_dir);
    out_path.ancestors().nth(3).map(|p| p.to_path_buf())
}
