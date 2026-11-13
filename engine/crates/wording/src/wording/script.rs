//! The radio calls for a route, worded as the AIM and AC 90-66C word them
//! (the roadmap's radio scripts, ACS PA.III.A): at each field the weather
//! broadcast to listen to first (AIM 4-1-13, ATIS), then the tower's or the
//! CTAF's calls by what the field has; flight following on the way (AIM
//! 4-1-15); and the arrival -- the approach control first into Class B or
//! C, the tower into Class D, the CTAF's self-announcing elsewhere, the
//! field's name at both ends of each (AC 90-66C 9.8.1). Figures as they
//! are spoken (AIM 4-2-8, 4-2-9): "three thousand five hundred", "runway
//! two seven", "Cessna Three Four Five Sierra Papa"; the phonetic alphabet
//! and "niner" are AIM 4-2-7's (TBL 4-2-2).
//!
//! Words in [brackets] are the pilot's to fill in: the ATIS letter, where
//! they are on the field. A script to practise from and to have on the
//! kneeboard -- a controller may ask for something else, and the pilot
//! says what they ask. The web's lib/radio had all of it (#482 phase 1);
//! the host now picks the runways (its runway picks and the wind, through
//! gonogo_runway_flown) and asks `radio_script` for the words.

use super::faa::title_case;
use super::radio::{ctaf_of, frequency_of, Frequency, MULTICOM_MHZ};
use crate::json::{self, Value};
use wingtip_brief::runway::pick::{compass_word, exit_for, runway_number};
use wingtip_route::motion::profile::descent_altitude;

const DIGITS: [&str; 10] = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "niner"];

/// The ICAO phonetic alphabet (AIM 4-2-7, TBL 4-2-2).
fn letter(c: char) -> Option<&'static str> {
    const LETTERS: [&str; 26] = [
        "Alfa", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliett", "Kilo", "Lima", "Mike", "November",
        "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "X-ray", "Yankee", "Zulu",
    ];
    c.is_ascii_uppercase().then(|| LETTERS[(c as u8 - b'A') as usize])
}

fn capitalised(word: &str) -> String {
    let mut c = word.chars();
    c.next().map_or_else(String::new, |f| f.to_uppercase().collect::<String>() + c.as_str())
}

