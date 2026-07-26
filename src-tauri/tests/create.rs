

use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;


use zarchiveforge_lib::testing::{create_archive, ArchiveFormat, CompressionLevel, CreateRequest, EncScheme};

fn scratch(name: &str) -> PathBuf {
    let mut dir = std::env::temp_dir();
    dir.push(format!("zaf_test_{}_{}", std::process::id(), name));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn write_file(path: &PathBuf, contents: &[u8]) {
    let mut f = fs::File::create(path).unwrap();
    f.write_all(contents).unwrap();
}

#[test]
fn zip_aes_roundtrip() {
    let dir = scratch("zip_aes");
    let secret = dir.join("secret.txt");
    write_file(&secret, b"top secret payload");
    let output = dir.join("out.zip");

    let res = create_archive(CreateRequest {
        inputs: vec![secret.clone()],
        output: output.clone(),
        format: ArchiveFormat::Zip,
        encryption: EncScheme::Aes256,
        level: CompressionLevel::Normal,
        password: Some("hunter2".into()),
        rar_path: None,
    })
    .expect("create should succeed");
    assert_eq!(res.files, 1);
    assert!(output.exists());


    let mut archive = zip::ZipArchive::new(fs::File::open(&output).unwrap()).unwrap();
    let mut f = archive.by_name_decrypt("secret.txt", b"hunter2").unwrap();
    let mut buf = String::new();
    f.read_to_string(&mut buf).unwrap();
    assert_eq!(buf, "top secret payload");
    drop(f);


    let wrong = archive.by_name_decrypt("secret.txt", b"nope");
    match wrong {
        Err(_) => {}
        Ok(mut f) => {
            let mut b = Vec::new();
            let _ = f.read_to_end(&mut b);
            assert_ne!(b, b"top secret payload");
        }
    }

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn zip_none_roundtrip_folder() {
    let dir = scratch("zip_none");
    let folder = dir.join("data");
    fs::create_dir_all(folder.join("sub")).unwrap();
    write_file(&folder.join("a.txt"), b"aaa");
    write_file(&folder.join("sub").join("b.txt"), b"bbb");
    let output = dir.join("out.zip");

    let res = create_archive(CreateRequest {
        inputs: vec![folder],
        output: output.clone(),
        format: ArchiveFormat::Zip,
        encryption: EncScheme::None,
        level: CompressionLevel::Best,
        password: None,
        rar_path: None,
    })
    .expect("create should succeed");
    assert_eq!(res.files, 2);

    let mut archive = zip::ZipArchive::new(fs::File::open(&output).unwrap()).unwrap();

    let mut f = archive.by_name("data/sub/b.txt").unwrap();
    let mut buf = String::new();
    f.read_to_string(&mut buf).unwrap();
    assert_eq!(buf, "bbb");

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn sevenz_aes_roundtrip() {
    let dir = scratch("7z_aes");
    let secret = dir.join("secret.txt");
    write_file(&secret, b"seven zip secret");
    let output = dir.join("out.7z");

    let res = create_archive(CreateRequest {
        inputs: vec![secret],
        output: output.clone(),
        format: ArchiveFormat::SevenZ,
        encryption: EncScheme::Aes256,
        level: CompressionLevel::Normal,
        password: Some("hunter2".into()),
        rar_path: None,
    })
    .expect("create should succeed");
    assert_eq!(res.files, 1);
    assert!(output.exists());


    let mut found = String::new();
    sevenz_rust2::decompress_file_with_password(
        &output,
        dir.join("extract"),
        sevenz_rust2::Password::from("hunter2"),
    )
    .expect("decrypt with correct password");
    let mut f = fs::File::open(dir.join("extract").join("secret.txt")).unwrap();
    f.read_to_string(&mut found).unwrap();
    assert_eq!(found, "seven zip secret");


    let bad = sevenz_rust2::decompress_file_with_password(
        &output,
        dir.join("extract_bad"),
        sevenz_rust2::Password::from("nope"),
    );
    assert!(bad.is_err(), "wrong password should not decrypt");

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn aes_requires_password() {
    let dir = scratch("no_pw");
    let secret = dir.join("s.txt");
    write_file(&secret, b"x");
    let err = create_archive(CreateRequest {
        inputs: vec![secret],
        output: dir.join("o.zip"),
        format: ArchiveFormat::Zip,
        encryption: EncScheme::Aes256,
        level: CompressionLevel::Normal,
        password: None,
        rar_path: None,
    });
    assert!(err.is_err());
    fs::remove_dir_all(&dir).ok();
}
