

use super::candidate::CandidateSource;
use super::charset::mask_class;
use crate::error::{AppError, AppResult};

pub struct Mask {

    positions: Vec<Vec<char>>,
    pos: u64,
    total: Option<u64>,
}

impl Mask {
    pub fn parse(pattern: &str) -> AppResult<Self> {
        let mut positions: Vec<Vec<char>> = Vec::new();
        let mut it = pattern.chars().peekable();
        while let Some(c) = it.next() {
            if c == '?' {
                let token = it
                    .next()
                    .ok_or_else(|| AppError::invalid("Mask ends with a dangling '?'."))?;
                if token == '?' {
                    positions.push(vec!['?']);
                } else if let Some(set) = mask_class(token) {
                    positions.push(set);
                } else {
                    return Err(AppError::invalid(format!(
                        "Unknown mask token '?{token}' (use ?l ?u ?d ?s ?a)."
                    )));
                }
            } else {
                positions.push(vec![c]);
            }
        }

        if positions.is_empty() {
            return Err(AppError::invalid("Mask pattern is empty."));
        }

        let mut product: u128 = 1;
        for p in &positions {
            product = product.saturating_mul(p.len() as u128);
        }
        let total = if product <= u64::MAX as u128 { Some(product as u64) } else { None };

        Ok(Self { positions, pos: 0, total })
    }

    fn decode(&self, mut index: u128) -> Option<String> {

        if let Some(t) = self.total {
            if index >= t as u128 {
                return None;
            }
        }
        let mut buf = vec!['\0'; self.positions.len()];
        for (i, set) in self.positions.iter().enumerate().rev() {
            let base = set.len() as u128;
            buf[i] = set[(index % base) as usize];
            index /= base;
        }
        Some(buf.into_iter().collect())
    }
}

impl CandidateSource for Mask {
    fn total(&self) -> Option<u64> {
        self.total
    }

    fn position(&self) -> u64 {
        self.pos
    }

    fn seek(&mut self, index: u64) {
        self.pos = index;
    }

    fn next_batch(&mut self, n: usize, out: &mut Vec<String>) -> usize {
        let mut produced = 0;
        for _ in 0..n {
            match self.decode(self.pos as u128) {
                Some(s) => {
                    out.push(s);
                    self.pos += 1;
                    produced += 1;
                }
                None => break,
            }
        }
        produced
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_digit_mask() {
        let mut m = Mask::parse("?d?d").unwrap();
        assert_eq!(m.total(), Some(100));
        let mut out = Vec::new();
        m.next_batch(1000, &mut out);
        assert_eq!(out.len(), 100);
        assert_eq!(out[0], "00");
        assert_eq!(out[1], "01");
        assert_eq!(out[99], "99");
    }

    #[test]
    fn literals_and_classes() {
        let mut m = Mask::parse("pw?d").unwrap();
        assert_eq!(m.total(), Some(10));
        let mut out = Vec::new();
        m.next_batch(100, &mut out);
        assert_eq!(out[0], "pw0");
        assert_eq!(out[9], "pw9");
    }

    #[test]
    fn escaped_question_mark() {
        let m = Mask::parse("a??").unwrap();
        assert_eq!(m.total(), Some(1));
    }

    #[test]
    fn seek_matches_sequential() {
        let mut a = Mask::parse("?l?d").unwrap();
        let mut all = Vec::new();
        a.next_batch(1000, &mut all);
        let mut b = Mask::parse("?l?d").unwrap();
        b.seek(7);
        let mut rest = Vec::new();
        b.next_batch(1000, &mut rest);
        assert_eq!(&all[7..], &rest[..]);
    }
}
