//! The distress call and what goes with it: the MAYDAY in the AIM's order
//! filled from what the app knows, the transponder code, and the
//! frequencies to call on, nearest first after the one in use.
//!
//! - The call (AIM 6-3-2(a)(3), "a distress or urgency message consisting
//!   of as many as necessary of the following elements, preferably in the
//!   order listed"): MAYDAY three times, the name of the station
//!   addressed, the aircraft's identification and type, the nature of the
//!   distress, the weather, the pilot's intentions and request, the
//!   present position and heading, the altitude, the fuel remaining in
//!   minutes and the number of people on board. A part the app does not
//!   know is left as a blank to say ("[people on board]") and listed,
//!   never guessed.
//! - The frequency (AIM 6-3-1(d)): "the frequency in use or other
//!   frequencies assigned by ATC are preferable", so that one first; then
//!   the nearest radar facility and tower the app has from the FAA's
//!   frequencies; then 121.5 MHz, guarded by "most civil towers, and radar
//!   facilities" -- and "if an ARTCC does not respond when called on 121.5
//!   MHz ... call the nearest tower".
//! - The code: 7700 (AIM 6-2-2), but "continue squawking assigned Mode
//!   A/3 discrete code/VFR code ... when in radio contact with an air
//!   traffic facility ... unless instructed to do otherwise" (AIM
//!   6-3-2(a)(2)).

use wingtip_procedures::figures::words::{bearing, grouped};

use crate::json::{self, Value};

/// The emergency frequency, MHz (AIM 6-3-1(d)).
pub const GUARD_MHZ: f64 = 121.5;
/// The emergency code (AIM 6-2-2).
pub const EMERGENCY_CODE: &str = "7700";

type R<T> = Result<T, String>;

/// What the call is filled from, each None where the app does not know it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Facts {
    pub station: Option<String>,
    pub callsign: Option<String>,
    pub airplane_type: Option<String>,
    pub nature: Option<String>,
    pub weather: Option<String>,
    pub intentions: Option<String>,
    /// Where, as a controller gives it ("BAE 245° 12 nm").
    pub position: Option<String>,
    pub heading_mag_deg: Option<f64>,
    pub altitude_ft: Option<f64>,
    pub fuel_min: Option<f64>,
    pub souls: Option<f64>,
}

/// The call's lines in the AIM's order, and the parts left to say.
pub fn call_lines(f: &Facts) -> (Vec<String>, Vec<&'static str>) {
    let mut missing = vec![];
    let mut part = |value: Option<String>, blank: &'static str| {
        value.filter(|v| !v.trim().is_empty()).unwrap_or_else(|| {
            missing.push(blank);
            format!("[{blank}]")
        })
    };
    let station = part(f.station.clone(), "station");
    let who = part(f.callsign.clone(), "call sign");
    let kind = part(f.airplane_type.clone(), "airplane type");
    let nature = part(f.nature.clone(), "nature of the emergency");
    let weather = f.weather.clone();
    let intentions = part(f.intentions.clone(), "intentions");
    let position = part(f.position.clone(), "position");
    let heading = part(f.heading_mag_deg.map(|h| format!("heading {}", bearing(h).trim_end_matches('°'))), "heading");
    let altitude = part(f.altitude_ft.map(|a| format!("{} ft", grouped(a))), "altitude");
    let fuel = part(f.fuel_min.map(|m| format!("{} minutes of fuel", m.round() as i64)), "fuel in minutes");
    let souls = part(f.souls.map(|n| format!("{} people on board", n.round() as i64)), "people on board");
    let mut lines = vec!["MAYDAY, MAYDAY, MAYDAY".to_owned(), station, format!("{who}, {kind}"), nature];
    if let Some(w) = weather.filter(|w| !w.trim().is_empty()) {
        lines.push(w);
    }
    lines.extend([intentions, format!("{position}, {heading}"), altitude, fuel, souls]);
    (lines, missing)
}

/// A frequency to call on, and why it is offered.
#[derive(Clone, Debug, PartialEq)]
pub struct Channel {
    pub label: String,
    pub mhz: Option<f64>,
    pub why: &'static str,
}

/// An ATC frequency the host has, at a field `distance_nm` off: its kind
/// as the FAA lists it ("APP", "DEP", "TWR").
#[derive(Clone, Debug, PartialEq)]
pub struct Listed {
    pub ident: String,
    pub kind: String,
    pub mhz: f64,
    pub distance_nm: f64,
}

