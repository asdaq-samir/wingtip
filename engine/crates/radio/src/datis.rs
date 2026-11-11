//! A digital ATIS as the tower's data link sends it (the D-ATIS of STDDS's
//! TDES DATISData, the planner's wingtip.datis), read into the figures a
//! spoken one is read into (crate::atis), so the app shows either alike.
//!
//! A D-ATIS is the broadcast's words written as the tower's system codes
//! them (AIM 4-1-13 orders what it says): the field, ARR or DEP, INFO and
//! the letter, the time ("0353Z"), the weather as a METAR's groups
//! ("VRB03KT 10SM SCT250 07/03 A3006"), then the approaches and runways in
//! use and the NOTAMs in the FAA's contractions (FAA Order JO 7340.2:
//! RWY runway, APCH approach, DEPG departing, LNDG landing, CLSD closed).
//! The weather is read by the METAR reader (wingtip-weather's metar), the
//! rest by the spoken reader with the contractions said in full; a figure
//! neither reads is left out, never guessed.
//!
//! Example (KMSP, 2026-11-09 0353Z, as the feed sent it):
//! "MSP ARR INFO I 0353Z. VRB03KT 10SM SCT250 07/03 A3006 (THREE ZERO ZERO
//! SIX). VISUAL RWY 30L APCH IN USE, VISUAL RWY 30R APCH IN USE. NOTICE TO
//! AIRMEN. RWYS 4, 22 CLSD. ... ADVS YOU HAVE INFO I."

use crate::atis::{read, Atis, Layer, Wind};
use wingtip_weather::{contractions, metar};

/// A contraction as said in full (FAA Order JO 7340.2, Contractions): the
/// engine's one table, which a NOTAM's words are read by too.
fn said(word: &str) -> Option<&'static str> {
    contractions::written(word)
}

/// A runway's side said in full: "30L" is "30 left", as a pilot says it.
fn runway_said(word: &str) -> Option<String> {
    let (digits, side) = word.split_at(word.len().checked_sub(1)?);
    let side = match side {
        "L" => "left",
        "R" => "right",
        "C" => "center",
        _ => return None,
    };
    (!digits.is_empty() && digits.len() <= 2 && digits.bytes().all(|b| b.is_ascii_digit())).then(|| format!("{digits} {side}"))
}

/// A word with its sentence's punctuation off.
fn bare(word: &str) -> &str {
    word.trim_matches(|c: char| matches!(c, '.' | ',' | ';' | ':'))
}

fn is_wind(word: &str) -> bool {
    word.ends_with("KT") && word.len() >= 7 && (word.starts_with("VRB") || word[..5].bytes().all(|b| b.is_ascii_digit()))
}

fn is_altimeter(word: &str) -> bool {
    word.len() == 5 && word.starts_with('A') && word[1..].bytes().all(|b| b.is_ascii_digit())
}

/// The METAR reader's cover as the spoken reader names it.
fn cover(code: &str) -> Option<&'static str> {
    Some(match code {
        "FEW" => "few",
        "SCT" => "scattered",
        "BKN" => "broken",
        "OVC" => "overcast",
        "VV" => "obscured",
        _ => return None,
    })
}

