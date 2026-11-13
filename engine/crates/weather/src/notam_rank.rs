//! Which of a flight's NOTAMs matter to it, best first (`notams_ranked`):
//! the Brief's "NOTAMs that matter", its top three said with a line each
//! and the rest folded. 14 CFR 91.103 asks the pilot in command to become
//! familiar with all available information concerning the flight; this
//! puts the NOTAMs that bear on the runway, the hours, the altitudes and
//! the airspace of *this* flight first. It hides none: every NOTAM given
//! comes back, ranked.
//!
//! What is read of a NOTAM's text, as sent (domestic form, FAA JO 7930.2
//! chapter 5; the ICAO form, Annex 15 appendix 6 / Doc 8126):
//!
//! - its keyword, the first of JO 7930.2's (RWY, TWY, AD, NAV, COM, OBST,
//!   AIRSPACE, ...) among its words;
//! - the runways after RWY ("RWY 18/36", "RWY 09L"), each end by its number;
//! - CLSD (closed);
//! - its altitudes: a "SFC-3000FT", "3000FT-FL180" or "FL180-FL230" span,
//!   an obstacle's top ("1049FT (299FT AGL)": the MSL figure), or the ICAO
//!   Q) line's lower and upper limits (hundreds of feet, 999 unlimited). A
//!   span in AGL is left unread: it cannot be set against a cruise
//!   altitude in MSL without the ground under it.
//!
//! The points (each a reason the pilot reads, `reasons`), summed:
//!
//! | What | Points |
//! |---|---|
//! | in force while the flight is there (its window, below) | +30 |
//! | not in force then | -100, never in the top |
//! | at the departure or the destination | +20 |
//! | at a stop | +15 |
//! | names the runway in use at its field | +40 |
//! | names another runway there, or one where none in use is known | +10 |
//! | closes the field (AD ... CLSD) | +60 |
//! | closes what it names (CLSD) | +15 |
//! | its altitudes take in the cruise altitude (away from the fields) | +25 |
//! | its altitudes are clear of the cruise altitude (away from the fields) | -20 |
//! | the route goes through it (a TFR the planner placed on the route) | +35 |
//! | names an airspace the route passes | +35 |
//! | a navaid, a frequency, a service or an obstacle (NAV, COM, SVC, OBST) | +5 |
//!
//! Near a field the flight climbs or descends through every altitude, so
//! a NOTAM at a field it uses is not judged by the cruise altitude.
//!
//! Every NOTAM in force (or whose times could not be read, which is never
//! taken for not in force) comes before every one that is not, whatever
//! its points: a list read from the top shows what applies first (the
//! owner, 2026-11-12, "active NOTAMs first"), the points ordering each
//! part. Ties keep the order of their ids and say so (`tied`): the words
//! may put a tie in another order, never anything else.

use crate::json::{self, Value};
use crate::time::parse_iso;
use wingtip_core::sort::StableSort;

/// How many are said first, each with its line; the rest are folded.
pub const TOP: usize = 3;

const KEYWORDS: [&str; 18] = [
    "RWY", "TWY", "APRON", "AD", "OBST", "NAV", "COM", "SVC", "AIRSPACE", "ODP", "SID", "STAR", "CHART", "DATA", "IAP", "VFP", "ROUTE",
    "SPECIAL",
];

/// A NOTAM read for the ranking.
#[derive(Debug, Default, PartialEq)]
pub struct Read {
    pub keyword: Option<String>,
    pub runways: Vec<String>,
    pub closed: bool,
    pub low_ft: Option<f64>,
    pub high_ft: Option<f64>,
}

/// "9" "09" "9L" to "09", "09L"; None where it is not a runway's number.
fn runway_end(text: &str) -> Option<String> {
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    let side = &text[digits.len()..];
    let n: u32 = digits.parse().ok()?;
    ((1..=36).contains(&n) && digits.len() <= 2 && matches!(side, "" | "L" | "R" | "C")).then(|| format!("{n:02}{side}"))
}

