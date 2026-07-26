

use std::fs;
use std::io::Write;
use std::path::PathBuf;

use zarchiveforge_lib::testing::{
    create_archive, extract_archive, ArchiveFormat, CompressionLevel, CreateRequest, EncScheme,
    ExtractRequest,
};

fn scratch(name: &str) -> PathBuf {
    let mut dir = std::env::temp_dir();
    dir.push(format!("zaf_xtest_{}_{}", std::process::id(), name));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn write_file(path: &PathBuf, contents: &[u8]) {
    let mut f = fs::File::create(path).unwrap();
    f.write_all(contents).unwrap();
}

fn make_archive(dir: &PathBuf, format: ArchiveFormat, password: Option<&str>) -> PathBuf {
    let payload = dir.join("hello.txt");
    write_file(&payload, b"round-trip me");
    let ext = format.extension();
    let output = dir.join(format!("bundle.{ext}"));
    create_archive(CreateRequest {
        inputs: vec![payload],
        output: output.clone(),
        format,
        encryption: if password.is_some() { EncScheme::Aes256 } else { EncScheme::None },
        level: CompressionLevel::Normal,
        password: password.map(|p| p.to_string()),
        rar_path: None,
    })
    .expect("create should succeed");
    output
}

#[test]
fn zip_aes_extract_roundtrip() {
    let dir = scratch("zip_aes");
    let archive = make_archive(&dir, ArchiveFormat::Zip, Some("hunter2"));
    let dest = dir.join("out");

    let res = extract_archive(ExtractRequest {
        archive,
        dest: dest.clone(),
        password: Some("hunter2".into()),
    })
    .expect("extract should succeed");

    assert_eq!(res.files, 1);
    let extracted = fs::read_to_string(dest.join("hello.txt")).unwrap();
    assert_eq!(extracted, "round-trip me");
}

#[test]
fn zip_wrong_password_fails() {
    let dir = scratch("zip_wrong");
    let archive = make_archive(&dir, ArchiveFormat::Zip, Some("correct"));
    let dest = dir.join("out");

    let err = extract_archive(ExtractRequest {
        archive,
        dest,
        password: Some("nope".into()),
    })
    .unwrap_err();
    assert!(err.to_string().to_lowercase().contains("password"), "got: {err}");
}

#[test]
fn sevenz_aes_extract_roundtrip() {
    let dir = scratch("7z_aes");
    let archive = make_archive(&dir, ArchiveFormat::SevenZ, Some("s3cret"));
    let dest = dir.join("out");

    let res = extract_archive(ExtractRequest {
        archive,
        dest: dest.clone(),
        password: Some("s3cret".into()),
    })
    .expect("extract should succeed");

    assert_eq!(res.files, 1);
    let extracted = fs::read_to_string(dest.join("hello.txt")).unwrap();
    assert_eq!(extracted, "round-trip me");
}

#[test]
fn zip_none_extract_roundtrip() {
    let dir = scratch("zip_none");
    let archive = make_archive(&dir, ArchiveFormat::Zip, None);
    let dest = dir.join("out");

    let res = extract_archive(ExtractRequest {
        archive,
        dest: dest.clone(),
        password: None,
    })
    .expect("extract should succeed");

    assert_eq!(res.files, 1);
    assert!(dest.join("hello.txt").exists());
}