/// The frequencies in the order to try them.
pub fn channels(listed: &[Listed]) -> Vec<Channel> {
    let mut out = vec![Channel {
        label: "The frequency you are on".to_owned(),
        mhz: None,
        why: "Already talking to ATC: stay with them (AIM 6-3-1)",
    }];
    let nearest = |kinds: &[&str]| {
        listed
            .iter()
            .filter(|l| kinds.iter().any(|k| l.kind.eq_ignore_ascii_case(k)))
            .min_by(|a, b| a.distance_nm.total_cmp(&b.distance_nm))
    };
    if let Some(l) = nearest(&["APP", "DEP", "A/D", "CTR"]) {
        out.push(Channel { label: format!("{} approach", l.ident), mhz: Some(l.mhz), why: "The nearest radar facility the app lists" });
    }
    if let Some(l) = nearest(&["TWR"]) {
        out.push(Channel { label: format!("{} tower", l.ident), mhz: Some(l.mhz), why: "The nearest tower the app lists" });
    }
    out.push(Channel {
        label: "Guard".to_owned(),
        mhz: Some(GUARD_MHZ),
        why: "The emergency frequency, guarded by most towers and radar facilities (AIM 6-3-1)",
    });
    out
}

/// `mayday_call` by name.
pub fn call(name: &str, v: &Value) -> R<String> {
    let s = |key: &str| match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(t)) => Ok(Some(t.clone())),
        Some(_) => Err(format!("{name}: \"{key}\" is not a string")),
    };
    let n = |key: &str| match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(x)) => Ok(Some(*x)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    };
    let facts = Facts {
        station: s("station")?,
        callsign: s("callsign")?,
        airplane_type: s("airplane_type")?,
        nature: s("nature")?,
        weather: s("weather")?,
        intentions: s("intentions")?,
        position: s("position")?,
        heading_mag_deg: n("heading_mag_deg")?,
        altitude_ft: n("altitude_ft")?,
        fuel_min: n("fuel_min")?,
        souls: n("souls")?,
    };
    let listed = match v.get("frequencies") {
        None | Some(Value::Null) => vec![],
        Some(Value::Array(items)) => items
            .iter()
            .map(|f| {
                let text = |k: &str| {
                    f.get(k).and_then(Value::as_str).map(str::to_owned).ok_or(format!("{name}: a frequency's \"{k}\" is missing"))
                };
                let num = |k: &str| f.get(k).and_then(Value::as_f64).ok_or(format!("{name}: a frequency's \"{k}\" is missing"));
                Ok(Listed { ident: text("ident")?, kind: text("kind")?, mhz: num("mhz")?, distance_nm: num("distance_nm")? })
            })
            .collect::<R<Vec<_>>>()?,
        Some(_) => return Err(format!("{name}: \"frequencies\" is not a list")),
    };
    let (lines, missing) = call_lines(&facts);
    let mut out = String::from("{\"lines\":[");
    for (i, line) in lines.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(&mut out, line);
    }
    out.push_str("],\"words\":");
    json::string(&mut out, &lines.join(", "));
    out.push_str(",\"missing\":[");
    out.push_str(&missing.iter().map(|m| format!("\"{m}\"")).collect::<Vec<_>>().join(","));
    out.push_str(&format!("],\"squawk\":\"{EMERGENCY_CODE}\",\"squawk_words\":"));
    json::string(&mut out, "Squawk 7700; talking to ATC on a code it gave you, keep that code unless told otherwise (AIM 6-2-2, 6-3-2)");
    out.push_str(",\"channels\":[");
    for (i, c) in channels(&listed).iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"label\":");
        json::string(&mut out, &c.label);
        out.push_str(",\"mhz\":");
        json::opt_number(&mut out, c.mhz);
        out.push_str(",\"why\":");
        json::string(&mut out, c.why);
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_call_is_in_the_aims_order_and_says_what_is_missing() {
        let facts = Facts {
            station: Some("Chicago Center".into()),
            callsign: Some("N12345".into()),
            airplane_type: Some("Cessna 172".into()),
            nature: Some("engine failure".into()),
            intentions: Some("landing at C59".into()),
            position: Some("BAE 245° 12 nm".into()),
            heading_mag_deg: Some(0.4),
            altitude_ft: Some(4500.0),
            ..Facts::default()
        };
        let (lines, missing) = call_lines(&facts);
        assert_eq!(lines[0], "MAYDAY, MAYDAY, MAYDAY");
        assert_eq!(lines[2], "N12345, Cessna 172");
        assert_eq!(lines[5], "BAE 245° 12 nm, heading 360");
        assert_eq!(lines[6], "4,500 ft");
        assert_eq!(missing, vec!["fuel in minutes", "people on board"]);
    }

    #[test]
    fn the_nearest_radar_facility_then_tower_then_guard() {
        let listed = [
            Listed { ident: "KJVL".into(), kind: "TWR".into(), mhz: 118.8, distance_nm: 12.0 },
            Listed { ident: "KRFD".into(), kind: "APP".into(), mhz: 118.6, distance_nm: 30.0 },
            Listed { ident: "KMKE".into(), kind: "APP".into(), mhz: 126.5, distance_nm: 40.0 },
        ];
        let c = channels(&listed);
        assert_eq!(c.iter().map(|c| c.mhz).collect::<Vec<_>>(), vec![None, Some(118.6), Some(118.8), Some(121.5)]);
    }
}
