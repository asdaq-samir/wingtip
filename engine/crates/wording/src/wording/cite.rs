//! A rule's citation as the documents library opens it: the text the app shows ("14 CFR 91.155;
//! AIM 7-1-5", a Go / No-Go finding's why, a Class B's entry rule) cut into pieces, each cited
//! regulation, AIM paragraph or advisory circular among them named by the document that holds it and
//! the place in it. The engine's own cite strings stay where each rule states them, once; this reads
//! them, so no screen keeps a copy of where a rule lives (docs/decisions/0057-documents-library.md).
//!
//! The forms read are the ones the FAA writes and the engine's texts use:
//! - "14 CFR 91.155", "14 CFR 91.211(a)(1)", "49 CFR 830.5", "14 CFR part
//!   61", "§ 91.103", and a list or range after one ("14 CFR 91.133,
//!   91.137, 91.141", "91.129-91.131"), each section its own link;
//! - a bare section where the text has named a title already
//!   ("... (14 CFR 91.151); under IFR ... (91.167)") or where a paragraph
//!   follows at once ("61.56(c)"), and never a bare figure alone, which may
//!   be a frequency (121.5) or hours (61.5);
//! - "Part 91" or "part 135", 14 CFR's part by its number;
//! - "AIM 7-1-5" and a list after it ("AIM 7-1-5, 7-1-6");
//! - "AC 61-65K", "AC 00-54": the circular by its number, without the
//!   edition's letter, so a link outlives a new edition.
//!
//! A document is named `cfr-<title>-<part>` (14 CFR part 91 "cfr-14-91";
//! NTSB 830, which is 49 CFR's, "cfr-49-830"), `aim`, or `ac-<number>`
//! ("ac-61-65"); the planner's library names its documents the same way
//! (wingtip.library_catalog), and the app links only what it holds.

/// Where a piece of text points.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cite {
    /// "cfr", "aim" or "ac".
    pub kind: &'static str,
    /// The document: "cfr-14-91", "aim", "ac-61-65".
    pub doc: String,
    /// The place in it: a CFR section ("91.155"), an AIM paragraph
    /// ("7-1-5"); none for a whole part or circular.
    pub at: Option<String>,
    /// A CFR section's paragraph as written, "(a)(1)".
    pub paragraph: Option<String>,
}

/// A run of the text, cited or not; the pieces in order are the text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Piece<'a> {
    pub text: &'a str,
    pub cite: Option<Cite>,
}

fn digits(b: &[u8], at: usize, most: usize) -> usize {
    b[at..].iter().take(most).take_while(|c| c.is_ascii_digit()).count()
}

/// Whether `at` starts a word (nothing, or no letter or figure, before it).
fn starts_word(b: &[u8], at: usize) -> bool {
    at == 0 || !(b[at - 1].is_ascii_alphanumeric() || b[at - 1] == b'.')
}

/// Whether `at` ends a word: nothing, or no letter or figure, after it.
fn ends_word(b: &[u8], at: usize) -> bool {
    at >= b.len() || !b[at].is_ascii_alphanumeric()
}

/// A section "91.155" at `at`: (its length, its part).
fn section(b: &[u8], at: usize) -> Option<(usize, &str)> {
    let part = digits(b, at, 3);
    if part == 0 || b.get(at + part) != Some(&b'.') {
        return None;
    }
    let sec = digits(b, at + part + 1, 4);
    if sec == 0 {
        return None;
    }
    let mut end = at + part + 1 + sec;
    // A lettered section, "91.1a" (rare, but 14 CFR has some).
    if b.get(end).is_some_and(|c| c.is_ascii_lowercase()) && ends_word(b, end + 1) {
        end += 1;
    }
    if !ends_word(b, end) && b.get(end) != Some(&b'(') {
        return None;
    }
    // A decimal that runs on is a figure, not a section: "91.155.3".
    if b.get(end) == Some(&b'.') && b.get(end + 1).is_some_and(u8::is_ascii_digit) {
        return None;
    }
    Some((end - at, std::str::from_utf8(&b[at..at + part]).ok()?))
}

/// The paragraphs after a section, "(a)(1)(ii)": their length.
fn paragraphs(b: &[u8], at: usize) -> usize {
    let mut end = at;
    while b.get(end) == Some(&b'(') {
        let inner = b[end + 1..].iter().take(5).take_while(|c| c.is_ascii_alphanumeric()).count();
        if inner == 0 || b.get(end + 1 + inner) != Some(&b')') {
            break;
        }
        end += inner + 2;
    }
    end - at
}