/// A level as JO 7930.2 writes one: SFC or GND, FL180, 3000FT.
fn level(text: &str) -> Option<f64> {
    match text {
        "SFC" | "GND" => Some(0.0),
        _ if text.starts_with("FL") => text[2..].parse::<f64>().ok().map(|fl| fl * 100.0),
        _ => text.strip_suffix("FT").and_then(|n| n.parse::<f64>().ok()),
    }
}

/// The NOTAM's text read for its keyword, runways, closure and altitudes.
pub fn read(text: &str) -> Read {
    let words: Vec<&str> = text.split_whitespace().map(|w| w.trim_matches(|c: char| matches!(c, ',' | '.' | ';'))).collect();
    let mut r = Read { closed: words.contains(&"CLSD"), ..Read::default() };
    r.keyword = words.iter().find(|w| KEYWORDS.contains(w)).map(|w| (*w).to_owned());
    for (i, w) in words.iter().enumerate() {
        if *w == "RWY" {
            for end in words.get(i + 1).map(|n| n.split('/').collect::<Vec<_>>()).unwrap_or_default() {
                if let Some(e) = runway_end(end)
                    && !r.runways.contains(&e)
                {
                    r.runways.push(e);
                }
            }
        }
        let agl = words.get(i + 1).is_some_and(|n| n.starts_with("AGL") || n.starts_with("(AGL"));
        if r.high_ft.is_none()
            && !agl
            && let Some((a, b)) = w.split_once('-')
            && let (Some(low), Some(high)) = (level(a), level(b))
        {
            (r.low_ft, r.high_ft) = (Some(low), Some(high));
        }
        // The ICAO Q) line: FIR/code/traffic/purpose/scope/lower/upper/...
        if *w == "Q)" {
            let q: Vec<&str> = words.get(i + 1).map(|n| n.split('/').collect()).unwrap_or_default();
            if let (Some(low), Some(high)) = (q.get(5).and_then(|n| n.parse::<f64>().ok()), q.get(6).and_then(|n| n.parse::<f64>().ok())) {
                (r.low_ft, r.high_ft) = (Some(low * 100.0), (high < 999.0).then_some(high * 100.0));
            }
        }
    }
    // An obstacle's top: its first height in feet that is not AGL, MSL.
    if r.keyword.as_deref() == Some("OBST") && r.high_ft.is_none() {
        let msl = words.iter().enumerate().find(|(i, w)| {
            !w.starts_with('(') && level(w).is_some_and(|f| f > 0.0) && !words.get(i + 1).is_some_and(|n| n.contains("AGL"))
        });
        if let Some((_, w)) = msl {
            (r.low_ft, r.high_ft) = (Some(0.0), level(w));
        }
    }
    r
}

/// "KOSH" and "OSH" alike, as a domestic NOTAM names a field.
fn same_field(a: &str, b: &str) -> bool {
    let bare = |s: &str| {
        let s = s.trim().to_ascii_uppercase();
        if s.len() == 4 && s.starts_with('K') && s.chars().all(|c| c.is_ascii_alphabetic()) {
            s[1..].to_owned()
        } else {
            s
        }
    };
    !a.trim().is_empty() && bare(a) == bare(b)
}

/// "4,500 ft", "FL180" past 17,999 ft (14 CFR 91.121's transition, the
/// flight levels from 18,000 ft).
fn feet(ft: f64) -> String {
    if ft >= 18_000.0 {
        return format!("FL{:03}", (ft / 100.0).round() as i64);
    }
    let n = ft.round() as i64;
    let (th, rest) = (n / 1000, n % 1000);
    if th > 0 {
        format!("{th},{rest:03} ft")
    } else {
        format!("{n} ft")
    }
}

fn span(low: Option<f64>, high: Option<f64>) -> String {
    let low = match low {
        Some(f) if f > 0.0 => feet(f),
        _ => "the surface".to_owned(),
    };
    format!("{low} to {}", high.map_or("unlimited".to_owned(), feet))
}

fn time_of(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(Value::as_str).and_then(parse_iso)
}

