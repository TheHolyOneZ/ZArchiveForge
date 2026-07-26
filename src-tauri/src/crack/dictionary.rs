

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use super::candidate::CandidateSource;
use crate::error::AppResult;

pub struct Dictionary {
    path: PathBuf,
    reader: BufReader<File>,
    pos: u64,
    total: Option<u64>,
}

impl Dictionary {
    pub fn open(path: &Path) -> AppResult<Self> {
        let total = count_lines(path).ok();
        let reader = BufReader::new(File::open(path)?);
        Ok(Self {
            path: path.to_path_buf(),
            reader,
            pos: 0,
            total,
        })
    }

    fn reopen_and_skip(&mut self, lines: u64) -> AppResult<()> {
        let mut reader = BufReader::new(File::open(&self.path)?);
        let mut scratch = Vec::new();
        for _ in 0..lines {
            scratch.clear();

            if reader.read_until(b'\n', &mut scratch)? == 0 {
                break;
            }
        }
        self.reader = reader;
        self.pos = lines;
        Ok(())
    }
}


fn trim_eol(buf: &mut Vec<u8>) {
    if buf.last() == Some(&b'\n') {
        buf.pop();
        if buf.last() == Some(&b'\r') {
            buf.pop();
        }
    }
}

fn count_lines(path: &Path) -> std::io::Result<u64> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut count: u64 = 0;
    let mut buf = Vec::new();
    loop {
        buf.clear();

        let n = reader.read_until(b'\n', &mut buf)?;
        if n == 0 {
            break;
        }
        count += 1;
    }
    Ok(count)
}

impl CandidateSource for Dictionary {
    fn total(&self) -> Option<u64> {
        self.total
    }

    fn position(&self) -> u64 {
        self.pos
    }

    fn seek(&mut self, index: u64) {

        if index != self.pos {
            let _ = self.reopen_and_skip(index);
        }
    }

    fn next_batch(&mut self, n: usize, out: &mut Vec<String>) -> usize {
        let mut produced = 0;
        let mut buf: Vec<u8> = Vec::new();
        for _ in 0..n {
            buf.clear();


            match self.reader.read_until(b'\n', &mut buf) {
                Ok(0) => break,
                Ok(_) => {
                    trim_eol(&mut buf);
                    out.push(String::from_utf8_lossy(&buf).into_owned());
                    self.pos += 1;
                    produced += 1;
                }
                Err(_) => break,
            }
        }
        produced
    }
}
