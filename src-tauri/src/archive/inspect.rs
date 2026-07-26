

use std::path::Path;

use serde::Serialize;

use super::format::{self, ArchiveFormat};
use crate::crack::verifier;
use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEntryInfo {
    pub name: String,
    pub size: u64,
    pub encrypted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveInfo {
    pub format: ArchiveFormat,
    pub encrypted: bool,
    pub scheme: Option<String>,

    pub crackable: bool,
    pub entries: Vec<ArchiveEntryInfo>,
}

pub fn inspect(path: &Path) -> AppResult<ArchiveInfo> {
    let bytes = std::fs::read(path)?;
    let format = format::sniff(path, &bytes)
        .ok_or_else(|| AppError::invalid("Unrecognized archive format."))?;
    let crackable = matches!(format, ArchiveFormat::Zip | ArchiveFormat::SevenZ);

    let probe = verifier::probe(&bytes, format)?;
    Ok(ArchiveInfo {
        format,
        encrypted: probe.any_encrypted,
        scheme: probe.scheme,
        crackable,
        entries: probe
            .entries
            .into_iter()
            .map(|e| ArchiveEntryInfo {
                name: e.name,
                size: e.size,
                encrypted: e.encrypted,
            })
            .collect(),
    })
}
