use super::*;

/// The text in the phrases a recognizer's commas and semicolons mark
/// ("left two seven zero, three thousand"), a thousands comma ("3,000")
/// no break: figures in two phrases are two figures, where `tokens` reads
/// figures said in a row as one, as a recognizer that writes no commas
/// gives them.
pub fn phrases(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut now = String::new();
    for (i, &c) in chars.iter().enumerate() {
        let thousands = c == ','
            && i > 0
            && chars[i - 1].is_ascii_digit()
            && chars.get(i + 1..i + 4).is_some_and(|s| s.iter().all(|d| d.is_ascii_digit()));
        if (c == ',' || c == ';') && !thousands {
            out.push(std::mem::take(&mut now));
        } else {
            now.push(c);
        }
    }
    out.push(now);
    out.into_iter().filter(|p| !p.trim().is_empty()).collect()
}

/// The figures said in `text`, phrase by phrase (`phrases`), in order.
pub fn figures_by_phrase(text: &str) -> Vec<String> {
    phrases(text).iter().flat_map(|p| tokens(p)).filter_map(|t| t.num).collect()
}

/// The words, with each run of figures one number: "one two five point
/// three five" is 125.35, "three thousand five hundred" 3500, "one zero
/// thousand" 10000 (AIM 4-2-8, 4-2-9). After "thousand" only a "five
/// hundred" goes on: "seven thousand one zero minutes" is 7000 and 10.
pub fn tokens(text: &str) -> Vec<Token> {
    let words = words_of(text);
    let at = |k: usize| words.get(k).map(String::as_str);
    let is_number_word = |w: &str| is_digit(w) || teen(w).is_some() || tens(w).is_some() || is_numeral(w);
    let mut out = Vec::new();
    let mut i = 0;
    while i < words.len() {
        let w = words[i].as_str();
        if !is_number_word(w) {
            out.push(Token { word: w.to_owned(), num: None });
            i += 1;
            continue;
        }
        let mut s = String::new();
        let mut thousands: i64 = 0;
        let start = i;
        // A number written whole by the recognizer stands alone, but for a
        // thousand or a hundred after it.
        if is_numeral(w) && !(w.len() == 1 && is_ascii_digits(w)) {
            s = w.to_owned();
            i += 1;
        } else {
            while let Some(x) = at(i) {
                if is_digit(x) || (x == "oh" && !s.is_empty()) {
                    s.push(if x == "oh" { '0' } else { digit_of(x) });
                } else if let Some(t) = teen(x) {
                    s.push_str(t);
                } else if let Some(t) = tens(x) {
                    match at(i + 1) {
                        Some(next) if is_digit(next) && digit_of(next) != '0' => {
                            s.push(t);
                            s.push(digit_of(next));
                            i += 1;
                        }
                        _ => {
                            s.push(t);
                            s.push('0');
                        }
                    }
                } else {
                    break;
                }
                i += 1;
            }
        }
        if at(i) == Some("thousand") {
            thousands = s.parse::<i64>().unwrap_or(1) * 1000;
            s.clear();
            i += 1;
            match (at(i), at(i + 1)) {
                (Some(next), Some("hundred")) if is_digit(next) => {
                    thousands += (digit_of(next) as i64 - '0' as i64) * 100;
                    i += 2;
                }
                (Some(next), _) if next.len() == 3 && next.ends_with("00") && is_ascii_digits(next) => {
                    thousands += next.parse::<i64>().unwrap_or(0);
                    i += 1;
                }
                _ => {}
            }
        } else if at(i) == Some("hundred") && !s.is_empty() {
            thousands = s.parse::<i64>().unwrap_or(0) * 100;
            s.clear();
            i += 1;
        }
        if matches!(at(i), Some("point") | Some("decimal")) && at(i + 1).is_some_and(is_digit) && thousands == 0 {
            i += 1;
            let mut fraction = String::new();
            while let Some(x) = at(i) {
                if !is_digit(x) {
                    break;
                }
                fraction.push(digit_of(x));
                i += 1;
            }
            s = format!("{s}.{fraction}");
        }
        let num = if thousands != 0 { (thousands + s.parse::<i64>().unwrap_or(0)).to_string() } else { s };
        out.push(Token { word: words[start..i].join(" "), num: Some(num) });
    }
    out
}

