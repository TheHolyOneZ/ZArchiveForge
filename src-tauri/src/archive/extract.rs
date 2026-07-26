

use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::format::{self, ArchiveFormat};
use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractRequest {

    pub archive: PathBuf,

    pub dest: PathBuf,

    pub password: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub dest: PathBuf,

    pub files: usize,

    pub bytes: u64,
}

pub fn extract_archive(req: ExtractRequest) -> AppResult<ExtractResult> {
    if !req.archive.exists() {
        return Err(AppError::invalid("Archive no longer exists."));
    }


    let mut header = [0u8; 8];
    {
        let mut f = File::open(&req.archive)?;
        let _ = f.read(&mut header)?;
    }
    let fmt = format::sniff(&req.archive, &header)
        .ok_or_else(|| AppError::invalid("Unrecognized archive format."))?;

    std::fs::create_dir_all(&req.dest)?;
    let dest = req
        .dest
        .canonicalize()
        .unwrap_or_else(|_| req.dest.clone());
    let password = req.password.filter(|p| !p.is_empty());

    match fmt {
        ArchiveFormat::Zip => extract_zip(&req.archive, &dest, password.as_deref()),
        ArchiveFormat::SevenZ => extract_7z(&req.archive, &dest, password.as_deref()),
        ArchiveFormat::Rar => Err(AppError::Rar(
            "RAR extraction isn't supported — only ZIP and 7z can be extracted.".into(),
        )),
    }
    .map(|(files, bytes)| ExtractResult { dest, files, bytes })
}


fn safe_join(dest: &Path, name: &str) -> AppResult<PathBuf> {
    let rel = Path::new(name);
    let mut out = dest.to_path_buf();
    for comp in rel.components() {
        match comp {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::invalid(format!(
                    "Refusing to extract unsafe path: {name}"
                )));
            }
        }
    }
    Ok(out)
}

fn extract_zip(archive: &Path, dest: &Path, password: Option<&str>) -> AppResult<(usize, u64)> {
    let file = BufReader::new(File::open(archive)?);
    let mut zip = zip::ZipArchive::new(file)?;

    let mut files = 0usize;
    let mut bytes = 0u64;
    for i in 0..zip.len() {

        let (name, is_dir, encrypted) = {
            let raw = zip.by_index_raw(i)?;
            (raw.name().to_string(), raw.is_dir(), raw.encrypted())
        };

        let out_path = safe_join(dest, &name)?;
        if is_dir {
            std::fs::create_dir_all(&out_path)?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)?;
        }


        let mut entry = if encrypted {
            let pw = password.ok_or_else(|| {
                AppError::invalid("This ZIP is encrypted — a password is required.")
            })?;
            zip.by_index_decrypt(i, pw.as_bytes())
                .map_err(|_| AppError::invalid("Incorrect password for this ZIP archive."))?
        } else {
            zip.by_index(i)?
        };

        let mut out = File::create(&out_path)?;
        let n = std::io::copy(&mut entry, &mut out).map_err(|e| {

            if encrypted {
                AppError::invalid("Incorrect password for this ZIP archive.")
            } else {
                AppError::Io(e.to_string())
            }
        })?;
        bytes += n;
        files += 1;
    }
    Ok((files, bytes))
}

fn extract_7z(archive: &Path, dest: &Path, password: Option<&str>) -> AppResult<(usize, u64)> {
    use sevenz_rust2::{ArchiveReader, Password};

    let pw = password.map(Password::from).unwrap_or_else(Password::empty);
    let mut reader = ArchiveReader::open(archive, pw).map_err(map_7z_pw_error)?;

    let mut files = 0usize;
    let mut bytes = 0u64;
    reader
        .for_each_entries(|entry, rd| {


            let out_path = safe_join(dest, entry.name()).map_err(|e| {
                std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())
            })?;
            if entry.is_directory() {
                std::fs::create_dir_all(&out_path)?;
                return Ok(true);
            }
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut out = File::create(&out_path)?;
            let n = std::io::copy(rd, &mut out)?;
            bytes += n;
            files += 1;
            Ok(true)
        })
        .map_err(map_7z_pw_error)?;

    Ok((files, bytes))
}


fn map_7z_pw_error(e: sevenz_rust2::Error) -> AppError {
    let msg = e.to_string();
    let lower = msg.to_lowercase();
    if lower.contains("password") || lower.contains("checksum") || lower.contains("maybe wrong") {
        AppError::invalid("Incorrect password for this 7z archive.")
    } else {
        AppError::SevenZ(msg)
    }
}
