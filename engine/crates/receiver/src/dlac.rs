//! DLAC, the 6-bit character set FIS-B's text is sent in (DO-358B, the
//! Data Link Application Coding; ARINC 620's 6-bit set): four characters
//! in three bytes, codes 1 to 26 the letters, 32 to 63 ASCII's space to
//! "?", 0 ETX, 29 the record separator, 30 a new line, and 28 a tab whose
//! next code is the number of spaces it stands for.

/// The characters codes 0 to 63 stand for, as dump978's decoder has them.
const CHARS: [char; 64] = {
    let mut t = ['\u{3}'; 64];
    let mut i = 1;
    while i <= 26 {
        t[i] = (b'A' + i as u8 - 1) as char;
        i += 1;
    }
    t[27] = '\u{1a}';
    t[28] = '\t';
    t[29] = '\u{1e}';
    t[30] = '\n';
    t[31] = '|';
    let mut i = 32;
    while i < 64 {
        t[i] = i as u8 as char;
        i += 1;
    }
    t
};

/// The record separator between reports in a text product.
pub const RS: char = '\u{1e}';
/// End of text.
pub const ETX: char = '\u{3}';

/// The text in DLAC bytes.
pub fn decode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 4 / 3);
    let mut tab = false;
    let bits = bytes.len() * 8;
    let mut at = 0;
    while at + 6 <= bits {
        let (byte, shift) = (at / 8, at % 8);
        let pair = (bytes[byte] as u16) << 8 | bytes.get(byte + 1).copied().unwrap_or(0) as u16;
        let code = (pair >> (10 - shift)) as usize & 0x3F;
        at += 6;
        if tab {
            out.extend(std::iter::repeat_n(' ', code));
            tab = false;
        } else if code == 28 {
            tab = true;
        } else {
            out.push(CHARS[code]);
        }
    }
    out
}

/// Text written as DLAC, for the tests and fixtures: upper-case letters,
/// space to "?", the record separator and new line; anything else as "?".
pub fn encode(text: &str) -> Vec<u8> {
    let codes: Vec<u8> = text
        .chars()
        .map(|c| match c {
            'A'..='Z' => c as u8 - b'A' + 1,
            ' '..='?' => c as u8,
            RS => 29,
            '\n' => 30,
            ETX => 0,
            _ => b'?',
        })
        .collect();
    pack(&codes)
}

/// Six-bit codes packed four to three bytes, the first in the top bits.
fn pack(codes: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; (codes.len() * 6).div_ceil(8)];
    for (i, code) in codes.iter().enumerate() {
        for b in 0..6 {
            if code >> (5 - b) & 1 == 1 {
                let bit = i * 6 + b;
                out[bit / 8] |= 0x80 >> (bit % 8);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_tabs() {
        let text = "METAR KORD 091453Z 27012KT 10SM FEW050 08/M02 A3012=";
        assert_eq!(decode(&encode(text)).trim_end_matches(ETX), text);
        // "A", a tab of three spaces, "B".
        assert_eq!(decode(&pack(&[1, 28, 3, 2])), "A   B");
    }
}