/// Whether [starts, ends] meets [from, until]: None where a time given could not be read.
fn in_force(n: &Value, from: Option<i64>, until: Option<i64>) -> Option<bool> {
    let read = |key: &str| match n.get(key) {
        None | Some(Value::Null) => Some(None),
        Some(v) => v.as_str().and_then(parse_iso).map(Some),
    };
    let (starts, ends) = (read("starts")?, read("ends")?);
    let (from, until) = (from?, until?);
    Some(starts.is_none_or(|s| s <= until) && ends.is_none_or(|e| e >= from))
}

struct Ranked {
    id: String,
    score: i32,
    field: Option<String>,
    role: Option<String>,
    read: Read,
    in_force: Option<bool>,
    reasons: Vec<(&'static str, String)>,
}

fn rank_one(n: &Value, v: &Value) -> Ranked {
    let id = n.get("id").and_then(Value::as_str).unwrap_or("").to_owned();
    let text = n.get("text").and_then(Value::as_str).unwrap_or("");
    let mut read = read(text);
    if let (Some(f), Some(c)) = (n.get("floor_ft").and_then(Value::as_f64), n.get("ceiling_ft").and_then(Value::as_f64)) {
        (read.low_ft, read.high_ft) = (Some(f), Some(c));
    }
    let location = n.get("location").and_then(Value::as_str).unwrap_or("");
    let fields = v.get("fields").and_then(Value::as_array).unwrap_or(&[]);
    let field = fields.iter().find(|f| same_field(location, f.get("ident").and_then(Value::as_str).unwrap_or("")));
    let ident = field.and_then(|f| f.get("ident")).and_then(Value::as_str).map(str::to_owned);
    let role = field.and_then(|f| f.get("role")).and_then(Value::as_str).map(str::to_owned);
    let window = field.unwrap_or(v);
    let force = in_force(n, time_of(window, "from"), time_of(window, "until"));
    let (mut score, mut reasons) = (0, Vec::new());
    let mut add = |points: i32, key: &'static str, words: String| {
        score += points;
        reasons.push((key, words));
    };
    let at = ident.as_deref().map_or(String::new(), |i| format!(" at {i}"));
    match force {
        Some(true) => {
            add(30, "time", if ident.is_some() { format!("In force while you are{at}") } else { "In force during the flight".into() })
        }
        Some(false) => add(
            -100,
            "time",
            if ident.is_some() { format!("Not in force while you are{at}") } else { "Not in force during the flight".into() },
        ),
        None => add(0, "time", "Its times could not be read".into()),
    }
    if let Some(schedule) = n.get("schedule").and_then(Value::as_str).filter(|s| !s.trim().is_empty()) {
        add(0, "schedule", format!("Active on a schedule ({}); check its hours against yours", schedule.trim()));
    }
    match role.as_deref() {
        Some("dep") => add(20, "field", format!("At {}, your departure", ident.as_deref().unwrap_or(""))),
        Some("dest") => add(20, "field", format!("At {}, your destination", ident.as_deref().unwrap_or(""))),
        Some(_) => add(15, "field", format!("At {}, a stop", ident.as_deref().unwrap_or(""))),
        None => {}
    }
    let in_use: Vec<String> = field
        .and_then(|f| f.get("runways"))
        .and_then(Value::as_array)
        .unwrap_or(&[])
        .iter()
        .filter_map(Value::as_str)
        .filter_map(runway_end)
        .collect();
    if field.is_some() && !read.runways.is_empty() {
        let named = read.runways.join("/");
        if read.runways.iter().any(|r| in_use.contains(r)) {
            add(40, "runway", format!("Names runway {named}, the one in use{at}"));
        } else if in_use.is_empty() {
            add(10, "runway", format!("Names runway {named}{at}; the runway in use is not known"));
        } else {
            add(10, "runway", format!("Names runway {named}, not the one in use{at} ({})", in_use.join(", ")));
        }
    }
    if read.closed && read.keyword.as_deref() == Some("AD") {
        add(60, "closed", format!("Closes the field{at}"));
    } else if read.closed {
        add(15, "closed", "Closes what it names".into());
    }
    let cruise = v.get("cruise_ft").and_then(Value::as_f64);
    if let (None, Some(c), true) = (&field, cruise, read.high_ft.is_some() || read.low_ft.is_some()) {
        let (low, high) = (read.low_ft.unwrap_or(0.0), read.high_ft.unwrap_or(f64::INFINITY));
        let band = span(read.low_ft, read.high_ft);
        if low <= c && c <= high {
            add(25, "altitude", format!("From {band}, which takes in your {}", feet(c)));
        } else {
            add(-20, "altitude", format!("From {band}, clear of your {}", feet(c)));
        }
    }
    if n.get("crosses").and_then(|c| if let Value::Bool(b) = c { Some(*b) } else { None }) == Some(true) {
        add(35, "airspace", "The route goes through it".into());
    }
    let upper = text.to_ascii_uppercase();
    for a in v.get("airspaces").and_then(Value::as_array).unwrap_or(&[]) {
        let name = a.as_str().unwrap_or("").trim().to_ascii_uppercase();
        if name.len() >= 3 && upper.contains(&name) {
            add(35, "airspace", format!("Names {name}, which the route passes"));
            break;
        }
    }
    if matches!(read.keyword.as_deref(), Some("NAV" | "COM" | "SVC" | "OBST")) {
        let what = match read.keyword.as_deref() {
            Some("NAV") => "A navaid",
            Some("COM") => "A frequency",
            Some("SVC") => "A service",
            _ => "An obstacle",
        };
        add(5, "kind", format!("{what}{at}"));
    }
    Ranked { id, score, field: ident, role, read, in_force: force, reasons }
}

