//! `runway_proximity`: the runway proximity advisor (wingtip-brief's
//! runway::proximity) in the words the own-ship diagram shows and the
//! phone says. The words follow AC 120-74B 7e(2)(d)'s callout,
//! "approaching (specific runway number) hold short line"; a runway is
//! named as its holding position sign has it (AIM 2-3-8 b 1, "15-33",
//! the left threshold first) and spoken digit by digit (AIM 4-2-9,
//! script::spoken_runway). A closed runway (NASR's, or a NOTAM's the
//! card already holds) is said to be closed.

use super::script::spoken_runway;
use crate::json::{self, Value};
use wingtip_brief::runway::pick::runway_number;
use wingtip_brief::runway::proximity::{self, read, runway_name, Proximity, State, Strip};
use wingtip_core::text::grouped_int;
use wingtip_core::units::FT_PER_NM;

/// The words: the line shown, the line under it and what is spoken.
struct Words {
    shown: Option<String>,
    detail: Option<String>,
    spoken: Option<String>,
}

/// A distance as the advisor writes it: feet to the nearest 10 under a
/// thousand, then grouped to the nearest 100; nm to a tenth past a mile.
fn distance(ft: f64) -> String {
    if ft >= FT_PER_NM {
        format!("{:.1} nm", ft / FT_PER_NM)
    } else if ft >= 1000.0 {
        format!("{} ft", grouped_int(((ft / 100.0).round() * 100.0) as i64))
    } else {
        format!("{} ft", ((ft / 10.0).round() * 10.0) as i64)
    }
}

fn spoken_pair(s: &Strip, left: Option<usize>) -> String {
    let first = left.unwrap_or(0);
    format!("{}, {}", spoken_runway(&s.ends[first].ident), spoken_runway(&s.ends[1 - first].ident))
}

fn words(p: &Proximity, strips: &[Strip], spots: &[proximity::HotSpot]) -> Words {
    let runway = p.runway.map(|i| &strips[i]);
    let closed = |s: &Strip| if s.closed { ", closed" } else { "" };
    let (mut shown, mut detail, mut spoken) = (None, None, None);
    match (p.state, runway) {
        (State::OnRunway, Some(s)) => {
            let (name, said) = match p.end {
                Some(e) => (runway_number(&s.ends[e].ident).to_owned(), spoken_runway(&s.ends[e].ident)),
                None => (runway_name(s, None), spoken_pair(s, None)),
            };
            shown = Some(format!("On runway {name}{}", closed(s)));
            spoken = Some(format!("On runway {said}{}", closed(s)));
        }
        (State::Approaching, Some(s)) => {
            shown = Some(format!("Approaching runway {}{}", runway_name(s, p.left_end), closed(s)));
            spoken = Some(format!("Approaching runway {}{}", spoken_pair(s, p.left_end), closed(s)));
            detail = p.hold_short_ft.map(|d| {
                if d < 5.0 {
                    "At the hold short line".to_owned()
                } else {
                    format!("Hold short line in about {}", distance(d))
                }
            });
        }
        (State::LinedUp, Some(s)) => {
            let e = p.end.unwrap_or(0);
            shown = Some(format!("Approaching runway {}{}", runway_number(&s.ends[e].ident), closed(s)));
            spoken = Some(format!("Approaching runway {}{}", spoken_runway(&s.ends[e].ident), closed(s)));
            detail = p.threshold_ft.map(|d| format!("Threshold {}", distance(d)));
        }
        _ => {}
    }
    if let Some((i, d)) = p.hot_spot {
        let name = &spots[i].name;
        let line = format!("Hot spot {name}, {}", distance(d));
        detail = Some(match detail {
            Some(before) => format!("{before} · {line}"),
            None => line,
        });
        let said = format!("Hot spot {}", name.trim_start_matches("HS").trim());
        spoken = Some(match spoken {
            Some(before) => format!("{before}. {said}"),
            None => said,
        });
    }
    Words { shown, detail, spoken }
}

fn state_word(s: State) -> &'static str {
    match s {
        State::NoFix => "no_fix",
        State::Above => "above",
        State::OnRunway => "on_runway",
        State::Approaching => "approaching",
        State::LinedUp => "lined_up",
        State::Clear => "clear",
    }
}

