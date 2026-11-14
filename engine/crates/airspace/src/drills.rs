//! The oral's flash cards, in the regulation's words, and 91.155's table
//! by name: the web's lib/drills and the iPhone's Drills had each its own
//! copy of both tables (#482 phase 1). The VFR minimums' cards are worded
//! from crate::rules' own table, the one the airspace column gives each
//! band, so the drill and the map cannot say two things. How long a card
//! known stays away (Leitner's boxes, `drill_next`) is here too, once for
//! every app; each keeps its own progress.

use crate::json::{self, Value};
use crate::rules::{self, Rule, CLASS_A_FLOOR_FT, G_LOW_AGL_FT, TEN_THOUSAND_FT};
use wingtip_core::units::FT_PER_SM;

/// 14 CFR 91.125's table, word for word: each colour and type of signal,
/// what it means to an aircraft on the surface and to one in flight. The
/// flight column's notes are 91.125(a)'s own (flashing green: "to be
/// followed by steady green at the proper time"; flashing white has no
/// meaning in flight).
struct Signal {
    id: &'static str,
    name: &'static str,
    colours: &'static [&'static str],
    flashing: bool,
    surface: &'static str,
    flight: &'static str,
    flight_detail: Option<&'static str>,
}

const SIGNALS: [Signal; 6] = [
    Signal {
        id: "steady-green",
        name: "Steady green",
        colours: &["green"],
        flashing: false,
        surface: "Cleared for takeoff",
        flight: "Cleared to land",
        flight_detail: None,
    },
    Signal {
        id: "flashing-green",
        name: "Flashing green",
        colours: &["green"],
        flashing: true,
        surface: "Cleared to taxi",
        flight: "Return for landing",
        flight_detail: Some("To be followed by steady green at the proper time."),
    },
    Signal {
        id: "steady-red",
        name: "Steady red",
        colours: &["red"],
        flashing: false,
        surface: "Stop",
        flight: "Give way to other aircraft and continue circling",
        flight_detail: None,
    },
    Signal {
        id: "flashing-red",
        name: "Flashing red",
        colours: &["red"],
        flashing: true,
        surface: "Taxi clear of the runway in use",
        flight: "Airport unsafe: do not land",
        flight_detail: None,
    },
    Signal {
        id: "flashing-white",
        name: "Flashing white",
        colours: &["white"],
        flashing: true,
        surface: "Return to starting point on airport",
        flight: "Not applicable",
        flight_detail: Some("Flashing white means nothing to an aircraft in flight."),
    },
    Signal {
        id: "alternating",
        name: "Alternating red and green",
        colours: &["red", "green"],
        flashing: true,
        surface: "Exercise extreme caution",
        flight: "Exercise extreme caution",
        flight_detail: None,
    },
];

/// "1,000", as the cards write a distance in feet.
fn grouped(ft: f64) -> String {
    crate::figures::words::grouped(ft)
}

/// A row of 91.155(a)'s table as the card answers it: "3 sm; 500 ft
/// below, 1,000 ft above, 2,000 ft horizontal", "3 sm; clear of clouds".
/// A mile horizontally (5,280 ft) is the table's "1 statute mile".
pub fn rule_words(r: &Rule) -> String {
    let sm = |v: f64| format!("{} sm", crate::figures::words::js_num(v));
    match (r.below_ft, r.above_ft, r.horizontal_ft) {
        (Some(below), Some(above), Some(horizontal)) => {
            let horizontal = if horizontal == FT_PER_SM { "1 sm".to_owned() } else { format!("{} ft", grouped(horizontal)) };
            format!("{}; {} ft below, {} ft above, {horizontal} horizontal", sm(r.visibility_sm), grouped(below), grouped(above))
        }
        _ => format!("{}; clear of clouds", sm(r.visibility_sm)),
    }
}

struct Card {
    id: &'static str,
    prompt: &'static str,
    answer: String,
    detail: Option<&'static str>,
    colours: &'static [&'static str],
    flashing: bool,
}

