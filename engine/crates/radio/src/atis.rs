//! An ATIS or AWOS/ASOS broadcast as the phone's recognizer wrote it,
//! read into its figures -- the web app's lib/atis and the native app's
//! Atis, both held to the same fixture (apps/web/src/lib/fixtures/atis.json;
//! engine/facade/tests/atis.rs), so the phone at the hold-short line reads
//! one with no signal.
//!
//! AIM 4-1-13 (ATIS) says what a broadcast holds, in order: the airport's
//! name and the information letter, the time of the weather, the wind,
//! visibility, obstructions to vision, sky condition, temperature, dew
//! point, altimeter, the approaches and runways in use, NOTAMs and
//! "advise on initial contact you have information (letter)". JO
//! 7110.65's phraseology says how each figure is said: the wind as "WIND
//! (direction) AT (speed)", with "GUSTS (speed)", "WIND VARIABLE AT
//! (speed)" or "WIND CALM" (2-6-6, Reporting Weather Conditions); the
//! visibility as "VISIBILITY (value)" in statute miles and fractions; the
//! altimeter as "ALTIMETER (setting)" figure by figure (2-7-2); the sky as
//! the METAR's layers read out, "FEW CLOUDS AT (height)", "CEILING
//! (height) BROKEN", "SKY CLEAR". An AWOS or ASOS says the same figures
//! itself (AIM 7-1-11, Weather Observing Programs), with "automated
//! weather observation" in place of a letter and "temperature (value)
//! Celsius". Figures are said one by one (AIM 4-2-7: "niner"), whole
//! thousands and hundreds as words (AIM 4-2-8), which the clearance
//! reader's tokens already join into numbers, as a recognizer that wrote
//! "29.92" or "4,500" itself is read the same way.

use crate::clearance::{letter, tokens, Token};
use crate::json;

/// The wind as said: from where (magnetic, AIM 7-1-10: "reported relative to magnetic north
/// in ATIS as well as ASOS and AWOS radio (voice) broadcasts"), how fast, its gusts, and
/// whether it is variable.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Wind {
    pub from_deg: Option<i64>,
    pub kt: Option<i64>,
    pub gust_kt: Option<i64>,
    pub variable: bool,
}

/// One cloud layer: its cover in the METAR's words (clear, few,
/// scattered, broken, overcast, obscured) and its base above the ground.
#[derive(Clone, Debug, PartialEq)]
pub struct Layer {
    pub cover: &'static str,
    pub base_ft: Option<i64>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Atis {
    pub information: Option<char>,
    /// "1852Z".
    pub time_z: Option<String>,
    pub wind: Option<Wind>,
    pub visibility_sm: Option<f64>,
    /// Less than `visibility_sm`: "less than one quarter", a METAR's
    /// "M1/4SM" (FMH-1 chapter 6), said as such, never as a quarter mile.
    pub visibility_minus: bool,
    pub sky: Vec<Layer>,
    pub temp_c: Option<i64>,
    pub dewpoint_c: Option<i64>,
    pub altimeter_inhg: Option<f64>,
    /// "ILS runway 19R", "visual", "RNAV GPS runway 7".
    pub approach: Option<String>,
    pub landing: Vec<String>,
    pub departing: Vec<String>,
    /// What else was said, a clause each: NOTAMs, the weather in sight,
    /// the density altitude.
    pub remarks: Vec<String>,
    pub raw: String,
}

/// A word a leftover run is trimmed of at either end, and that makes no
/// remark on its own: the broadcast's connectives and units.
const FILLER: &[&str] = &[
    "and", "at", "the", "a", "an", "is", "are", "in", "on", "to", "of", "with", "this", "that", "for", "or", "weather", "observation",
    "observations", "special", "automated", "degrees", "celsius", "knots", "knot", "miles", "mile", "statute", "sky", "condition",
    "conditions", "time", "expect", "greater", "more", "than", "less", "use", "airport", "information", "zulu", "z", "utc", "wind",
    "winds", "visibility", "temperature", "dew", "dewpoint", "point", "altimeter", "setting", "runway", "runways", "clouds", "cloud",
    "layer", "notams", "notam", "notices", "notice", "airmen", "all", "aircraft", "please", "readback", "read", "back", "hold", "short",
    "instructions", "advise", "initial", "contact", "you", "have", "received", "departure", "arrival", "ground", "tower", "frequency",
    "clearance", "delivery", "available",
];

/// A word in a one-word run worth keeping: the weather in sight, which
/// an ATIS says between the visibility and the sky (AIM 4-1-13).
const PHENOMENA: &[&str] = &[
    "mist", "haze", "fog", "rain", "snow", "drizzle", "thunderstorm", "thunderstorms", "smoke", "showers", "sleet", "hail", "squalls",
    "dust", "sand",
];

/// The kind of approach, as said, and as written.
fn approach_kind(w: &str) -> Option<&'static str> {
    Some(match w {
        "ils" => "ILS",
        "rnav" => "RNAV",
        "gps" => "GPS",
        "rnp" => "RNP",
        "vor" => "VOR",
        "ndb" => "NDB",
        "lda" => "LDA",
        "loc" | "localizer" => "localizer",
        "visual" | "visuals" => "visual",
        _ => return None,
    })
}

fn cover_of(w: &str) -> Option<&'static str> {
    Some(match w {
        "few" => "few",
        "scattered" => "scattered",
        "broken" => "broken",
        "overcast" => "overcast",
        "obscured" => "obscured",
        _ => return None,
    })
}

/// A whole number said, as an integer; none for "29.92".
fn int_of(t: &Token) -> Option<i64> {
    t.num.as_deref().filter(|n| !n.contains('.')).and_then(|n| n.parse().ok())
}

