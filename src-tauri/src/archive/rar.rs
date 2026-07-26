

use std::path::{Path, PathBuf};
use std::process::Command;

use super::format::CompressionLevel;
use crate::error::{AppError, AppResult};


fn rar_candidates(explicit: Option<&str>) -> Vec<String> {
    if let Some(custom) = explicit.map(str::trim).filter(|s| !s.is_empty()) {
        return vec![custom.to_string()];
    }
    if let Ok(custom) = std::env::var("ZAF_RAR_BIN") {
        return vec![custom];
    }
    let mut v = vec!["rar".to_string()];
    if cfg!(windows) {
        v.push(r"C:\Program Files\WinRAR\Rar.exe".to_string());
        v.push(r"C:\Program Files (x86)\WinRAR\Rar.exe".to_string());
    }
    v
}

fn spawns_ok(bin: &str) -> bool {


    Command::new(bin)
        .arg("-iver")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}


fn resolve_rar(explicit: Option<&str>) -> Option<String> {
    rar_candidates(explicit).into_iter().find(|b| spawns_ok(b))
}


pub fn rar_cli_available(explicit: Option<&str>) -> bool {
    resolve_rar(explicit).is_some()
}

fn level_flag(level: CompressionLevel) -> &'static str {
    match level {
        CompressionLevel::Store => "-m0",
        CompressionLevel::Fast => "-m1",
        CompressionLevel::Normal => "-m3",
        CompressionLevel::Best => "-m5",
    }
}

fn count_files(inputs: &[PathBuf]) -> usize {
    fn walk(path: &Path, acc: &mut usize) {
        if path.is_dir() {
            if let Ok(rd) = std::fs::read_dir(path) {
                for e in rd.flatten() {
                    walk(&e.path(), acc);
                }
            }
        } else if path.is_file() {
            *acc += 1;
        }
    }
    let mut n = 0;
    for i in inputs {
        walk(i, &mut n);
    }
    n
}


pub fn create_rar(
    inputs: &[PathBuf],
    output: &Path,
    password: Option<&str>,
    level: CompressionLevel,
    explicit: Option<&str>,
) -> AppResult<usize> {
    let bin = resolve_rar(explicit).ok_or_else(|| {
        AppError::Rar(
            "No `rar` binary found. Install WinRAR/RAR and ensure `rar` is on your PATH \
             (or set ZAF_RAR_BIN) to create RAR archives."
                .into(),
        )
    })?;


    let mut cmd = Command::new(bin);
    cmd.arg("a")
        .arg("-ep1")
        .arg(level_flag(level))
        .arg("-o+")
        .arg("-y")
        .arg("-idq");

    if let Some(pw) = password {
        if !pw.is_empty() {

            cmd.arg(format!("-hp{pw}"));
        }
    }

    cmd.arg("--").arg(output);
    for input in inputs {
        cmd.arg(input);
    }

    let out = cmd.output()?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        let msg = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            format!("rar exited with status {}", out.status)
        };
        return Err(AppError::Rar(msg));
    }

    Ok(count_files(inputs))
}