/// Aviation's VHF voice band, 118.000 to 136.975 MHz (47 CFR 87.173(b)'s
/// table): a frequency out of it was misheard. A recognizer's "12535" is
/// 125.35.
pub fn frequency_of(num: &str) -> Option<String> {
    let (value, places) = if let Some((_, fraction)) = num.split_once('.') {
        (num.parse::<f64>().ok()?, fraction.len().max(1))
    } else if (5..=7).contains(&num.len())
        && num.starts_with('1')
        && matches!(num.as_bytes()[1], b'1' | b'2' | b'3')
        && is_ascii_digits(num)
    {
        (format!("{}.{}", &num[..3], &num[3..]).parse::<f64>().ok()?, (num.len() - 3).max(1))
    } else {
        return None;
    };
    ((118.0..=136.975).contains(&value)).then(|| format!("{value:.places$}"))
}

/// A beacon code: one of AIM 4-1-20's "4096 discrete codes, a four-digit
/// code designation" -- 8 to the fourth, so each figure 0 to 7.
pub(super) fn is_squawk(code: &str) -> bool {
    code.len() == 4 && code.bytes().all(|b| (b'0'..=b'7').contains(&b))
}

pub(super) const ALTITUDE_WORDS: &[&str] = &["climb", "maintain", "descend", "cruise", "expect"];
pub(super) const AFTER_ROUTE_MORE: &[&str] = &["squawk", "contact", "transponder"];
pub(super) const LIMIT_ENDS_MORE: &[&str] = &["via", "as", "then", "radar", "vectors", "direct", "fly", "heading"];
/// Words between places, not places: "then direct", "to".
pub(super) const BETWEEN: &[&str] = &["then", "direct", "to", "and", "thence", "via", "the"];
/// "Cleared ILS approach", "cleared visual": an approach, not a route.
pub(super) const APPROACH_WORDS: &[&str] = &["ils", "rnp", "rnav", "gps", "loc", "visual", "approach", "vor", "ndb"];
/// Whose a frequency is, said before it.
pub(super) const FACILITIES: &[&str] =
    &["departure", "center", "approach", "tower", "ground", "clearance", "information", "apron", "radio", "unicom", "director"];

pub(super) fn after_route(w: &str) -> bool {
    ALTITUDE_WORDS.contains(&w) || AFTER_ROUTE_MORE.contains(&w)
}

pub(super) fn limit_ends(w: &str) -> bool {
    after_route(w) || LIMIT_ENDS_MORE.contains(&w)
}

/// "departure" as the frequency's, not a SID's.
pub(super) fn is_facility(toks: &[Token], i: usize) -> bool {
    toks.get(i + 1).is_some_and(|n| n.num.is_some() || ["control", "frequency", "freq", "will", "is", "on"].contains(&n.word.as_str()))
}

/// An altitude at `i` (AIM 4-2-9), with how many tokens it took.
pub(super) fn altitude_at(toks: &[Token], i: usize) -> Option<(i64, usize)> {
    let word = |k: usize| toks.get(k).map(|t| t.word.as_str());
    let num = |k: usize| toks.get(k).and_then(|t| t.num.as_deref());
    if word(i) == Some("flight")
        && word(i + 1) == Some("level")
        && let Some(level) = num(i + 2).and_then(|n| n.parse::<f64>().ok())
    {
        return Some(((level * 100.0) as i64, 3));
    }
    if word(i) == Some("fl")
        && let Some(level) = num(i + 1).and_then(|n| n.parse::<f64>().ok())
    {
        return Some(((level * 100.0) as i64, 2));
    }
    let n = num(i)?;
    if n.contains('.') {
        return None;
    }
    let ft = n.parse::<i64>().ok()?;
    (500..60000).contains(&ft).then_some((ft, 1))
}
