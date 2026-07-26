

use std::io::Cursor;
use std::sync::Arc;

use super::candidate::CandidateSource;
use crate::archive::format::ArchiveFormat;
use crate::error::{AppError, AppResult};

pub trait PasswordVerifier: Send + Sync {
    fn verify(&self, password: &str) -> bool;
}


#[derive(Debug, Clone)]
pub struct EntryInfo {
    pub name: String,
    pub size: u64,
    pub encrypted: bool,
}

pub struct Probe {
    pub entries: Vec<EntryInfo>,
    pub any_encrypted: bool,
    pub scheme: Option<String>,

    pub header_encrypted: bool,
}


struct ZipVerifier {
    bytes: Arc<Vec<u8>>,
    index: usize,
}

impl PasswordVerifier for ZipVerifier {
    fn verify(&self, password: &str) -> bool {
        let mut archive = match zip::ZipArchive::new(Cursor::new(self.bytes.as_slice())) {
            Ok(a) => a,
            Err(_) => return false,
        };
        let ok = match archive.by_index_decrypt(self.index, password.as_bytes()) {
            Ok(mut file) => std::io::copy(&mut file, &mut std::io::sink()).is_ok(),
            Err(_) => false,
        };
        ok
    }
}


fn zip_scheme(bytes: &[u8]) -> &'static str {
    const CD_SIG: [u8; 4] = [0x50, 0x4b, 0x01, 0x02];
    let mut i = 0;
    while i + 12 <= bytes.len() {
        if bytes[i..i + 4] == CD_SIG {
            let method = u16::from_le_bytes([bytes[i + 10], bytes[i + 11]]);
            if method == 99 {
                return "AES-256";
            }
        }
        i += 1;
    }
    "ZipCrypto"
}

fn probe_zip(bytes: &[u8]) -> AppResult<Probe> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))?;
    let mut entries = Vec::with_capacity(archive.len());
    let mut any_encrypted = false;
    for i in 0..archive.len() {
        let f = archive.by_index_raw(i)?;
        if f.is_dir() {
            continue;
        }
        let enc = f.encrypted();
        any_encrypted |= enc;
        entries.push(EntryInfo {
            name: f.name().to_string(),
            size: f.size(),
            encrypted: enc,
        });
    }
    let scheme = any_encrypted.then(|| zip_scheme(bytes).to_string());
    Ok(Probe {
        entries,
        any_encrypted,
        scheme,
        header_encrypted: false,
    })
}

fn build_zip_verifier(bytes: Arc<Vec<u8>>, entry: Option<&str>) -> AppResult<Box<dyn PasswordVerifier>> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes.as_slice()))?;
    let mut best: Option<(usize, u64)> = None;
    for i in 0..archive.len() {
        let f = archive.by_index_raw(i)?;
        if f.is_dir() || !f.encrypted() {
            continue;
        }
        if let Some(name) = entry {
            if f.name() == name {
                best = Some((i, f.size()));
                break;
            }
        } else if best.map(|(_, s)| f.size() < s).unwrap_or(true) {
            best = Some((i, f.size()));
        }
    }
    let (index, _) = best.ok_or_else(|| AppError::invalid("No encrypted entry found in this ZIP."))?;
    Ok(Box::new(ZipVerifier { bytes, index }))
}


struct SevenZVerifier {
    bytes: Arc<Vec<u8>>,


    name: Option<String>,
}

impl PasswordVerifier for SevenZVerifier {
    fn verify(&self, password: &str) -> bool {
        let cursor = Cursor::new(self.bytes.as_slice());
        let mut reader =
            match sevenz_rust2::ArchiveReader::new(cursor, sevenz_rust2::Password::from(password)) {
                Ok(r) => r,
                Err(_) => return false,
            };
        match &self.name {
            Some(name) => reader.read_file(name).is_ok(),
            None => true,
        }
    }
}

fn probe_7z(bytes: &[u8]) -> AppResult<Probe> {
    let mut cursor = Cursor::new(bytes);
    let empty = sevenz_rust2::Password::empty();
    match sevenz_rust2::Archive::read(&mut cursor, &empty) {
        Ok(archive) => {
            let entries: Vec<EntryInfo> = archive
                .files
                .iter()
                .filter(|f| !f.is_directory())
                .map(|f| EntryInfo {
                    name: f.name().to_string(),
                    size: f.size(),
                    encrypted: false,
                })
                .collect();


            let smallest = archive
                .files
                .iter()
                .filter(|f| f.has_stream() && f.size() > 0)
                .min_by_key(|f| f.size())
                .map(|f| f.name().to_string());

            let encrypted = match smallest {
                Some(name) => {
                    let c = Cursor::new(bytes);
                    match sevenz_rust2::ArchiveReader::new(c, sevenz_rust2::Password::empty()) {
                        Ok(mut r) => r.read_file(&name).is_err(),
                        Err(_) => true,
                    }
                }
                None => false,
            };

            let entries = entries
                .into_iter()
                .map(|mut e| {
                    e.encrypted = encrypted;
                    e
                })
                .collect();

            Ok(Probe {
                entries,
                any_encrypted: encrypted,
                scheme: encrypted.then(|| "AES-256".to_string()),
                header_encrypted: false,
            })
        }

        Err(_) => Ok(Probe {
            entries: Vec::new(),
            any_encrypted: true,
            scheme: Some("AES-256 (encrypted headers)".to_string()),
            header_encrypted: true,
        }),
    }
}

fn build_7z_verifier(bytes: Arc<Vec<u8>>, entry: Option<&str>) -> AppResult<Box<dyn PasswordVerifier>> {
    let probe = probe_7z(&bytes)?;
    if probe.header_encrypted {
        return Ok(Box::new(SevenZVerifier { bytes, name: None }));
    }
    let name = match entry {
        Some(n) => Some(n.to_string()),
        None => probe
            .entries
            .iter()
            .filter(|e| e.size > 0)
            .min_by_key(|e| e.size)
            .or_else(|| probe.entries.first())
            .map(|e| e.name.clone()),
    };
    let name = name.ok_or_else(|| AppError::invalid("This 7z archive has no decodable entries."))?;
    Ok(Box::new(SevenZVerifier { bytes, name: Some(name) }))
}


pub fn probe(bytes: &[u8], format: ArchiveFormat) -> AppResult<Probe> {
    match format {
        ArchiveFormat::Zip => probe_zip(bytes),
        ArchiveFormat::SevenZ => probe_7z(bytes),
        ArchiveFormat::Rar => Ok(Probe {
            entries: Vec::new(),
            any_encrypted: true,
            scheme: Some("RAR".to_string()),
            header_encrypted: false,
        }),
    }
}

pub fn build_verifier(
    bytes: Arc<Vec<u8>>,
    format: ArchiveFormat,
    entry: Option<&str>,
) -> AppResult<Box<dyn PasswordVerifier>> {
    match format {
        ArchiveFormat::Zip => build_zip_verifier(bytes, entry),
        ArchiveFormat::SevenZ => build_7z_verifier(bytes, entry),
        ArchiveFormat::Rar => Err(AppError::Rar(
            "RAR password recovery is not supported (only ZIP and 7z can be cracked).".into(),
        )),
    }
}


#[allow(dead_code)]
pub fn first_candidate(src: &mut dyn CandidateSource) -> Option<String> {
    let mut out = Vec::new();
    src.next_batch(1, &mut out);
    out.into_iter().next()
}