/// The VFR minimums' cards: each a row of 91.155(a)'s table, asked of
/// crate::rules at a height inside the row (a band's floor MSL and above
/// the ground), so its answer is the column's own. Class A is 91.135's:
/// flown under IFR. The night pattern exception is 91.155(b)(2).
fn vfr_cards() -> Vec<Card> {
    let card = |id, prompt, class, msl: f64, agl: f64, night: bool, detail| {
        let m = rules::minimums(class, msl, agl).expect("91.155(a) has a row for every class but A");
        Card { id, prompt, answer: rule_words(if night { &m.night } else { &m.day }), detail, colours: &[], flashing: false }
    };
    let low = 3000.0;
    let high = TEN_THOUSAND_FT;
    let g_low = G_LOW_AGL_FT - 200.0;
    let g_mid = G_LOW_AGL_FT + 300.0;
    vec![
        Card { id: "a", prompt: "Class A", answer: "Not applicable".to_owned(), detail: Some("Class A is flown under IFR (91.135)."), colours: &[], flashing: false },
        card("b", "Class B", 'B', low, low, false, None),
        card("c", "Class C", 'C', low, low, false, None),
        card("d", "Class D", 'D', low, low, false, None),
        card("e-low", "Class E, below 10,000 ft MSL", 'E', high - 500.0, low, false, None),
        card("e-high", "Class E, at or above 10,000 ft MSL", 'E', high, low, false, None),
        card("g-low-day", "Class G, 1,200 ft or less above the surface, by day", 'G', g_low, g_low, false, None),
        card(
            "g-low-night",
            "Class G, 1,200 ft or less above the surface, at night",
            'G',
            g_low,
            g_low,
            true,
            Some("Under 3 sm but not under 1 sm at night, an airplane in the traffic pattern within 1/2 mile of the runway may fly clear of clouds (91.155(b)(2))."),
        ),
        card("g-mid-day", "Class G, more than 1,200 ft above the surface but below 10,000 ft MSL, by day", 'G', low, g_mid, false, None),
        card("g-mid-night", "Class G, more than 1,200 ft above the surface but below 10,000 ft MSL, at night", 'G', low, g_mid, true, None),
        card("g-high", "Class G, more than 1,200 ft above the surface and at or above 10,000 ft MSL", 'G', high, g_mid, false, None),
    ]
}

fn light_gun_cards() -> Vec<Card> {
    SIGNALS
        .iter()
        .flat_map(|s| {
            [
                Card { id: "", prompt: "", answer: s.surface.to_owned(), detail: None, colours: s.colours, flashing: s.flashing },
                Card { id: "", prompt: "", answer: s.flight.to_owned(), detail: s.flight_detail, colours: s.colours, flashing: s.flashing },
            ]
        })
        .collect()
}

fn write_card(out: &mut String, id: &str, prompt: &str, c: &Card) {
    out.push_str("{\"id\":");
    json::string(out, id);
    out.push_str(",\"prompt\":");
    json::string(out, prompt);
    out.push_str(",\"answer\":");
    json::string(out, &c.answer);
    out.push_str(",\"detail\":");
    json::opt_string(out, c.detail);
    out.push_str(",\"colours\":[");
    for (i, colour) in c.colours.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(out, colour);
    }
    out.push_str("],\"flashing\":");
    out.push_str(if c.flashing { "true" } else { "false" });
    out.push('}');
}

fn write_deck(out: &mut String, key: &str, title: &str, section: &str, cards: &[(String, String, &Card)]) {
    out.push_str("{\"key\":");
    json::string(out, key);
    out.push_str(",\"title\":");
    json::string(out, title);
    out.push_str(",\"source\":");
    json::string(out, &format!("14 CFR {section}"));
    out.push_str(",\"url\":");
    json::string(out, &format!("https://www.ecfr.gov/current/title-14/part-91/section-{section}"));
    out.push_str(",\"cards\":[");
    for (i, (id, prompt, card)) in cards.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        write_card(out, id, prompt, card);
    }
    out.push_str("]}");
}

/// Both decks, the light gun's (91.125) and the VFR minimums' (91.155),
/// `[{"key", "title", "source", "url", "cards": [{"id", "prompt",
/// "answer", "detail", "colours", "flashing"}]}]`.
pub fn decks_json() -> String {
    let light = light_gun_cards();
    let mut gun = Vec::new();
    for (k, s) in SIGNALS.iter().enumerate() {
        gun.push((format!("{}-surface", s.id), format!("{}, on the ground", s.name), &light[2 * k]));
        gun.push((format!("{}-flight", s.id), format!("{}, in flight", s.name), &light[2 * k + 1]));
    }
    let vfr = vfr_cards();
    let vfr: Vec<_> = vfr.iter().map(|c| (c.id.to_owned(), c.prompt.to_owned(), c)).collect();
    let mut out = String::from("[");
    write_deck(&mut out, "light-gun", "Light gun signals", "91.125", &gun);
    out.push(',');
    write_deck(&mut out, "vfr-minimums", "VFR weather minimums", "91.155", &vfr);
    out.push(']');
    out
}

/// Days until a card in each box comes round again, the first box the same
/// session: Leitner's boxes spaced as a short course is (a design choice,
/// no rule), five of them.
pub const INTERVAL_DAYS: [f64; 5] = [0.0, 1.0, 3.0, 7.0, 16.0];

/// A card answered: known, up a box (a card never seen counts as the
/// first) to the last at most; missed, back to the first. Its new box and
/// the days until it is due again.
pub fn drill_next(box_now: Option<usize>, knew: bool) -> (usize, f64) {
    let to = if knew { (box_now.unwrap_or(1).max(1) + 1).min(INTERVAL_DAYS.len()) } else { 1 };
    (to, INTERVAL_DAYS[to - 1])
}

