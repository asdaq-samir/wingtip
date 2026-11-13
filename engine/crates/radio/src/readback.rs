//! The pilot's readback of a clearance or instruction checked against it.
//! AIM 4-4-7 b: "Pilots of airborne aircraft should read back those parts
//! of ATC clearances and instructions containing altitude assignments,
//! vectors, or runway assignments"; b.1 "Include the aircraft
//! identification in all readbacks and acknowledgments"; b.2 "Read back
//! altitudes, altitude restrictions, and vectors in the same sequence as
//! they are given". Those are marked `required`. The rest -- the limit,
//! the places of the route, a direct, a hold, the frequency, the code and
//! the altimeter -- pilots read back as good practice, not because 4-4-7
//! asks it, and a miss there is said as one but not `required`. (This
//! comment cited "4-4-7 b.3 the altimeter, frequencies and codes" before
//! 2026-11-09; the current AIM's b.3 is about charted altitudes.)
//!
//! Each item as the clearance and instruction readers find it in the
//! readback (crate::clearance, crate::instruction) or, said bare as a
//! readback often is ("five thousand, one two five point three five, four
//! five one two"), as its figures among the readback's. What was missed
//! or said differently is a warning on the card and in the microphone's
//! pill; it never stops anything. Asked as `readback_check` (crate::atc);
//! held to apps/web/src/lib/fixtures/readbacks.json (the engine's
//! tests/clearance.rs and tests/atc.rs).

use crate::callsign;
use crate::clearance::{figures_by_phrase, place_words, read, tokens, Clearance, Item};
use crate::instruction::{self, Item as Said};
use crate::json;

/// One item missed or said differently: which, what was cleared, and
/// what was said (None where it was not read back).
#[derive(Clone, Debug, PartialEq)]
pub struct Missed {
    pub item: &'static str,
    pub cleared: String,
    pub said: Option<String>,
    /// AIM 4-4-7 b asks for it: an altitude, a vector, a runway, the call
    /// sign, the order of altitudes and vectors.
    pub required: bool,
}

/// The items AIM 4-4-7 b asks be read back: altitude assignments (an
/// altitude to expect is one), vectors, runway assignments (an approach
/// names its runway), b.1 the call sign and b.2 the order.
pub fn required(item: &str) -> bool {
    matches!(item, "altitude" | "expect" | "heading" | "runway" | "approach" | "call sign" | "order")
}

fn missed(item: &'static str, cleared: String, said: Option<String>) -> Missed {
    Missed { item, cleared, said, required: required(item) }
}

/// A whole number with its thousands grouped ("4,000"), as the web's
/// lib/format grouped writes one (core's text).
pub fn grouped(n: i64) -> String {
    crate::text::grouped_int(n)
}

/// An altitude as ATC says it (AIM 4-2-9): feet below 18,000, a flight
/// level from there up.
pub fn altitude_words(ft: i64) -> String {
    if ft as f64 >= wingtip_flight::limits::FLIGHT_LEVELS_FROM_FT {
        format!("FL{}", (ft as f64 / 100.0).round() as i64)
    } else {
        format!("{} ft", grouped(ft))
    }
}

/// A heading as said, three figures (AIM 4-2-10: "heading one zero zero").
pub fn heading_words(deg: i64) -> String {
    format!("heading {deg:03}")
}

/// A place's words as they are compared: lower case, "the" and "airport"
/// left out.
fn place_key(said: &str) -> String {
    said.to_lowercase().split_whitespace().filter(|w| *w != "the" && *w != "airport").collect::<Vec<_>>().join(" ")
}

