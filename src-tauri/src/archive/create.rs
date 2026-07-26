

use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::format::{ArchiveFormat, CompressionLevel, EncScheme};
use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRequest {

    pub inputs: Vec<PathBuf>,

    pub output: PathBuf,
    pub format: ArchiveFormat,
    pub encryption: EncScheme,
    pub level: CompressionLevel,

    pub password: Option<String>,


    #[serde(default)]
    pub rar_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateResult {
    pub output: PathBuf,

    pub files: usize,

    pub bytes: u64,
}


struct Entry {

    abs: PathBuf,

    name: String,
    is_dir: bool,
}

pub fn create_archive(req: CreateRequest) -> AppResult<CreateResult> {
    if req.inputs.is_empty() {
        return Err(AppError::invalid("Select at least one file or folder."));
    }
    for input in &req.inputs {
        if !input.exists() {
            return Err(AppError::invalid(format!(
                "Input no longer exists: {}",
                input.display()
            )));
        }
    }


    let password = match req.encryption {
        EncScheme::Aes256 => {
            let pw = req.password.as_deref().unwrap_or("");
            if pw.is_empty() {
                return Err(AppError::invalid("A password is required for AES-256 encryption."));
            }
            Some(pw.to_string())
        }
        EncScheme::None => None,
    };

    if let Some(parent) = req.output.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let entries = collect_entries(&req.inputs)?;

    let files = match req.format {
        ArchiveFormat::Zip => create_zip(&entries, &req.output, req.encryption, password.as_deref(), req.level)?,
        ArchiveFormat::SevenZ => create_7z(&entries, &req.output, req.encryption, password.as_deref())?,
        ArchiveFormat::Rar => crate::archive::rar::create_rar(
            &req.inputs,
            &req.output,
            password.as_deref(),
            req.level,
            req.rar_path.as_deref(),
        )?,
    };

    let bytes = std::fs::metadata(&req.output).map(|m| m.len()).unwrap_or(0);
    Ok(CreateResult {
        output: req.output,
        files,
        bytes,
    })
}


fn collect_entries(inputs: &[PathBuf]) -> AppResult<Vec<Entry>> {
    let mut out = Vec::new();
    for input in inputs {
        let base = input
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .ok_or_else(|| AppError::invalid(format!("Invalid input path: {}", input.display())))?;

        if input.is_dir() {
            out.push(Entry { abs: input.clone(), name: base.clone(), is_dir: true });
            walk_dir(input, &base, &mut out)?;
        } else {
            out.push(Entry { abs: input.clone(), name: base, is_dir: false });
        }
    }
    Ok(out)
}

fn walk_dir(dir: &Path, prefix: &str, out: &mut Vec<Entry>) -> AppResult<()> {
    let mut children: Vec<_> = std::fs::read_dir(dir)?.collect::<Result<_, _>>()?;
    children.sort_by_key(|e| e.file_name());
    for child in children {
        let path = child.path();
        let name = child.file_name().to_string_lossy().to_string();
        let rel = format!("{prefix}/{name}");
        if path.is_dir() {
            out.push(Entry { abs: path.clone(), name: rel.clone(), is_dir: true });
            walk_dir(&path, &rel, out)?;
        } else {
            out.push(Entry { abs: path, name: rel, is_dir: false });
        }
    }
    Ok(())
}

fn create_zip(
    entries: &[Entry],
    output: &Path,
    enc: EncScheme,
    password: Option<&str>,
    level: CompressionLevel,
) -> AppResult<usize> {
    use zip::write::SimpleFileOptions;
    use zip::{AesMode, CompressionMethod, ZipWriter};

    let file = File::create(output)?;
    let mut zipw = ZipWriter::new(BufWriter::new(file));

    let method = match level {
        CompressionLevel::Store => CompressionMethod::Stored,
        _ => CompressionMethod::Deflated,
    };
    let clevel = level.zip_level();

    let mut files = 0usize;
    for e in entries {
        if e.is_dir {

            zipw.add_directory(format!("{}/", e.name), SimpleFileOptions::default())?;
            continue;
        }

        let mut opts = SimpleFileOptions::default().compression_method(method);
        if let Some(l) = clevel {
            opts = opts.compression_level(Some(l));
        }


        match enc {
            EncScheme::Aes256 => {
                let pw = password.expect("password validated for AES");
                zipw.start_file(&e.name, opts.with_aes_encryption(AesMode::Aes256, pw))?;
            }
            EncScheme::None => {
                zipw.start_file(&e.name, opts)?;
            }
        }

        let mut src = File::open(&e.abs)?;
        std::io::copy(&mut src, &mut zipw)?;
        files += 1;
    }

    zipw.finish()?;
    Ok(files)
}

fn create_7z(
    entries: &[Entry],
    output: &Path,
    enc: EncScheme,
    password: Option<&str>,
) -> AppResult<usize> {
    use sevenz_rust2::encoder_options::AesEncoderOptions;
    use sevenz_rust2::{ArchiveEntry, ArchiveWriter, EncoderMethod, Password};

    let mut writer = ArchiveWriter::create(output)?;

    if let EncScheme::Aes256 = enc {
        let pw = password.expect("password validated for AES");

        writer.set_content_methods(vec![
            AesEncoderOptions::new(Password::from(pw)).into(),
            EncoderMethod::LZMA2.into(),
        ]);
    }

    let mut files = 0usize;
    for e in entries {
        if e.is_dir {
            writer.push_archive_entry::<File>(ArchiveEntry::new_directory(&e.name), None)?;
        } else {
            let entry = ArchiveEntry::from_path(&e.abs, e.name.clone());
            writer.push_archive_entry(entry, Some(File::open(&e.abs)?))?;
            files += 1;
        }
    }

    writer.finish()?;
    Ok(files)
}
