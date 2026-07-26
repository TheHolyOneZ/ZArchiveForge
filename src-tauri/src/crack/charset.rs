

pub fn unique_chars(s: &str) -> Vec<char> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for c in s.chars() {
        if seen.insert(c) {
            out.push(c);
        }
    }
    out
}

pub const LOWER: &str = "abcdefghijklmnopqrstuvwxyz";
pub const UPPER: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
pub const DIGITS: &str = "0123456789";
pub const SYMBOLS: &str = "!@#$%^&*()-_=+[]{};:,.<>?/|~";


pub fn mask_class(token: char) -> Option<Vec<char>> {
    match token {
        'l' => Some(LOWER.chars().collect()),
        'u' => Some(UPPER.chars().collect()),
        'd' => Some(DIGITS.chars().collect()),
        's' => Some(SYMBOLS.chars().collect()),
        'a' => Some(unique_chars(&format!("{LOWER}{UPPER}{DIGITS}{SYMBOLS}"))),
        _ => None,
    }
}