/// An AIM paragraph "7-1-5" at `at`: its length.
fn aim_paragraph(b: &[u8], at: usize) -> Option<usize> {
    let mut end = at;
    for i in 0..3 {
        let n = digits(b, end, 2);
        if n == 0 {
            return None;
        }
        end += n;
        if i < 2 {
            if b.get(end) != Some(&b'-') {
                return None;
            }
            end += 1;
        }
    }
    ends_word(b, end).then_some(end - at)
}

/// An advisory circular's number "61-65K", "00-54", "90-100A", "91-21.1":
/// (its length, its number without the edition's letters).
fn circular(b: &[u8], at: usize) -> Option<(usize, String)> {
    let series = digits(b, at, 3);
    if series < 2 || b.get(at + series) != Some(&b'-') {
        return None;
    }
    let mut end = at + series + 1;
    let n = digits(b, end, 3);
    if n == 0 {
        return None;
    }
    end += n;
    if b.get(end) == Some(&b'.') && b.get(end + 1).is_some_and(u8::is_ascii_digit) {
        end += 1 + digits(b, end + 1, 2);
    }
    let number = std::str::from_utf8(&b[at..end]).ok()?.to_owned();
    end += b[end..].iter().take(2).take_while(|c| c.is_ascii_uppercase()).count();
    ends_word(b, end).then_some((end - at, number))
}

fn cfr(title: u32, part: &str, at: Option<&str>, paragraph: &str) -> Cite {
    let paragraph = (!paragraph.is_empty()).then(|| paragraph.to_owned());
    Cite { kind: "cfr", doc: format!("cfr-{title}-{part}"), at: at.map(str::to_owned), paragraph }
}

/// The title a bare part belongs to: NTSB 830 is 49 CFR's.
fn title_of(part: &str, context: Option<u32>) -> u32 {
    if part == "830" {
        49
    } else {
        context.unwrap_or(14)
    }
}

/// A list's next item after a cite, ", 91.137", " and 7-1-6",
/// "-91.131": the length of the words between.
fn joiner(b: &[u8], at: usize) -> usize {
    for sep in [", and ", ", or ", ", ", " and ", " or ", " through ", "-", "\u{2013}"] {
        if b[at..].starts_with(sep.as_bytes()) {
            return sep.len();
        }
    }
    0
}