/// The items of `cleared` the readback `said` missed or had differently;
/// none where it matches: the clearance's own items (limit, route,
/// altitudes, frequency, code).
pub fn check(cleared: &Clearance, said: &str) -> Vec<Missed> {
    let back = read(said);
    let toks = tokens(said);
    // The figures as one run and phrase by phrase: "two seven zero, three
    // thousand" is 270 and 3000 where the recognizer wrote its comma.
    let by_phrase = figures_by_phrase(said);
    let figures: Vec<&str> = toks.iter().filter_map(|t| t.num.as_deref()).chain(by_phrase.iter().map(String::as_str)).collect();
    let words = format!(" {} ", place_key(&place_words(&toks)));
    let mut out = Vec::new();
    // A figure read bare counts as read back (a flight level as its own
    // figure, "flight level two one zero"); one the reader found counts
    // as what was said. Figures said one after another with no word
    // between are one figure to the tokens, as they are to a recognizer.
    let has_figure = |text: &str| figures.contains(&text);
    let bare_ft = |ft: i64| has_figure(&ft.to_string()) || (ft >= 18000 && has_figure(&(ft / 100).to_string()));
    let bare_text = |s: &str| has_figure(s);
    let mut figure_ft = |item: &'static str, cleared_ft: Option<i64>, said_ft: Option<i64>| {
        let Some(c) = cleared_ft else { return };
        let heard = said_ft.or(if bare_ft(c) { Some(c) } else { None });
        if heard != Some(c) {
            out.push(missed(item, altitude_words(c), heard.map(altitude_words)));
        }
    };
    figure_ft("altitude", cleared.maintain_ft, back.maintain_ft);
    figure_ft("expect", cleared.expect_ft, back.expect_ft);
    let mut figure_text = |item: &'static str, cleared_text: Option<&str>, said_text: Option<&str>| {
        let Some(c) = cleared_text else { return };
        let heard = said_text.or(if bare_text(c) { Some(c) } else { None });
        if heard != Some(c) {
            out.push(missed(item, c.to_owned(), heard.map(str::to_owned)));
        }
    };
    figure_text("frequency", cleared.frequency.as_deref(), back.frequency.as_deref());
    figure_text("squawk", cleared.squawk.as_deref(), back.squawk.as_deref());
    // The limit and the route first, as the web lists them: the order is
    // the warning line's.
    let mut first = Vec::new();
    if let Some(limit) = &cleared.limit {
        let key = place_key(limit);
        let heard = match &back.limit {
            Some(l) => Some(place_key(l)),
            None if words.contains(&format!(" {key} ")) => Some(key.clone()),
            None => None,
        };
        if heard.as_deref() != Some(key.as_str()) {
            first.push(missed("limit", limit.clone(), heard.and(back.limit.clone())));
        }
    }
    for item in &cleared.route {
        match item {
            Item::Places(said_places) => {
                for place in place_key(said_places).split(' ').filter(|p| !p.is_empty()) {
                    if !words.contains(&format!(" {place} ")) {
                        let cleared = if place.to_uppercase() == place { place.to_owned() } else { said_places.clone() };
                        first.push(missed("route", cleared, None));
                    }
                }
            }
            Item::Airway(ident) => {
                if !words.contains(&format!(" {} ", ident.to_lowercase())) {
                    first.push(missed("route", ident.clone(), None));
                }
            }
            Item::Heading(degrees) => {
                if !figures.contains(&degrees.to_string().as_str()) {
                    first.push(missed("route", format!("heading {degrees}"), None));
                }
            }
            Item::Vectors | Item::Procedure { .. } => {}
        }
    }
    first.extend(out);
    first
}

/// What a readback said, as the checks below look for it: its figures as
/// whole numbers and as said, its place words, its tokens' words.
struct Back {
    figures: Vec<String>,
    words: String,
    plain: Vec<String>,
}

impl Back {
    fn of(said: &str) -> Back {
        let toks = tokens(said);
        Back {
            figures: toks.iter().filter_map(|t| t.num.clone()).chain(figures_by_phrase(said)).collect(),
            words: format!(" {} ", place_key(&place_words(&toks))),
            plain: toks.iter().map(|t| t.word.clone()).collect(),
        }
    }

    /// A figure said, by its value: "zero niner zero" is 90, as is "90".
    fn number(&self, n: i64) -> bool {
        self.figures.iter().any(|f| !f.contains('.') && f.parse::<i64>().ok() == Some(n))
    }

    fn text(&self, s: &str) -> bool {
        self.figures.iter().any(|f| f == s)
    }

    fn place(&self, said: &str) -> bool {
        place_key(said).split(' ').filter(|p| !p.is_empty()).all(|p| self.words.contains(&format!(" {p} ")))
    }

    fn word(&self, w: &str) -> bool {
        self.plain.iter().any(|x| x == w)
    }
}

/// A runway as said back: its number and its side's word.
fn runway_back(back: &Back, runway: &str) -> bool {
    let digits: String = runway.chars().take_while(char::is_ascii_digit).collect();
    let side = match runway.chars().last() {
        Some('L') => Some("left"),
        Some('R') => Some("right"),
        Some('C') => Some("center"),
        _ => None,
    };
    digits.parse::<i64>().is_ok_and(|n| back.number(n)) && side.is_none_or(|w| back.word(w) || (w == "center" && back.word("centre")))
}

/// The instruction's items besides the clearance's own (crate::instruction):
/// a vector, a runway, an approach, a hold, a direct, the altimeter.
fn check_instruction(items: &[Said], cleared: &Clearance, said: &str) -> Vec<Missed> {
    let back = Back::of(said);
    let heard = instruction::read(said);
    let mut out = Vec::new();
    // A heading already in a clearance's route is checked with the route.
    let in_route = |deg: i64| cleared.route.contains(&Item::Heading(deg));
    let route_places: Vec<String> = cleared.place_runs().iter().map(|s| place_key(s)).collect();
    for item in items {
        match item {
            Said::Heading { deg: Some(d), .. } if !in_route(*d) => {
                if !back.number(*d) {
                    let other = heard.iter().find_map(|h| if let Said::Heading { deg: Some(x), .. } = h { Some(*x) } else { None });
                    out.push(missed("heading", heading_words(*d), other.map(heading_words)));
                }
            }
            Said::Heading { by_deg: Some(by), turn, .. } => {
                if !back.number(*by) {
                    out.push(missed("heading", format!("turn {} {by} degrees", turn.unwrap_or("")), None));
                }
            }
            Said::Runway { runway, .. } => {
                if !runway_back(&back, runway) {
                    out.push(missed("runway", format!("runway {runway}"), None));
                }
            }
            Said::Approach { name, runway, .. } => {
                let kind = name.split([' ', '(']).next().unwrap_or("").to_lowercase();
                let ok = runway.as_deref().is_none_or(|r| runway_back(&back, r))
                    && (kind.is_empty() || back.word(&kind) || (kind == "loc" && back.word("localizer")));
                if !ok {
                    let cleared = match runway {
                        Some(r) => format!("{name} runway {r}"),
                        None => name.clone(),
                    };
                    out.push(missed("approach", cleared, None));
                }
            }
            Said::Hold { fix, on, .. } => {
                let ok = back.place(fix) && on.is_none_or(|(_, d)| back.number(d));
                if !ok {
                    out.push(missed("hold", format!("hold at {fix}"), None));
                }
            }
            Said::Direct { said: place } if !route_places.contains(&place_key(place)) => {
                if !back.place(place) {
                    out.push(missed("direct", place.clone(), None));
                }
            }
            Said::Altimeter { inhg } if !(back.text(inhg) || back.text(&inhg.replace('.', ""))) => {
                out.push(missed("altimeter", inhg.clone(), None));
            }
            _ => {}
        }
    }
    out
}