/// The answer, as engine/crates/wording/contract/runway_proximity.json
/// lists it.
pub fn rule(name: &str, v: &Value) -> Result<String, String> {
    let asked = read::read(name, v)?;
    let p = proximity::proximity(&asked.fix, &asked.field, &asked.strips, &asked.spots);
    let w = words(&p, &asked.strips, &asked.spots);
    let runway = p.runway.map(|i| &asked.strips[i]);
    let mut out = String::from("{\"state\":");
    json::string(&mut out, state_word(p.state));
    out.push_str(",\"runway\":");
    json::opt_string(&mut out, runway.map(|s| runway_name(s, p.left_end)).as_deref());
    out.push_str(",\"end\":");
    json::opt_string(&mut out, runway.zip(p.end).map(|(s, e)| runway_number(&s.ends[e].ident).to_owned()).as_deref());
    out.push_str(&format!(",\"closed\":{}", runway.is_some_and(|s| s.closed)));
    for (key, ft) in [("hold_short_ft", p.hold_short_ft), ("threshold_ft", p.threshold_ft)] {
        out.push_str(&format!(",\"{key}\":"));
        match ft {
            Some(f) => out.push_str(&(f.round() as i64).to_string()),
            None => out.push_str("null"),
        }
    }
    out.push_str(",\"hot_spot\":");
    match p.hot_spot {
        Some((i, d)) => {
            out.push_str("{\"name\":");
            json::string(&mut out, &asked.spots[i].name);
            out.push_str(&format!(",\"distance_ft\":{}}}", d.round() as i64));
        }
        None => out.push_str("null"),
    }
    for (key, text) in [("shown", &w.shown), ("detail", &w.detail), ("spoken", &w.spoken)] {
        out.push_str(&format!(",\"{key}\":"));
        json::opt_string(&mut out, text.as_deref());
    }
    // What is said changes with the state, the runway, its end and the hot
    // spot, never with the distance: a host speaks when the key changes.
    let key = format!(
        "{}|{}|{}|{}",
        state_word(p.state),
        runway.map(|s| runway_name(s, None)).unwrap_or_default(),
        p.end.map(|e| e.to_string()).unwrap_or_default(),
        p.hot_spot.map(|(i, _)| asked.spots[i].name.clone()).unwrap_or_default()
    );
    out.push_str(",\"key\":");
    json::string(&mut out, &key);
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ask(fix: &str) -> Value {
        let input = format!(
            r#"{{"fix":{fix},"elevation_ft":1000,"runways":[{{"width_ft":100,"closed":false,
            "runway_ends":[{{"ident":"09","lat":40,"lon":-90.01}},{{"ident":"27","lat":40,"lon":-89.99}}]}}],
            "hot_spots":[{{"name":"HS 1","lat":39.9989,"lon":-90.0}}]}}"#
        );
        json::parse(&rule("runway_proximity", &json::parse(&input).unwrap()).unwrap()).unwrap()
    }

    fn text(v: &Value, key: &str) -> String {
        v.get(key).and_then(Value::as_str).unwrap_or("").to_owned()
    }

    #[test]
    fn approaching_says_the_sign_and_the_line() {
        // 400 ft south, northbound at 10 kt: the sign reads 9-27, the line
        // 260 ft out (250 and footnote 8's 10 at the field's 1,000 ft).
        let v = ask(r#"{"lat":39.998903,"lon":-90.0,"age_s":0.5,"accuracy_m":5,"track_deg":0,"groundspeed_kt":10,"altitude_ft":1000}"#);
        assert_eq!(text(&v, "shown"), "Approaching runway 9-27");
        assert!(text(&v, "detail").starts_with("Hold short line in about 140 ft · Hot spot HS 1"), "{}", text(&v, "detail"));
        assert_eq!(text(&v, "spoken"), "Approaching runway niner, two seven. Hot spot 1");
        assert_eq!(text(&v, "key"), "approaching|9-27||HS 1");
    }

    #[test]
    fn on_the_runway_says_its_end() {
        let v = ask(r#"{"lat":40,"lon":-90.0,"age_s":0.5,"accuracy_m":5,"track_deg":270,"groundspeed_kt":50,"altitude_ft":1010}"#);
        assert_eq!(text(&v, "shown"), "On runway 27");
        // The hot spot 400 ft south is within 500 ft: said after it.
        assert_eq!(text(&v, "spoken"), "On runway two seven. Hot spot 1");
        assert_eq!(text(&v, "end"), "27");
    }

    #[test]
    fn a_stale_fix_says_nothing() {
        let v = ask(r#"{"lat":40,"lon":-90.0,"age_s":4,"accuracy_m":5}"#);
        assert_eq!(text(&v, "state"), "no_fix");
        assert_eq!(v.get("spoken"), Some(&Value::Null));
    }

    #[test]
    fn distances_are_written_round() {
        assert_eq!(distance(146.0), "150 ft");
        assert_eq!(distance(1260.0), "1,300 ft");
        assert_eq!(distance(2.04 * FT_PER_NM), "2.0 nm");
    }
}
