

use super::candidate::CandidateSource;
use super::charset::unique_chars;
use crate::error::{AppError, AppResult};

pub struct BruteForce {
    chars: Vec<char>,
    min_len: usize,


    counts: Vec<u128>,
    pos: u64,
    total: Option<u64>,
}

impl BruteForce {
    pub fn new(charset: &str, min_len: usize, max_len: usize) -> AppResult<Self> {
        let chars = unique_chars(charset);
        if chars.is_empty() {
            return Err(AppError::invalid("Brute-force needs a non-empty character set."));
        }
        if min_len == 0 || min_len > max_len {
            return Err(AppError::invalid("Invalid length range (need 1 ≤ min ≤ max)."));
        }
        if max_len > 24 {
            return Err(AppError::invalid("Maximum length is capped at 24."));
        }

        let base = chars.len() as u128;
        let mut counts = Vec::with_capacity(max_len - min_len + 1);
        let mut sum: u128 = 0;
        for len in min_len..=max_len {
            let c = base.checked_pow(len as u32).unwrap_or(u128::MAX);
            counts.push(c);
            sum = sum.saturating_add(c);
        }
        let total = if sum <= u64::MAX as u128 { Some(sum as u64) } else { None };

        Ok(Self {
            chars,
            min_len,
            counts,
            pos: 0,
            total,
        })
    }


    fn decode(&self, mut index: u128) -> Option<String> {
        let base = self.chars.len() as u128;
        for (offset, &count) in self.counts.iter().enumerate() {
            if index < count {
                let len = self.min_len + offset;
                let mut buf = vec!['\0'; len];

                for slot in buf.iter_mut().rev() {
                    *slot = self.chars[(index % base) as usize];
                    index /= base;
                }
                return Some(buf.into_iter().collect());
            }
            index -= count;
        }
        None
    }
}

impl CandidateSource for BruteForce {
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
    fn counts_two_digits() {
        let mut bf = BruteForce::new("0123456789", 2, 2).unwrap();
        assert_eq!(bf.total(), Some(100));
        let mut out = Vec::new();
        bf.next_batch(1000, &mut out);
        assert_eq!(out.len(), 100);
        assert_eq!(out[0], "00");
        assert_eq!(out[1], "01");
        assert_eq!(out[10], "10");
        assert_eq!(out[99], "99");
    }

    #[test]
    fn spans_length_range() {
        let mut bf = BruteForce::new("ab", 1, 2).unwrap();

        assert_eq!(bf.total(), Some(6));
        let mut out = Vec::new();
        bf.next_batch(100, &mut out);
        assert_eq!(out, vec!["a", "b", "aa", "ab", "ba", "bb"]);
    }

    #[test]
    fn seek_is_deterministic() {
        let mut a = BruteForce::new("abc", 1, 3).unwrap();
        let mut all = Vec::new();
        a.next_batch(1000, &mut all);

        let mut b = BruteForce::new("abc", 1, 3).unwrap();
        b.seek(5);
        let mut rest = Vec::new();
        b.next_batch(1000, &mut rest);
        assert_eq!(&all[5..], &rest[..]);
    }
}