/// A cite starting at `at`, its length; `title` the CFR title the text has
/// named so far, updated by a "14 CFR".
fn cite_at(b: &[u8], at: usize, title: &mut Option<u32>) -> Option<(usize, Cite)> {
    let rest = &b[at..];
    // "14 CFR 91.155(a)", "49 CFR 830.5", "14 CFR part 61".
    let t = digits(b, at, 2);
    if t > 0 && rest[t..].starts_with(b" CFR ") {
        let n: u32 = std::str::from_utf8(&rest[..t]).ok()?.parse().ok()?;
        let mut end = at + t + 5;
        if b[end..].starts_with(b"\xc2\xa7") {
            end += 2 + usize::from(b.get(end + 2) == Some(&b' '));
        }
        *title = Some(n);
        if let Some((len, part)) = section(b, end) {
            let p = paragraphs(b, end + len);
            let sec = std::str::from_utf8(&b[end..end + len]).ok()?;
            let para = std::str::from_utf8(&b[end + len..end + len + p]).ok()?;
            return Some((end + len + p - at, cfr(n, part, Some(sec), para)));
        }
        for word in [&b"part "[..], &b"Part "[..]] {
            if b[end..].starts_with(word) {
                let d = digits(b, end + 5, 3);
                if d > 0 && ends_word(b, end + 5 + d) {
                    let part = std::str::from_utf8(&b[end + 5..end + 5 + d]).ok()?;
                    return Some((end + 5 + d - at, cfr(n, part, None, "")));
                }
            }
        }
        return None;
    }
    // "§ 91.103", "§91.103".
    if rest.starts_with(b"\xc2\xa7") {
        let start = at + 2 + usize::from(b.get(at + 2) == Some(&b' '));
        let (len, part) = section(b, start)?;
        let p = paragraphs(b, start + len);
        let sec = std::str::from_utf8(&b[start..start + len]).ok()?;
        let para = std::str::from_utf8(&b[start + len..start + len + p]).ok()?;
        return Some((start + len + p - at, cfr(title_of(part, *title), part, Some(sec), para)));
    }
    // "Part 91", "part 135": 14 CFR's.
    if rest.starts_with(b"Part ") || rest.starts_with(b"part ") {
        let d = digits(b, at + 5, 3);
        if d > 0 && ends_word(b, at + 5 + d) {
            let part = std::str::from_utf8(&b[at + 5..at + 5 + d]).ok()?;
            return Some((5 + d, cfr(title_of(part, *title), part, None, "")));
        }
        return None;
    }
    // "AIM 7-1-5".
    if rest.starts_with(b"AIM ") {
        let len = aim_paragraph(b, at + 4)?;
        let para = std::str::from_utf8(&b[at + 4..at + 4 + len]).ok()?;
        return Some((4 + len, Cite { kind: "aim", doc: "aim".to_owned(), at: Some(para.to_owned()), paragraph: None }));
    }
    // "AC 61-65K".
    if rest.starts_with(b"AC ") {
        let (len, number) = circular(b, at + 3)?;
        return Some((3 + len, Cite { kind: "ac", doc: format!("ac-{number}"), at: None, paragraph: None }));
    }
    // A bare section: with a title named before it, or a paragraph after.
    let (len, part) = section(b, at)?;
    let p = paragraphs(b, at + len);
    // A part in the VHF band's figures (108 to 137: 121, 135) alone is a
    // frequency far more often than a section, "121.5": it needs its
    // paragraph, or its title written before it at once.
    let band = part.parse::<u32>().is_ok_and(|n| (108..=137).contains(&n));
    if p == 0 && (title.is_none() || band) {
        return None;
    }
    let sec = std::str::from_utf8(&b[at..at + len]).ok()?;
    let para = std::str::from_utf8(&b[at + len..at + len + p]).ok()?;
    Some((len + p, cfr(title_of(part, *title), part, Some(sec), para)))
}

/// A list's next item, of the same kind as `last`: a section after a CFR
/// cite, a paragraph after an AIM one.
fn next_in_list(b: &[u8], at: usize, last: &Cite, title: Option<u32>) -> Option<(usize, Cite)> {
    match last.kind {
        "cfr" => {
            let (len, part) = section(b, at)?;
            let p = paragraphs(b, at + len);
            let sec = std::str::from_utf8(&b[at..at + len]).ok()?;
            let para = std::str::from_utf8(&b[at + len..at + len + p]).ok()?;
            Some((len + p, cfr(title_of(part, title), part, Some(sec), para)))
        }
        "aim" => {
            let len = aim_paragraph(b, at)?;
            let para = std::str::from_utf8(&b[at..at + len]).ok()?;
            Some((len, Cite { at: Some(para.to_owned()), ..last.clone() }))
        }
        _ => None,
    }
}

/// `text` in pieces, each cite its own piece; the pieces' texts joined are
/// `text` again.
pub fn citations(text: &str) -> Vec<Piece<'_>> {
    let b = text.as_bytes();
    let mut pieces: Vec<Piece> = Vec::new();
    let mut title = None;
    let mut plain = 0;
    let mut i = 0;
    while i < b.len() {
        if !text.is_char_boundary(i) || !starts_word(b, i) {
            i += 1;
            continue;
        }
        let Some((len, mut last)) = cite_at(b, i, &mut title) else {
            i += 1;
            continue;
        };
        if plain < i {
            pieces.push(Piece { text: &text[plain..i], cite: None });
        }
        pieces.push(Piece { text: &text[i..i + len], cite: Some(last.clone()) });
        i += len;
        // A list after it, each item its own link, the words between plain.
        loop {
            let gap = joiner(b, i);
            let Some((more, cite)) = (gap > 0).then(|| next_in_list(b, i + gap, &last, title)).flatten() else {
                break;
            };
            pieces.push(Piece { text: &text[i..i + gap], cite: None });
            pieces.push(Piece { text: &text[i + gap..i + gap + more], cite: Some(cite.clone()) });
            i += gap + more;
            last = cite;
        }
        plain = i;
    }
    if plain < b.len() {
        pieces.push(Piece { text: &text[plain..], cite: None });
    }
    pieces
}

#[cfg(test)]
#[path = "cite_tests.rs"]
mod tests;