/// Where an altitude or a vector was said back, as its figure's place.
fn first_figure(back: &[String], wanted: &[i64]) -> Option<usize> {
    back.iter().position(|f| !f.contains('.') && f.parse::<i64>().is_ok_and(|n| wanted.contains(&n)))
}

/// AIM 4-4-7 b.2: altitudes and vectors read back in the order given. Only
/// where both were given and both read back.
fn check_order(items: &[Said], said: &str) -> Option<Missed> {
    let alt_at = items.iter().position(|i| matches!(i, Said::Altitude { .. }))?;
    let vec_at = items.iter().position(|i| matches!(i, Said::Heading { deg: Some(_), .. } | Said::Heading { by_deg: Some(_), .. }))?;
    let ft = match &items[alt_at] {
        Said::Altitude { ft, .. } => *ft,
        _ => return None,
    };
    let deg = match &items[vec_at] {
        Said::Heading { deg: Some(d), .. } => *d,
        Said::Heading { by_deg: Some(b), .. } => *b,
        _ => return None,
    };
    let figures = figures_by_phrase(said);
    let alt_back = first_figure(&figures, &[ft, ft / 100])?;
    let vec_back = first_figure(&figures, &[deg])?;
    let given_alt_first = alt_at < vec_at;
    let said_alt_first = alt_back < vec_back;
    (given_alt_first != said_alt_first).then(|| {
        let order = |alt_first: bool| if alt_first { "altitude then heading" } else { "heading then altitude" }.to_owned();
        missed("order", order(given_alt_first), Some(order(said_alt_first)))
    })
}

/// Every item of what was `cleared` (a clearance or an instruction, as
/// heard) the readback `said` missed or had differently; with `tail`, the
/// call sign too (AIM 4-4-7 b.1), said at either end (AIM 4-2-3 c).
pub fn check_all(cleared_text: &str, said: &str, tail: Option<&str>) -> Vec<Missed> {
    let cleared = read(cleared_text);
    let items = instruction::read(cleared_text);
    let mut out = check(&cleared, said);
    out.extend(check_instruction(&items, &cleared, said));
    out.extend(check_order(&items, said));
    if let Some(tail) = tail.filter(|t| !t.trim().is_empty())
        && callsign::spans(said, tail).is_empty()
    {
        out.push(missed("call sign", tail.trim().to_uppercase(), None));
    }
    out
}

/// The warning line: "Readback: altitude 5,000 ft said, 4,000 ft cleared;
/// squawk 4512 not read back." -- or "Readback complete."
pub fn words(items: &[Missed]) -> String {
    if items.is_empty() {
        return "Readback complete.".to_owned();
    }
    fn name(item: &str) -> &str {
        match item {
            "limit" => "cleared to",
            other => other,
        }
    }
    let parts: Vec<String> = items
        .iter()
        .map(|i| match &i.said {
            None => format!("{} {} not read back", name(i.item), i.cleared),
            Some(said) => format!("{} {} said, {} cleared", name(i.item), said, i.cleared),
        })
        .collect();
    format!("Readback: {}.", parts.join("; "))
}

/// The check as JSON for the apps: `{"items": [{"item", "cleared",
/// "said", "required"}], "words"}`.
pub fn check_json(cleared_text: &str, said: &str, tail: Option<&str>) -> String {
    let items = check_all(cleared_text, said, tail);
    let mut o = String::from("{\"items\":[");
    for (i, m) in items.iter().enumerate() {
        if i > 0 {
            o.push(',');
        }
        o.push_str("{\"item\":");
        json::string(&mut o, m.item);
        o.push_str(",\"cleared\":");
        json::string(&mut o, &m.cleared);
        o.push_str(",\"said\":");
        json::opt_string(&mut o, m.said.as_deref());
        o.push_str(",\"required\":");
        o.push_str(if m.required { "true" } else { "false" });
        o.push('}');
    }
    o.push_str("],\"words\":");
    json::string(&mut o, &words(&items));
    o.push('}');
    o
}