/// The reading in progress: the tokens, and which of them a figure took.
struct Read<'a> {
    toks: &'a [Token],
    used: Vec<bool>,
    out: Atis,
}

impl Read<'_> {
    fn word(&self, i: usize) -> &str {
        self.toks.get(i).map(|t| t.word.as_str()).unwrap_or("")
    }

    fn int(&self, i: usize) -> Option<i64> {
        self.toks.get(i).and_then(int_of)
    }

    fn num(&self, i: usize) -> Option<&str> {
        self.toks.get(i).and_then(|t| t.num.as_deref())
    }

    fn take(&mut self, from: usize, to: usize) {
        for k in from..to.min(self.toks.len()) {
            self.used[k] = true;
        }
    }

    /// The letter at `i` ("charlie", or a recognizer's bare "c").
    fn letter_at(&self, i: usize) -> Option<char> {
        let w = self.word(i);
        letter(w).or_else(|| (w.len() == 1 && w.as_bytes()[0].is_ascii_lowercase()).then(|| w.to_ascii_uppercase().chars().next().unwrap()))
    }

    /// A runway's ident at `i`: its number, 1 to 36, and its side.
    fn runway_at(&self, i: usize) -> Option<(String, usize)> {
        let n = self.int(i).filter(|n| (1..=36).contains(n))?;
        // A runway's figures are said one by one ("one niner right"), so a
        // number with a point in it, or a 4-figure time, is not one.
        if self.num(i).is_some_and(|s| s.len() > 2) {
            return None;
        }
        let side = match self.word(i + 1) {
            "left" | "l" => "L",
            "right" | "r" => "R",
            "center" | "centre" | "c" => "C",
            _ => "",
        };
        Some((format!("{n}{side}"), i + if side.is_empty() { 1 } else { 2 }))
    }

    /// A visibility at `i` in statute miles: "one zero", "two and one
    /// half", "three quarters", "less than one quarter", "2.5"; and
    /// whether it was "less than" it.
    fn visibility_at(&self, i: usize) -> Option<(f64, bool, usize)> {
        let mut j = i;
        let mut less = false;
        while matches!(self.word(j), "is" | "less" | "than" | "a") {
            less |= self.word(j) == "less";
            j += 1;
        }
        let frac = |j: usize, whole: f64| -> Option<(f64, usize)> {
            match self.word(j + 1) {
                "half" => Some((whole / 2.0, j + 2)),
                "quarter" | "quarters" => Some((whole / 4.0, j + 2)),
                _ => None,
            }
        };
        let (mut v, mut j) = if let Some(n) = self.num(j) {
            let n: f64 = n.parse().ok()?;
            frac(j, n).unwrap_or((n, j + 1))
        } else if matches!(self.word(j), "half" | "quarter") {
            (if self.word(j) == "half" { 0.5 } else { 0.25 }, j + 1)
        } else {
            return None;
        };
        if self.word(j) == "and"
            && let Some((f, k)) = self.num(j + 1).and_then(|n| n.parse::<f64>().ok()).and_then(|n| frac(j + 1, n))
        {
            v += f;
            j = k;
        }
        while matches!(self.word(j), "statute" | "miles" | "mile" | "sm") {
            j += 1;
        }
        Some((v, less, j))
    }

    /// A temperature at `i`: "one eight", "minus zero three", "18 celsius".
    fn celsius_at(&self, i: usize) -> Option<(i64, usize)> {
        let mut j = i;
        if self.word(j) == "is" {
            j += 1;
        }
        let sign = if matches!(self.word(j), "minus" | "negative") {
            j += 1;
            -1
        } else {
            1
        };
        let n = self.int(j)?;
        j += 1;
        while matches!(self.word(j), "celsius" | "degrees") {
            j += 1;
        }
        Some((sign * n, j))
    }

    fn wind(&mut self, i: usize) -> usize {
        let mut j = i + 1;
        while matches!(self.word(j), "is" | "from") {
            j += 1;
        }
        let mut w = Wind::default();
        match self.word(j) {
            "calm" => {
                w.kt = Some(0);
                j += 1;
            }
            "light" if self.word(j + 1) == "and" && self.word(j + 2) == "variable" => {
                w.variable = true;
                j += 3;
            }
            "variable" => {
                w.variable = true;
                j += 1;
            }
            _ => {
                let Some(from) = self.int(j).filter(|n| (0..=360).contains(n)) else { return i + 1 };
                w.from_deg = Some(from);
                j += 1;
                if self.word(j) == "degrees" {
                    j += 1;
                }
            }
        }
        if self.word(j) == "at"
            && let Some(kt) = self.int(j + 1)
        {
            w.kt = Some(kt);
            j += 2;
            if self.word(j) == "knots" {
                j += 1;
            }
        }
        if matches!(self.word(j), "gust" | "gusts" | "gusting") {
            let mut k = j + 1;
            if self.word(k) == "to" {
                k += 1;
            }
            if let Some(g) = self.int(k) {
                w.gust_kt = Some(g);
                j = k + 1;
                if self.word(j) == "knots" {
                    j += 1;
                }
            }
        }
        // "variable between one eight zero and two four zero": the wind's
        // direction varies, which the METAR writes as 180V240.
        if self.word(j) == "variable"
            && self.word(j + 1) == "between"
            && self.int(j + 2).is_some()
            && self.word(j + 3) == "and"
            && self.int(j + 4).is_some()
        {
            w.variable = true;
            j += 5;
        }
        // "wind zero zero zero at zero" is calm (the METAR's 00000KT).
        if w.kt == Some(0) {
            w.from_deg = None;
        }
        self.take(i, j);
        self.out.wind = Some(w);
        j
    }
}

mod entry;
mod reading;
pub use entry::*;
mod render;
pub(crate) use render::*;