/// A registration as it is spoken after the airplane's make, the N
/// dropped (AIM 4-2-4): "N345SP" is "Three Four Five Sierra Papa".
pub fn spoken_tail(tail: &str) -> String {
    let upper = tail.trim().to_uppercase();
    let bare = match upper.strip_prefix('N') {
        Some(rest) if rest.starts_with(|c: char| c.is_ascii_digit()) => rest,
        _ => upper.as_str(),
    };
    bare.chars()
        .map(|c| match c.to_digit(10) {
            Some(d) => capitalised(DIGITS[d as usize]),
            None => letter(c).map_or_else(|| c.to_string(), str::to_owned),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The airplane's call sign: its make and its registration spoken, or its
/// make and a blank where the planner has no registration for it (AIM
/// 4-2-4).
pub fn call_sign(make: &str, tail: Option<&str>) -> String {
    match tail {
        Some(t) if !t.is_empty() => format!("{make} {}", spoken_tail(t)),
        _ => format!("{make} [your registration]"),
    }
}

/// An altitude below 18,000 ft as spoken (AIM 4-2-9): the thousands'
/// digits, then the hundreds -- "one zero thousand five hundred".
pub fn spoken_altitude(ft: f64) -> String {
    // JavaScript's Math.round, half up, as the web wrote it.
    let hundreds = (ft / 100.0 + 0.5).floor() as i64;
    let (thousands, rest) = (hundreds.div_euclid(10), hundreds.rem_euclid(10));
    let mut words = Vec::new();
    if thousands > 0 {
        let digits: Vec<&str> = thousands.to_string().chars().map(|d| DIGITS[d.to_digit(10).unwrap_or(0) as usize]).collect();
        words.push(format!("{} thousand", digits.join(" ")));
    }
    if rest > 0 {
        words.push(format!("{} hundred", DIGITS[rest as usize]));
    }
    if words.is_empty() {
        "zero".to_owned()
    } else {
        words.join(" ")
    }
}

/// A runway as spoken, digit by digit with its side (AIM 4-2-9): "two
/// seven", "niner left", "six" for runway 06.
pub fn spoken_runway(ident: &str) -> String {
    let number = runway_number(ident).to_uppercase();
    let digits: String = number.chars().take_while(char::is_ascii_digit).collect();
    let side = match &number[digits.len()..] {
        "L" => " left",
        "C" => " center",
        "R" => " right",
        "" => "",
        _ => return ident.to_owned(),
    };
    if digits.is_empty() {
        return ident.to_owned();
    }
    let said: Vec<&str> = digits.chars().map(|d| DIGITS[d.to_digit(10).unwrap_or(0) as usize]).collect();
    format!("{}{side}", said.join(" "))
}

/// JavaScript's \w: an ASCII letter, digit or underscore.
fn word_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// `text` with every whole word of `words` (tried in order at each place,
/// as a regex alternation is) taken out; `fold` compares ignoring case.
fn drop_words(text: &str, words: &[&str], fold: bool) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    'scan: while i < chars.len() {
        if i == 0 || !word_char(chars[i - 1]) {
            for w in words {
                let wc: Vec<char> = w.chars().collect();
                let end = i + wc.len();
                if end > chars.len() {
                    continue;
                }
                let same = chars[i..end].iter().zip(&wc).all(|(a, b)| if fold { a.eq_ignore_ascii_case(b) } else { a == b });
                if same && (end == chars.len() || !word_char(chars[end])) {
                    i = end;
                    continue 'scan;
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Runs of the characters `squeezed` says as one space.
fn squeeze(text: &str, squeezed: impl Fn(char) -> bool) -> String {
    let mut out = String::with_capacity(text.len());
    let mut run = false;
    for c in text.chars() {
        if squeezed(c) {
            if !run {
                out.push(' ');
            }
            run = true;
        } else {
            out.push(c);
            run = false;
        }
    }
    out
}

/// What a pilot calls a field: its name without "Airport", "International"
/// and the like -- "Waukegan" for Waukegan National Airport (AC 90-66C
/// 9.8.1 names the field in each call); its ident where nothing is left.
pub fn place_name(name: Option<&str>, ident: &str) -> String {
    let name = name.unwrap_or("");
    let cut = name.find(['-', '/', '(']).map_or(name, |at| &name[..at]);
    const WORDS: [&str; 11] = [
        "international", "national", "regional", "municipal", "county", "executive", "memorial", "airport", "airfield", "field", "airpark",
    ];
    let left = squeeze(&drop_words(cut, &WORDS, true), char::is_whitespace);
    let left = left.trim();
    if left.is_empty() {
        ident.to_owned()
    } else {
        left.to_owned()
    }
}

/// A frequency's facility as it is called: its description's own name
/// ("ROCKFORD TWR" is Rockford), else the field's.
fn facility_name(f: &Frequency, field: &str) -> String {
    const CODES: [&str; 18] = [
        "TWR", "TOWER", "GND", "GROUND", "APP", "DEP", "APCH", "APP/DEP", "A/D", "CLNC", "DEL", "CLD", "CTAF", "UNICOM", "ATIS", "AWOS",
        "ASOS", "RDO",
    ];
    let upper = f.description.as_deref().unwrap_or("").to_uppercase();
    let own = squeeze(&drop_words(&upper, &CODES, false), |c| c == '/' || c.is_whitespace());
    let own = own.trim();
    if own.is_empty() {
        field.to_owned()
    } else {
        title_case(own)
    }
}

/// A frequency as pilots write it: 120.7, 122.95, 124.475.
fn mhz_text(mhz: f64) -> String {
    let s = format!("{mhz:.3}");
    let s = s.strip_suffix('0').map_or(s.as_str(), |t| t.strip_suffix('0').unwrap_or(t));
    s.to_owned()
}

/// A field as the script reads it.
pub struct Field {
    pub ident: String,
    pub name: Option<String>,
    pub airspace_class: Option<String>,
    pub frequencies: Vec<Frequency>,
    pub pattern_altitude_ft: Option<f64>,
    /// The runway end taken off from and landed on, as the host picked it
    /// (its ident as painted, its traffic side), None where none has a
    /// heading.
    pub takeoff: Option<End>,
    pub landing: Option<End>,
}

pub struct End {
    pub ident: String,
    pub traffic: Option<String>,
}

pub struct Leg {
    pub from: String,
    pub to: String,
    pub true_course_deg: f64,
    pub altitude_ft: f64,
}

pub struct Call {
    pub to: String,
    pub mhz: Option<f64>,
    pub words: String,
    pub note: Option<String>,
    pub listen: bool,
}

pub struct Phase {
    pub title: String,
    pub ident: String,
    pub kind: &'static str,
    pub calls: Vec<Call>,
}

fn call(to: String, mhz: Option<f64>, words: String) -> Call {
    Call { to, mhz, words, note: None, listen: false }
}

fn of<'a>(f: &'a [Frequency], types: &[&str]) -> Option<&'a Frequency> {
    frequency_of(f, types).map(|i| &f[i])
}

/// The legs from one airport to the next: the first leg out of `from` to
/// the first leg into `to` after it.
fn hop_legs<'a>(legs: &'a [Leg], from: &str, to: &str) -> &'a [Leg] {
    let Some(start) = legs.iter().position(|l| l.from == from) else { return &[] };
    match legs[start..].iter().position(|l| l.to == to) {
        Some(end) => &legs[start..start + end + 1],
        None => &legs[start..],
    }
}

/// At a part-time tower, what to do when it is closed: its CTAF.
fn when_closed(f: &[Frequency]) -> String {
    of(f, &["CTAF"])
        .and_then(|c| c.mhz)
        .map_or_else(String::new, |mhz| format!(" When the tower is closed, self-announce on the CTAF, {}.", mhz_text(mhz)))
}

fn listen_first(f: &[Frequency], field: &str) -> Vec<Call> {
    if let Some(atis) = of(f, &["ATIS"]) {
        let mut c = call(format!("{field} ATIS"), atis.mhz, "The weather, the runway in use and the information letter.".into());
        c.listen = true;
        return vec![c];
    }
    if let Some(auto) = of(f, &["AWOS", "ASOS"]) {
        let kind = auto.kind.as_deref().unwrap_or("").to_uppercase();
        let mut c = call(format!("{field} {kind}"), auto.mhz, "The wind, the altimeter setting and the weather.".into());
        c.listen = true;
        return vec![c];
    }
    Vec::new()
}

fn runway_words(end: Option<&End>) -> String {
    end.map_or_else(|| "runway [in use]".to_owned(), |e| format!("runway {}", spoken_runway(&e.ident)))
}

fn busy(class: Option<&str>) -> bool {
    matches!(class, Some("B") | Some("C"))
}

/// The CTAF's frequency: the field's (wording::radio ctaf_of), else
/// MULTICOM's 122.9 (AC 90-66C 9.6).
fn ctaf_mhz(f: &[Frequency]) -> Option<f64> {
    ctaf_of(f).map_or(Some(MULTICOM_MHZ), |i| f[i].mhz)
}

fn departure(cs: &str, fields: &[Field], legs: &[Leg], i: usize) -> Phase {
    let here = &fields[i];
    let next = &fields[i + 1];
    let first = hop_legs(legs, &here.ident, &next.ident).first();
    let field = place_name(here.name.as_deref(), &here.ident);
    let to = place_name(next.name.as_deref(), &next.ident);
    let runway = runway_words(here.takeoff.as_ref());
    let heading = first.map_or("[direction]", |l| compass_word(l.true_course_deg));
    let altitude = first.map_or_else(|| "[altitude]".to_owned(), |l| spoken_altitude(l.altitude_ft));
    let f = &here.frequencies;
    let mut calls = listen_first(f, &field);
    if let Some(tower) = of(f, &["TWR"]) {
        let atis = if of(f, &["ATIS"]).is_some() { ", with information [letter]" } else { "" };
        let class = here.airspace_class.as_deref();
        if let Some(clearance) = of(f, &["CLD"]).filter(|_| busy(class)) {
            let name = facility_name(clearance, &field);
            let mut c = call(
                format!("{name} Clearance"),
                clearance.mhz,
                format!("{name} Clearance, {cs}, VFR to {to}, {heading}bound, {altitude}{atis}."),
            );
            c.note = Some(format!(
                "Class {}: where the Chart Supplement sends VFR departures to clearance delivery first.",
                class.unwrap_or("")
            ));
            calls.push(c);
        }
        if let Some(ground) = of(f, &["GND"]) {
            let name = facility_name(ground, &field);
            calls.push(call(
                format!("{name} Ground"),
                ground.mhz,
                format!("{name} Ground, {cs}, at [where you are]{atis}, VFR to {to}, {heading}bound, ready to taxi."),
            ));
        }
        let name = facility_name(tower, &field);
        let mut c = call(
            format!("{name} Tower"),
            tower.mhz,
            format!("{name} Tower, {cs}, holding short {runway}, ready for departure, {heading}bound."),
        );
        c.note =
            Some(format!("The tower may give another runway and a way out: read back the runway and the clearance.{}", when_closed(f)));
        calls.push(c);
    } else {
        let mhz = ctaf_mhz(f);
        calls.push(call(format!("{field} traffic"), mhz, format!("{field} traffic, {cs}, taxiing to {runway}, {field}.")));
        let mut c = call(
            format!("{field} traffic"),
            mhz,
            format!("{field} traffic, {cs}, departing {runway}, departing the pattern to the {heading}, climbing to {altitude}, {field}."),
        );
        // How to leave the pattern (AC 90-66C 11.8), left traffic unless
        // the FAA says right (91.126(b)(1)).
        c.note = here.takeoff.as_ref().map(|e| exit_for(e.traffic.as_deref().unwrap_or("left")));
        calls.push(c);
    }
    let radar = of(f, &["DEP", "A/D", "APP"]);
    let facility = radar.map_or_else(
        || "Approach or Center".to_owned(),
        |r| {
            let what = if r.kind.as_deref().unwrap_or("").to_uppercase() == "APP" { "Approach" } else { "Departure" };
            format!("{} {what}", facility_name(r, &field))
        },
    );
    let mhz = radar.and_then(|r| r.mhz);
    let mut request = call(facility.clone(), mhz, format!("{facility}, {cs}, VFR request."));
    request.note = Some(
        if radar.is_some() {
            "Flight following, once clear of the field."
        } else {
            "Flight following, once clear: the frequency is on the sectional or in the Chart Supplement."
        }
        .to_owned(),
    );
    let mut follow = call(facility, mhz, format!("{cs}, [distance] {heading} of {field}, {altitude}, request flight following to {to}."));
    follow.note = Some("When they answer. Then squawk the code they give and read it back.".to_owned());
    calls.push(request);
    calls.push(follow);
    Phase { title: format!("Leaving {}", here.ident), ident: here.ident.clone(), kind: "departure", calls }
}

fn arrival(cs: &str, fields: &[Field], legs: &[Leg], i: usize) -> Phase {
    let here = &fields[i];
    let prev = &fields[i - 1];
    let last = hop_legs(legs, &prev.ident, &here.ident).last();
    let field = place_name(here.name.as_deref(), &here.ident);
    let runway = runway_words(here.landing.as_ref());
    let from = last.map_or("[direction]", |l| compass_word(l.true_course_deg + 180.0));
    // About where a 3:1 descent to pattern altitude has the airplane ten
    // miles out, no higher than its cruise, as the nav log flies it
    // (motion::profile descent_altitude).
    let altitude = match last {
        Some(l) => {
            let ft = descent_altitude(l.altitude_ft, here.pattern_altitude_ft, 10.0);
            format!("{}{}", spoken_altitude(ft), if ft < l.altitude_ft { ", descending" } else { "" })
        }
        None => "[altitude]".to_owned(),
    };
    let f = &here.frequencies;
    let mut calls = listen_first(f, &field);
    if let Some(first) = calls.first_mut() {
        first.note = Some("About 25 miles out, before the first call.".to_owned());
    }
    let atis = if of(f, &["ATIS"]).is_some() { ", with information [letter]" } else { "" };
    if let Some(tower) = of(f, &["TWR"]) {
        let class = here.airspace_class.as_deref();
        let radar = of(f, &["APP", "A/D"]).filter(|_| busy(class));
        if let Some(radar) = radar {
            let approach = format!("{} Approach", facility_name(radar, &field));
            let cruise = last.map_or_else(|| "[altitude]".to_owned(), |l| spoken_altitude(l.altitude_ft));
            let mut c = call(
                approach.clone(),
                radar.mhz,
                format!("{approach}, {cs}, [distance] {from} of {field}, {cruise}{atis}, landing {field}."),
            );
            c.note = Some(
                if class == Some("B") {
                    "Well outside the Class B: stay out until you hear \"cleared into the Class Bravo\" (91.131)."
                } else {
                    "Before the Class C: two-way communication is the controller answering with your call sign (91.130)."
                }
                .to_owned(),
            );
            calls.push(c);
        }
        let name = facility_name(tower, &field);
        let handed = radar.is_some();
        let mut c = call(
            format!("{name} Tower"),
            tower.mhz,
            if handed {
                format!("{name} Tower, {cs}, [position], {altitude}, landing.")
            } else {
                format!("{name} Tower, {cs}, ten miles {from}, {altitude}{atis}, landing.")
            },
        );
        c.note = Some(if handed {
            "When approach hands you over.".to_owned()
        } else {
            format!(
                "Well before the Class D's boundary on the chart, each drawn to its field (AIM 3-2-5): the tower answering with your call sign is two-way communication (91.129(c)). Fly the entry it gives.{}",
                when_closed(f)
            )
        });
        calls.push(c);
        if let Some(ground) = of(f, &["GND"]) {
            let name = facility_name(ground, &field);
            let mut c = call(
                format!("{name} Ground"),
                ground.mhz,
                format!("{name} Ground, {cs}, clear of {runway} at [taxiway], taxi to [where you are going]."),
            );
            c.note = Some("Once clear of the runway, when the tower says to.".to_owned());
            calls.push(c);
        }
    } else {
        let mhz = ctaf_mhz(f);
        let side = here.landing.as_ref().and_then(|e| e.traffic.clone()).unwrap_or_else(|| "[left or right]".to_owned());
        let say = |words: String, note: Option<&str>| {
            let mut c = call(format!("{field} traffic"), mhz, format!("{field} traffic, {cs}, {words}, {field}."));
            c.note = note.map(str::to_owned);
            c
        };
        calls.push(say(format!("ten miles {from}, {altitude}, inbound for landing"), Some("About ten miles out (AC 90-66C 10.4.1).")));
        calls.push(say(format!("entering the forty-five for {side} downwind {runway}"), None));
        calls.push(say(format!("{side} downwind {runway}"), None));
        calls.push(say(format!("{side} base {runway}"), None));
        calls.push(say(format!("final {runway}, full stop"), None));
        calls.push(say(format!("clear of {runway}"), None));
    }
    Phase { title: format!("Into {}", here.ident), ident: here.ident.clone(), kind: "arrival", calls }
}

/// The route's calls, airport by airport: leaving the departure, into and
/// out of each stop, and into the destination.
pub fn radio_script(call_sign: &str, fields: &[Field], legs: &[Leg]) -> Vec<Phase> {
    let mut phases = Vec::new();
    for i in 0..fields.len() {
        if i > 0 {
            phases.push(arrival(call_sign, fields, legs, i));
        }
        if i + 1 < fields.len() {
            phases.push(departure(call_sign, fields, legs, i));
        }
    }
    phases
}

// --- JSON in and out ---

fn text(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn end(v: Option<&Value>) -> Option<End> {
    let v = v?;
    Some(End { ident: text(v, "ident")?, traffic: text(v, "traffic") })
}

/// `radio_script`: `[{"title", "ident", "kind", "calls": [{"to", "mhz",
/// "words", "note"?, "listen"?}]}]` from `{"call_sign", "airports":
/// [{"ident", "name"?, "airspace_class"?, "frequencies",
/// "pattern_altitude_ft"?, "takeoff"?, "landing"?: {"ident",
/// "traffic"?}}], "legs": [{"from", "to", "true_course_deg",
/// "altitude_ft"}]}`.
pub fn script_json(name: &str, v: &Value, frequencies: impl Fn(&Value) -> Result<Vec<Frequency>, String>) -> Result<String, String> {
    let cs = v.get("call_sign").and_then(Value::as_str).ok_or_else(|| format!("{name}: \"call_sign\" is missing"))?;
    let airports = v.get("airports").and_then(Value::as_array).ok_or_else(|| format!("{name}: \"airports\" is missing"))?;
    let fields = airports
        .iter()
        .map(|a| {
            Ok(Field {
                ident: text(a, "ident").ok_or_else(|| format!("{name}: an airport has no \"ident\""))?,
                name: text(a, "name"),
                airspace_class: text(a, "airspace_class"),
                frequencies: frequencies(a)?,
                pattern_altitude_ft: a.get("pattern_altitude_ft").and_then(Value::as_f64),
                takeoff: end(a.get("takeoff")),
                landing: end(a.get("landing")),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let legs: Vec<Leg> = v
        .get("legs")
        .and_then(Value::as_array)
        .unwrap_or(&[])
        .iter()
        .map(|l| Leg {
            from: text(l, "from").unwrap_or_default(),
            to: text(l, "to").unwrap_or_default(),
            true_course_deg: l.get("true_course_deg").and_then(Value::as_f64).unwrap_or(0.0),
            altitude_ft: l.get("altitude_ft").and_then(Value::as_f64).unwrap_or(0.0),
        })
        .collect();
    let mut out = String::from("[");
    for (i, p) in radio_script(cs, &fields, &legs).iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"title\":");
        json::string(&mut out, &p.title);
        out.push_str(",\"ident\":");
        json::string(&mut out, &p.ident);
        out.push_str(",\"kind\":");
        json::string(&mut out, p.kind);
        out.push_str(",\"calls\":[");
        for (j, c) in p.calls.iter().enumerate() {
            if j > 0 {
                out.push(',');
            }
            out.push_str("{\"to\":");
            json::string(&mut out, &c.to);
            out.push_str(",\"mhz\":");
            json::opt_number(&mut out, c.mhz);
            out.push_str(",\"words\":");
            json::string(&mut out, &c.words);
            if let Some(note) = &c.note {
                out.push_str(",\"note\":");
                json::string(&mut out, note);
            }
            if c.listen {
                out.push_str(",\"listen\":true");
            }
            out.push('}');
        }
        out.push_str("]}");
    }
    out.push(']');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spoken_as_the_aim_speaks_it() {
        assert_eq!(spoken_tail("N345SP"), "Three Four Five Sierra Papa");
        assert_eq!(spoken_tail("n19"), "One Niner");
        assert_eq!(call_sign("Cessna", Some("N345SP")), "Cessna Three Four Five Sierra Papa");
        assert_eq!(call_sign("Piper", None), "Piper [your registration]");
        assert_eq!(spoken_altitude(3500.0), "three thousand five hundred");
        assert_eq!(spoken_altitude(10500.0), "one zero thousand five hundred");
        assert_eq!(spoken_altitude(2000.0), "two thousand");
        assert_eq!(spoken_altitude(800.0), "eight hundred");
        assert_eq!(spoken_runway("27"), "two seven");
        assert_eq!(spoken_runway("09L"), "niner left");
        assert_eq!(spoken_runway("06"), "six");
        assert_eq!(place_name(Some("Waukegan National Airport"), "KUGN"), "Waukegan");
        assert_eq!(place_name(Some("Lake In The Hills Airport"), "3CK"), "Lake In The Hills");
        assert_eq!(place_name(None, "C81"), "C81");
        assert_eq!(mhz_text(122.9), "122.9");
        assert_eq!(mhz_text(122.95), "122.95");
        assert_eq!(mhz_text(124.475), "124.475");
        assert_eq!(mhz_text(120.05), "120.05");
    }

    #[test]
    fn a_facility_is_called_by_its_own_name() {
        let f = |d: &str| Frequency { kind: None, description: Some(d.into()), mhz: Some(120.0) };
        assert_eq!(facility_name(&f("CHICAGO APP/DEP"), "Waukegan"), "Chicago");
        assert_eq!(facility_name(&f("TWR"), "Waukegan"), "Waukegan");
        assert_eq!(facility_name(&f("ROCKFORD TWR"), "X"), "Rockford");
    }
}
