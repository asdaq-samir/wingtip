//! An ATC clearance as the phone heard it, read into its items -- the web
//! app's lib/clearance and lib/heardCall, here so the native app reads one
//! in the air with no signal. Both are held to the same fixtures
//! (apps/web/src/lib/fixtures/clearances.json and heardCalls.json; the
//! engine's tests/clearance.rs).
//!
//! AIM 4-4-3 lists what a clearance holds: its limit, its departure
//! procedure, the route, the altitudes, the frequency and the beacon code.
//! Figures are said one by one (AIM 4-2-7: "tree", "fife", "niner"), whole
//! thousands and hundreds as words (AIM 4-2-8: "one three thousand five
//! hundred"), flight levels by their figures (AIM 4-2-9), and "then as
//! filed" leaves the filed route after what was said (AIM 5-2-6).

use crate::json;

/// A word, or a number made of the figures said in a row.
#[derive(Clone, Debug, PartialEq)]
pub struct Token {
    pub word: String,
    pub num: Option<String>,
}

/// A part of the route, in the order it was said.
#[derive(Clone, Debug, PartialEq)]
pub enum Item {
    Vectors,
    Heading(i64),
    Airway(String),
    /// A SID ("departure") or a STAR ("arrival") by its name and number.
    Procedure {
        kind: &'static str,
        name: String,
        number: String,
        transition: Option<String>,
    },
    /// Words naming one place or more, to be found.
    Places(String),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Clearance {
    pub limit: Option<String>,
    pub route: Vec<Item>,
    pub as_filed: bool,
    pub maintain_ft: Option<i64>,
    pub maintain_limit: Option<String>,
    pub vfr: bool,
    pub expect_ft: Option<i64>,
    pub expect_min: Option<i64>,
    pub frequency: Option<String>,
    pub facility: Option<String>,
    pub squawk: Option<String>,
    pub class_b: bool,
}

/// The ICAO alphabet (AIM 4-2-7, TBL 4-2-7), as a recognizer writes it.
pub fn letter(w: &str) -> Option<char> {
    Some(match w {
        "alpha" | "alfa" => 'A',
        "bravo" => 'B',
        "charlie" => 'C',
        "delta" => 'D',
        "echo" => 'E',
        "foxtrot" => 'F',
        "golf" => 'G',
        "hotel" => 'H',
        "india" => 'I',
        "juliet" | "juliett" => 'J',
        "kilo" => 'K',
        "lima" => 'L',
        "mike" => 'M',
        "november" => 'N',
        "oscar" => 'O',
        "papa" => 'P',
        "quebec" => 'Q',
        "romeo" => 'R',
        "sierra" => 'S',
        "tango" => 'T',
        "uniform" => 'U',
        "victor" => 'V',
        "whiskey" | "whisky" => 'W',
        "xray" => 'X',
        "yankee" => 'Y',
        "zulu" => 'Z',
        _ => return None,
    })
}

/// A figure said one by one (AIM 4-2-7).
pub fn digit(w: &str) -> Option<char> {
    Some(match w {
        "zero" => '0',
        "one" => '1',
        "two" => '2',
        "three" | "tree" => '3',
        "four" | "fower" => '4',
        "five" | "fife" => '5',
        "six" => '6',
        "seven" => '7',
        "eight" | "ait" => '8',
        "nine" | "niner" => '9',
        _ => return None,
    })
}

/// An airway's number said whole (AIM 4-2-8: "Victor Twelve"), and minutes.
fn teen(w: &str) -> Option<&'static str> {
    Some(match w {
        "ten" => "10",
        "eleven" => "11",
        "twelve" => "12",
        "thirteen" => "13",
        "fourteen" => "14",
        "fifteen" => "15",
        "sixteen" => "16",
        "seventeen" => "17",
        "eighteen" => "18",
        "nineteen" => "19",
        _ => return None,
    })
}

fn tens(w: &str) -> Option<char> {
    Some(match w {
        "twenty" => '2',
        "thirty" => '3',
        "forty" => '4',
        "fifty" => '5',
        "sixty" => '6',
        "seventy" => '7',
        "eighty" => '8',
        "ninety" => '9',
        _ => return None,
    })
}

/// The letter each kind of airway is filed by, as said.
fn airway_letter(w: &str) -> Option<char> {
    Some(match w {
        "victor" | "v" => 'V',
        "tango" | "t" => 'T',
        "j" | "jay" | "juliet" | "juliett" => 'J',
        "q" | "quebec" => 'Q',
        _ => return None,
    })
}

pub(crate) fn is_ascii_digits(w: &str) -> bool {
    !w.is_empty() && w.bytes().all(|b| b.is_ascii_digit())
}

/// "125", "125.35": figures, a point and figures.
fn is_numeral(w: &str) -> bool {
    match w.split_once('.') {
        Some((a, b)) => is_ascii_digits(a) && is_ascii_digits(b),
        None => is_ascii_digits(w),
    }
}

fn is_digit(w: &str) -> bool {
    digit(w).is_some() || (w.len() == 1 && is_ascii_digits(w))
}

fn digit_of(w: &str) -> char {
    digit(w).unwrap_or_else(|| w.chars().next().unwrap_or('0'))
}

/// The words a recognizer wrote, lower case: runs of figures (with a
/// point between them) and runs of letters (with an apostrophe inside),
/// "x-ray" one word and "3,000" one number.
fn words_of(text: &str) -> Vec<String> {
    let lower = text.to_lowercase().replace("x-ray", "xray").replace("x ray", "xray");
    let chars: Vec<char> = lower.chars().collect();
    // "3,000": the comma between figures and three more is no break.
    let mut clean = String::with_capacity(chars.len());
    for (i, &c) in chars.iter().enumerate() {
        let thousands = c == ','
            && i > 0
            && chars[i - 1].is_ascii_digit()
            && chars.get(i + 1..i + 4).is_some_and(|s| s.iter().all(|d| d.is_ascii_digit()));
        if !thousands {
            clean.push(c);
        }
    }
    let c: Vec<char> = clean.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < c.len() {
        if c[i].is_ascii_digit() {
            let mut j = i;
            while j < c.len() && c[j].is_ascii_digit() {
                j += 1;
            }
            if j + 1 < c.len() && c[j] == '.' && c[j + 1].is_ascii_digit() {
                j += 1;
                while j < c.len() && c[j].is_ascii_digit() {
                    j += 1;
                }
            }
            out.push(c[i..j].iter().collect());
            i = j;
        } else if c[i].is_ascii_lowercase() {
            let mut j = i;
            while j < c.len() && c[j].is_ascii_lowercase() {
                j += 1;
            }
            if j + 1 < c.len() && c[j] == '\'' && c[j + 1].is_ascii_lowercase() {
                j += 1;
                while j < c.len() && c[j].is_ascii_lowercase() {
                    j += 1;
                }
            }
            out.push(c[i..j].iter().collect());
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

mod tokens;
pub use tokens::*;
mod route;
pub use route::*;
mod impl_clearance;
pub use impl_clearance::*;
mod cleared;
pub use cleared::*;
mod said;
pub use said::*;
