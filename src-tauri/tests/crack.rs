

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;

use zarchiveforge_lib::testing::{
    build_verifier, checkpoint, create_archive, preview, probe, recover, ArchiveFormat,
    AttackConfig, BruteForce, CandidateSource, CompressionLevel, Checkpoint, Dictionary, EncScheme,
    CreateRequest,
};

fn scratch(name: &str) -> PathBuf {
    let mut dir = std::env::temp_dir();
    dir.push(format!("zaf_crack_{}_{}", std::process::id(), name));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn make_zip(dir: &PathBuf, password: &str) -> PathBuf {
    let secret = dir.join("secret.txt");
    let mut f = fs::File::create(&secret).unwrap();
    f.write_all(b"payload").unwrap();
    let out = dir.join("locked.zip");
    create_archive(CreateRequest {
        inputs: vec![secret],
        output: out.clone(),
        format: ArchiveFormat::Zip,
        encryption: EncScheme::Aes256,
        level: CompressionLevel::Normal,
        password: Some(password.into()),
        rar_path: None,
    })
    .unwrap();
    out
}

#[test]
fn zip_bruteforce_recovers_password() {
    let dir = scratch("bf");
    let archive = make_zip(&dir, "ba");
    let bytes = Arc::new(fs::read(&archive).unwrap());
    let verifier = build_verifier(bytes, ArchiveFormat::Zip, None).unwrap();

    let mut source = BruteForce::new("ab", 1, 2).unwrap();
    let found = recover(verifier.as_ref(), &mut source);
    assert_eq!(found.as_deref(), Some("ba"));

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn zip_dictionary_hit_and_miss() {
    let dir = scratch("dict");
    let archive = make_zip(&dir, "hunter2");
    let bytes = Arc::new(fs::read(&archive).unwrap());


    let wl = dir.join("words.txt");
    fs::write(&wl, "password\nletmein\nhunter2\nqwerty\n").unwrap();
    let verifier = build_verifier(bytes.clone(), ArchiveFormat::Zip, None).unwrap();
    let mut src = Dictionary::open(&wl).unwrap();
    assert_eq!(recover(verifier.as_ref(), &mut src).as_deref(), Some("hunter2"));


    let wl2 = dir.join("words2.txt");
    fs::write(&wl2, "password\nletmein\nqwerty\n").unwrap();
    let verifier2 = build_verifier(bytes, ArchiveFormat::Zip, None).unwrap();
    let mut src2 = Dictionary::open(&wl2).unwrap();
    assert_eq!(recover(verifier2.as_ref(), &mut src2), None);

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn sevenz_verifier_accepts_and_rejects() {
    let dir = scratch("7z");
    let secret = dir.join("s.txt");
    fs::write(&secret, b"seven").unwrap();
    let archive = dir.join("locked.7z");
    create_archive(CreateRequest {
        inputs: vec![secret],
        output: archive.clone(),
        format: ArchiveFormat::SevenZ,
        encryption: EncScheme::Aes256,
        level: CompressionLevel::Normal,
        password: Some("s3cret".into()),
        rar_path: None,
    })
    .unwrap();

    let bytes = Arc::new(fs::read(&archive).unwrap());
    let verifier = build_verifier(bytes, ArchiveFormat::SevenZ, None).unwrap();
    assert!(verifier.verify("s3cret"));
    assert!(!verifier.verify("wrong"));

    fs::remove_dir_all(&dir).ok();
}

#[test]
fn probe_detects_zip_aes() {
    let dir = scratch("probe");
    let archive = make_zip(&dir, "pw");
    let bytes = fs::read(&archive).unwrap();
    let p = probe(&bytes, ArchiveFormat::Zip).unwrap();
    assert!(p.any_encrypted);
    assert_eq!(p.scheme.as_deref(), Some("AES-256"));
    assert!(p.entries.iter().any(|e| e.name == "secret.txt" && e.encrypted));
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn dictionary_survives_non_utf8_lines() {
    let dir = scratch("dict_bin");
    let wl = dir.join("w.txt");
    let mut f = fs::File::create(&wl).unwrap();
    f.write_all(b"first\n").unwrap();
    f.write_all(&[0xff, b'x', b'\n']).unwrap();
    f.write_all(b"third\n").unwrap();
    drop(f);

    let mut src = Dictionary::open(&wl).unwrap();
    assert_eq!(src.total(), Some(3));
    let mut out = Vec::new();
    src.next_batch(10, &mut out);

    assert_eq!(out.len(), 3);
    assert_eq!(out[0], "first");
    assert_eq!(out[2], "third");
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn preview_matches_engine_order() {

    let (total, samples) = preview(
        &AttackConfig::Bruteforce { charset: "ab".into(), min_len: 1, max_len: 2 },
        6,
    )
    .unwrap();
    assert_eq!(total, Some(6));
    assert_eq!(samples, vec!["a", "b", "aa", "ab", "ba", "bb"]);


    let (mtotal, msamples) =
        preview(&AttackConfig::Mask { pattern: "?d?d".into() }, 3).unwrap();
    assert_eq!(mtotal, Some(100));
    assert_eq!(msamples, vec!["00", "01", "02"]);


    let dir = scratch("preview_dict");
    let wl = dir.join("w.txt");
    fs::write(&wl, "alpha\nbravo\ncharlie\n").unwrap();
    let (dtotal, dsamples) =
        preview(&AttackConfig::Dictionary { wordlist: wl }, 2).unwrap();
    assert_eq!(dtotal, Some(3));
    assert_eq!(dsamples, vec!["alpha", "bravo"]);
    fs::remove_dir_all(&dir).ok();
}

#[test]
fn checkpoint_roundtrip_and_resume() {
    let dir = scratch("ckpt");
    let cp = Checkpoint {
        job_id: "job-1".into(),
        archive: PathBuf::from("/tmp/a.zip"),
        entry: None,
        attack: AttackConfig::Bruteforce {
            charset: "abc".into(),
            min_len: 1,
            max_len: 3,
        },
        threads: Some(4),
        position: 5,
        tried: 5,
        created_at: 123,
    };
    let path = checkpoint::save(&dir, &cp).unwrap();
    assert!(path.exists());
    let loaded = checkpoint::load(&dir, "job-1").unwrap();
    assert_eq!(loaded.position, 5);
    assert_eq!(loaded.tried, 5);


    let mut full = BruteForce::new("abc", 1, 3).unwrap();
    let mut all = Vec::new();
    full.next_batch(1000, &mut all);
    let mut resumed = BruteForce::new("abc", 1, 3).unwrap();
    resumed.seek(loaded.position);
    let mut rest = Vec::new();
    resumed.next_batch(1000, &mut rest);
    assert_eq!(&all[5..], &rest[..]);

    let list = checkpoint::list(&dir);
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].job_id, "job-1");

    fs::remove_dir_all(&dir).ok();
}