/// `notams_ranked`: `{"notams": [{"id", "location", "starts", "ends",
/// "schedule"?, "text", "floor_ft"?, "ceiling_ft"?, "crosses"?}],
/// "fields": [{"ident", "role" (dep, stop, dest), "from", "until",
/// "runways"}], "from", "until", "cruise_ft"?, "airspaces": [names]}` to
/// `{"ranked": [{"id", "rank", "score", "top", "tied", "field", "role",
/// "keyword", "runways", "closed", "low_ft", "high_ft", "in_force",
/// "reasons": [{"key", "words"}]}], "top": n}`, best first.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "notams_ranked" {
        return Err(format!("{name}: not a rule of notam_rank"));
    }
    let notams = v.get("notams").and_then(Value::as_array).ok_or("notams_ranked: \"notams\" is missing")?;
    let mut ranked: Vec<Ranked> = notams.iter().map(|n| rank_one(n, v)).collect();
    // In force first (the module's note), then best first.
    let later = |r: &Ranked| r.in_force == Some(false);
    ranked.stable_sort_by(|a, b| later(a).cmp(&later(b)).then_with(|| b.score.cmp(&a.score)).then_with(|| a.id.cmp(&b.id)));
    let mut top = 0;
    let mut out = String::from("{\"ranked\":[");
    for (i, r) in ranked.iter().enumerate() {
        let is_top = top < TOP && r.score > 0 && r.in_force != Some(false);
        top += usize::from(is_top);
        let tied = ranked.iter().filter(|o| o.score == r.score).count() > 1;
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"id\":");
        json::string(&mut out, &r.id);
        out.push_str(&format!(",\"rank\":{},\"score\":{},\"top\":{is_top},\"tied\":{tied},\"field\":", i + 1, r.score));
        json::opt_string(&mut out, r.field.as_deref());
        out.push_str(",\"role\":");
        json::opt_string(&mut out, r.role.as_deref());
        out.push_str(",\"keyword\":");
        json::opt_string(&mut out, r.read.keyword.as_deref());
        out.push_str(",\"runways\":[");
        for (k, e) in r.read.runways.iter().enumerate() {
            if k > 0 {
                out.push(',');
            }
            json::string(&mut out, e);
        }
        out.push_str(&format!("],\"closed\":{},\"low_ft\":", r.read.closed));
        json::opt_number(&mut out, r.read.low_ft);
        out.push_str(",\"high_ft\":");
        json::opt_number(&mut out, r.read.high_ft);
        out.push_str(",\"in_force\":");
        out.push_str(match r.in_force {
            Some(true) => "true",
            Some(false) => "false",
            None => "null",
        });
        out.push_str(",\"reasons\":[");
        for (k, (key, words)) in r.reasons.iter().enumerate() {
            if k > 0 {
                out.push(',');
            }
            out.push_str(&format!("{{\"key\":\"{key}\",\"words\":"));
            json::string(&mut out, words);
            out.push('}');
        }
        out.push_str("]}");
    }
    out.push_str(&format!("],\"top\":{top}}}"));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_domestic_and_icao_forms() {
        let r = read("!OSH 11/012 OSH RWY 18/36 CLSD 2611151200-2611152000");
        assert_eq!((r.keyword.as_deref(), r.runways.clone(), r.closed), (Some("RWY"), vec!["18".into(), "36".into()], true));
        let r = read("!ZAU 11/301 ZAU AIRSPACE PARACHUTE JUMP AREA SFC-FL180 2611151400-2611152200");
        assert_eq!((r.low_ft, r.high_ft), (Some(0.0), Some(18_000.0)));
        let r = read("A1234/26 NOTAMN Q) KZMP/QRTCA/IV/BO/W/000/045/4400N08800W005 A) KOSH E) TEMPO RESTRICTED AREA");
        assert_eq!((r.low_ft, r.high_ft), (Some(0.0), Some(4500.0)));
        let r = read("!OSH 11/020 OSH OBST TOWER LGT (ASR 1234567) 4401N08834W (3NM W OSH) 1049FT (299FT AGL) U/S");
        assert_eq!((r.keyword.as_deref(), r.high_ft), (Some("OBST"), Some(1049.0)));
        // A span in AGL is not set against a cruise altitude in MSL.
        assert_eq!(read("!OSH 11/021 OSH AIRSPACE UAS WI 1NM SFC-400FT AGL").high_ft, None);
        assert_eq!(runway_end("9L"), Some("09L".into()));
        assert_eq!(runway_end("37"), None);
    }

    #[test]
    fn every_notam_in_force_comes_before_any_that_is_not() {
        // Not in force at the departure, yet a field closed on the runway in
        // use: -100 + 20 + 40 + 60 = 20 points. In force, a navaid off the
        // route's fields, its span clear of the cruise: 30 - 20 + 5 = 15,
        // which points alone would put after the first. A runway
        // closed at the departure that the window takes in: 30 + 20 + 10 +
        // 15 = 75. Whatever their points, those in force come first.
        let v = crate::json::parse(
            r#"{"notams":[
                {"id":"A","location":"OSH","starts":"2026-11-20T12:00:00Z","ends":"2026-11-21T12:00:00Z","text":"!OSH 11/001 OSH AD AP RWY 18 CLSD"},
                {"id":"B","location":"MSN","starts":null,"ends":null,"text":"!MSN 11/002 MSN NAV VOR U/S SFC-3000FT"},
                {"id":"C","location":"OSH","starts":"2026-11-12T12:00:00Z","ends":"2026-11-12T20:00:00Z","text":"!OSH 11/003 OSH RWY 09 CLSD"}],
              "fields":[{"ident":"KOSH","role":"dep","from":"2026-11-12T14:00:00Z","until":"2026-11-12T16:00:00Z","runways":["18"]}],
              "from":"2026-11-12T14:00:00Z","until":"2026-11-12T16:00:00Z","cruise_ft":5500}"#,
        )
        .unwrap();
        let out = crate::json::parse(&call("notams_ranked", &v).unwrap()).unwrap();
        let ids: Vec<&str> = out.get("ranked").and_then(Value::as_array).unwrap().iter().filter_map(|r| r.get("id")?.as_str()).collect();
        assert_eq!(ids, ["C", "B", "A"]);
    }

    #[test]
    fn writes_altitudes_as_the_app_does() {
        assert_eq!((feet(4500.0), feet(800.0), feet(18_000.0)), ("4,500 ft".into(), "800 ft".into(), "FL180".into()));
    }
}