fn write_rule(out: &mut String, r: &Rule) {
    out.push_str("{\"visibility_sm\":");
    json::number(out, r.visibility_sm);
    out.push_str(",\"below_ft\":");
    json::opt_number(out, r.below_ft);
    out.push_str(",\"above_ft\":");
    json::opt_number(out, r.above_ft);
    out.push_str(",\"horizontal_ft\":");
    json::opt_number(out, r.horizontal_ft);
    out.push_str(",\"words\":");
    json::string(out, &rule_words(r));
    out.push('}');
}

/// The rule `name` worked on `v`.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        // 91.155(a) for a class at an altitude: `{"class", "altitude_ft",
        // "agl_ft"?}` (MSL; the height above the ground matters in Class G
        // alone, and is taken as more than 1,200 ft where not given), the
        // day's and the night's, or null in Class A (91.135: IFR).
        "vfr_minimums" => {
            let class = v.get("class").and_then(Value::as_str).unwrap_or("").trim().to_ascii_uppercase();
            let class = match class.as_str() {
                "A" | "B" | "C" | "D" | "E" | "G" => class.chars().next().unwrap_or('G'),
                other => return Err(format!("vfr_minimums: \"class\" is A, B, C, D, E or G, not {other:?}")),
            };
            let msl = v.get("altitude_ft").and_then(Value::as_f64).ok_or("vfr_minimums: \"altitude_ft\" is not a number")?;
            let agl = match v.get("agl_ft") {
                None | Some(Value::Null) => f64::INFINITY,
                Some(a) => a.as_f64().ok_or("vfr_minimums: \"agl_ft\" is not a number")?,
            };
            // Class A is above its floor whatever is asked of it (71.33).
            let class = if class != 'A' && msl >= CLASS_A_FLOOR_FT { 'A' } else { class };
            // An airplane at a height, not a band from a floor: 91.155(a)'s
            // Class G row is "1,200 feet or less above the surface", so at
            // 1,200 ft exactly it is the low row (by day 1 sm, clear of
            // clouds). rules::minimums reads a band whose floor is at 1,200
            // ft as above it, which it is; asked at the ground, the low row.
            let agl = if agl <= G_LOW_AGL_FT { 0.0 } else { agl };
            Ok(match rules::minimums(class, msl, agl) {
                None => "null".to_owned(),
                Some(m) => {
                    let mut out = String::from("{\"day\":");
                    write_rule(&mut out, &m.day);
                    out.push_str(",\"night\":");
                    write_rule(&mut out, &m.night);
                    out.push('}');
                    out
                }
            })
        }
        "drill_decks" => Ok(decks_json()),
        // `{"box"?: 1 to 5, null never seen, "knew"}`: `{"box", "in_days"}`.
        "drill_next" => {
            let box_now = match v.get("box") {
                None | Some(Value::Null) => None,
                Some(Value::Number(b)) if *b >= 0.0 => Some(*b as usize),
                Some(_) => return Err("drill_next: \"box\" is not a box".to_owned()),
            };
            let knew = match v.get("knew") {
                Some(Value::Bool(k)) => *k,
                _ => return Err("drill_next: \"knew\" is missing or not true or false".to_owned()),
            };
            let (to, days) = drill_next(box_now, knew);
            let mut out = format!("{{\"box\":{to},\"in_days\":");
            json::number(&mut out, days);
            out.push('}');
            Ok(out)
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_card_known_goes_up_a_box_and_one_missed_back_to_the_first() {
        assert_eq!(drill_next(None, true), (2, 1.0));
        assert_eq!(drill_next(Some(2), true), (3, 3.0));
        assert_eq!(drill_next(Some(5), true), (5, 16.0));
        assert_eq!(drill_next(Some(4), false), (1, 0.0));
        assert_eq!(call("drill_next", &json::parse(r#"{"box":3,"knew":true}"#).unwrap()).unwrap(), r#"{"box":4,"in_days":7.0}"#);
    }

    #[test]
    fn the_cards_say_91_155s_rows() {
        let decks = decks_json();
        assert!(
            decks.contains("\"Class E, at or above 10,000 ft MSL\",\"answer\":\"5 sm; 1,000 ft below, 1,000 ft above, 1 sm horizontal\"")
        );
        assert!(decks.contains("\"Class B\",\"answer\":\"3 sm; clear of clouds\""));
        assert!(decks.contains("by day\",\"answer\":\"1 sm; clear of clouds\""));
    }

    #[test]
    fn class_e_below_and_at_ten_thousand() {
        let ask = |ft: f64| call("vfr_minimums", &json::parse(&format!("{{\"class\":\"E\",\"altitude_ft\":{ft}}}")).unwrap()).unwrap();
        assert!(ask(9999.0).contains("\"below_ft\":500"));
        assert!(ask(10000.0).contains("\"below_ft\":1000"));
        assert_eq!(ask(18000.0), "null");
    }
}