/// The D-ATIS read: its weather from its METAR groups, the rest as said.
/// A text with no METAR groups (no wind group, or no altimeter after it)
/// is read as a spoken broadcast.
pub fn read_datis(text: &str) -> Atis {
    let words: Vec<&str> = text.split_whitespace().map(bare).collect();
    let wind_at = words.iter().position(|w| is_wind(w));
    let alt_at = wind_at.and_then(|w| words[w..].iter().position(|a| is_altimeter(a)).map(|a| w + a));
    let (Some(wind_at), Some(alt_at)) = (wind_at, alt_at) else {
        return read(text);
    };
    // The rest of the broadcast, the contractions said in full and the
    // altimeter said again in words "(THREE ZERO ZERO SIX)" left out.
    let mut rest = Vec::new();
    let mut in_brackets = false;
    for raw in text.split_whitespace().skip(alt_at + 1) {
        if raw.starts_with('(') {
            in_brackets = true;
        }
        if !in_brackets {
            let word = bare(raw);
            match (said(word), runway_said(word)) {
                (Some(full), _) => rest.push(full.to_owned()),
                (None, Some(full)) => rest.push(full),
                _ => rest.push(raw.to_owned()),
            }
        }
        if raw.trim_end_matches(['.', ',']).ends_with(')') {
            in_brackets = false;
        }
    }
    let mut out = read(&rest.join(" "));
    out.raw = text.trim().to_owned();
    // The letter, after INFO in the heading ("MSP ARR INFO I 0353Z").
    out.information = words[..wind_at]
        .windows(2)
        .find(|w| w[0] == "INFO" && w[1].len() == 1)
        .and_then(|w| w[1].chars().next())
        .filter(char::is_ascii_uppercase);
    out.time_z = words[..wind_at]
        .iter()
        .find(|w| w.len() == 5 && w.ends_with('Z') && w[..4].bytes().all(|b| b.is_ascii_digit()))
        .map(|w| (*w).to_owned());
    // The weather groups read as a METAR of no station's: its station and
    // time are the reader's to have, not this broadcast's.
    if let Some(m) = metar::parse(&format!("XXXX 010000Z {}", words[wind_at..=alt_at].join(" "))) {
        out.wind = m.wind.map(|w| {
            let calm = w.speed_kt == 0.0;
            Wind {
                from_deg: if calm { None } else { w.dir_true_deg.map(|d| d.round() as i64) },
                kt: Some(w.speed_kt.round() as i64),
                gust_kt: w.gust_kt.map(|g| g.round() as i64),
                variable: w.dir_true_deg.is_none() && !calm,
            }
        });
        out.visibility_sm = m.visibility_sm;
        out.sky = m
            .layers
            .iter()
            .filter_map(|l| Some(Layer { cover: cover(&l.cover)?, base_ft: l.base_ft_agl.map(|b| b.round() as i64) }))
            .collect();
        out.temp_c = m.temp_c.map(|t| t.round() as i64);
        out.dewpoint_c = m.dewpoint_c.map(|t| t.round() as i64);
        out.altimeter_inhg = m.altimeter_inhg;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const MSP: &str = "-  MSP ARR INFO I 0353Z. VRB03KT 10SM SCT250 07/03 A3006 (THREE ZERO ZERO SIX). VISUAL RWY 30L APCH IN USE, VISUAL RWY 30R APCH IN USE. NOTICE TO AIRMEN. RWYS 4, 22 CLSD. RWYS 12R AND 12L INNER MARKER OTS. CTN, BIRDS NEAR MSP. READ BACK HS AND ALT. ALL ACFT TAXI WITH TRANSPONDER AND ALTITUDE ENCODING ON. ...ADVS YOU HAVE INFO I.";

    #[test]
    fn a_d_atis_gives_its_letter_time_and_weather_from_its_metar_groups() {
        let r = read_datis(MSP);
        assert_eq!(r.information, Some('I'));
        assert_eq!(r.time_z.as_deref(), Some("0353Z"));
        assert_eq!(r.wind, Some(Wind { from_deg: None, kt: Some(3), gust_kt: None, variable: true }));
        assert_eq!(r.visibility_sm, Some(10.0));
        assert_eq!(r.sky, vec![Layer { cover: "scattered", base_ft: Some(25000) }]);
        assert_eq!((r.temp_c, r.dewpoint_c, r.altimeter_inhg), (Some(7), Some(3), Some(30.06)));
        assert_eq!(r.raw, MSP.trim());
    }

    #[test]
    fn its_contractions_are_read_as_said() {
        assert_eq!(runway_said("30L").as_deref(), Some("30 left"));
        assert_eq!(runway_said("4"), None);
        assert_eq!(said("APCH"), Some("approach"));
        let r = read_datis("ORD INFO K 1351Z. 27015G25KT 3SM BR OVC008 M02/M04 A2992. ILS RWY 27L APCH IN USE. DEPG RWY 28R.");
        assert_eq!(r.wind, Some(Wind { from_deg: Some(270), kt: Some(15), gust_kt: Some(25), variable: false }));
        assert_eq!(r.sky, vec![Layer { cover: "overcast", base_ft: Some(800) }]);
        assert_eq!((r.temp_c, r.dewpoint_c), (Some(-2), Some(-4)));
        assert!(r.approach.as_deref().unwrap_or("").contains("ILS"), "{:?}", r.approach);
    }

    #[test]
    fn calm_is_no_direction_and_a_spoken_broadcast_is_read_as_one() {
        let r = read_datis("DSM INFO B 1153Z. 00000KT 10SM CLR 12/01 A3011.");
        assert_eq!(r.wind, Some(Wind { from_deg: None, kt: Some(0), gust_kt: None, variable: false }));
        let spoken = "Milwaukee information Charlie, wind calm, altimeter two niner niner two";
        assert_eq!(read_datis(spoken).to_json(), read(spoken).to_json());
    }
}
