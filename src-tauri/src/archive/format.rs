

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ArchiveFormat {
    Zip,
    #[serde(rename = "sevenz")]
    SevenZ,
    Rar,
}

impl ArchiveFormat {
    pub fn extension(self) -> &'static str {
        match self {
            ArchiveFormat::Zip => "zip",
            ArchiveFormat::SevenZ => "7z",
            ArchiveFormat::Rar => "rar",
        }
    }
}


pub fn sniff(path: &std::path::Path, bytes: &[u8]) -> Option<ArchiveFormat> {
    if bytes.starts_with(&[0x50, 0x4b]) {

        return Some(ArchiveFormat::Zip);
    }
    if bytes.starts_with(&[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) {
        return Some(ArchiveFormat::SevenZ);
    }
    if bytes.starts_with(&[0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]) {
        return Some(ArchiveFormat::Rar);
    }
    match path.extension().and_then(|s| s.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("zip") => Some(ArchiveFormat::Zip),
        Some("7z") => Some(ArchiveFormat::SevenZ),
        Some("rar") => Some(ArchiveFormat::Rar),
        _ => None,
    }
}


#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EncScheme {
    None,
    Aes256,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CompressionLevel {
    Store,
    Fast,
    Normal,
    Best,
}

impl CompressionLevel {

    pub fn zip_level(self) -> Option<i64> {
        match self {
            CompressionLevel::Store => None,
            CompressionLevel::Fast => Some(1),
            CompressionLevel::Normal => Some(6),
            CompressionLevel::Best => Some(9),
        }
    }
}
