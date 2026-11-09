//! FIS-B's products (AIM 4-5-9; RTCA DO-358B) read out of their APDUs:
//! the text ones -- METARs, TAFs, the winds aloft and PIREPs as generic
//! text (product 413), NOTAMs and TFRs, AIRMETs, SIGMETs, SUA status,
//! G-AIRMETs and Center Weather Advisories as DO-358B's text records (the
//! "TWGO" products) -- and the NEXRAD (63 regional, 64 CONUS), which
//! nexrad.rs reads. AIM 4-5-9: FIS-B "should not be the only source of
//! weather or aeronautical information", and a pilot should know the
//! limits of its NEXRAD and its NOTAMs and TFRs (AC 00-63).

use crate::dlac;
use crate::nexrad::{self, Block};
use crate::uplink::Apdu;

/// One text product: what it is, where it is for, its number where it
/// has one, and its words as sent.
#[derive(Clone, Debug, PartialEq)]
pub struct Text {
    pub product: u16,
    /// "METAR", "SPECI", "TAF", "WINDS", "PIREP" ... from the record's
    /// first word, or the TWGO product's name ("NOTAM", "AIRMET" ...).
    pub kind: String,
    /// The station or the issuing office.
    pub location: Option<String>,
    /// A TWGO record's report number and year (its key while in force).
    pub number: Option<u32>,
    /// The words as sent; for product 413 the report less its kind, so a
    /// METAR reads as the METAR reader takes it ("KORD 091453Z ...").
    pub text: String,
    /// A TWGO record sent cancelled: it is no longer in force.
    pub cancelled: bool,
    /// The APDU's time, "HHMMZ".
    pub time: String,
}

/// What an APDU held.
pub enum Product {
    Texts(Vec<Text>),
    /// NEXRAD blocks: each with its bins, or empty (none of them has
    /// precipitation: what was drawn there before is gone).
    Nexrad { regional: bool, blocks: Vec<Block>, empty: Vec<u32> },
    /// A product the app does not read (the graphics of icing, cloud
    /// tops, turbulence, lightning; a TWGO product's graphic records).
    Other,
}

/// The TWGO products' names by product ID (DO-358B, its product table).
fn twgo_name(product: u16) -> Option<&'static str> {
    Some(match product {
        8 => "NOTAM",
        11 => "AIRMET",
        12 => "SIGMET",
        13 => "SUA",
        14 => "G-AIRMET",
        15 => "CWA",
        16 => "NOTAM-TRA",
        17 => "NOTAM-TMOA",
        _ => return None,
    })
}

/// The product in an APDU.
pub fn read(apdu: &Apdu) -> Product {
    let time = format!("{:02}{:02}Z", apdu.hours, apdu.minutes);
    match apdu.product {
        413 => Product::Texts(generic_text(&apdu.payload, &time)),
        63 | 64 => match nexrad::read(&apdu.payload) {
            Some(nexrad::Read::Bins(block)) => Product::Nexrad { regional: apdu.product == 63, blocks: vec![block], empty: vec![] },
            Some(nexrad::Read::Empty(ids)) => Product::Nexrad { regional: apdu.product == 63, blocks: vec![], empty: ids },
            None => Product::Other,
        },
        p => match twgo_name(p) {
            Some(name) => Product::Texts(twgo(p, name, &apdu.payload, &time)),
            None => Product::Other,
        },
    }
}

/// Product 413, generic text in DLAC: reports one after another, each
/// ended by a record separator (or the text's end), each "KIND LOCATION
/// ...": "METAR KORD 091453Z 27012KT ...", "TAF KORD 091120Z ...",
/// "WINDS ORD 091200Z ...", "PIREP ...".
fn generic_text(payload: &[u8], time: &str) -> Vec<Text> {
    let text = dlac::decode(payload);
    let mut out = Vec::new();
    for record in text.split([dlac::RS, dlac::ETX]) {
        let record = record.trim();
        let Some((kind, rest)) = record.split_once(' ') else { continue };
        let rest = rest.trim();
        if rest.is_empty() {
            continue;
        }
        // An amended TAF is sent "TAF.AMD".
        let kind = kind.split('.').next().unwrap_or(kind).to_owned();
        let location = rest.split_whitespace().next().map(str::to_owned);
        out.push(Text { product: 413, kind, location, number: None, text: rest.to_owned(), cancelled: false, time: time.to_owned() });
    }
    out
}

/// A TWGO product's text records (DO-358B's record format 2): a 6-byte
/// header -- the record format, product version, record count, the
/// location in DLAC and the record reference point -- then each record:
/// its length (16 bits, itself included), the report number (14 bits),
/// the year (7 bits), its status (1: active, 0: cancelled) and its words
/// in DLAC. Graphic records (format 8) are passed over.
fn twgo(product: u16, name: &str, d: &[u8], time: &str) -> Vec<Text> {
    let mut out = Vec::new();
    if d.len() < 6 || d[0] >> 4 != 2 {
        return out;
    }
    let count = (d[1] >> 4) as usize;
    let location = dlac::decode(&d[2..5]).trim_matches([' ', dlac::ETX]).to_owned();
    let mut at = 6;
    for _ in 0..count.max(1) {
        let Some(head) = d.get(at..at + 5) else { break };
        let length = u16::from_be_bytes([head[0], head[1]]) as usize;
        if length < 5 || at + length > d.len() {
            break;
        }
        let number = (head[2] as u32) << 6 | (head[3] >> 2) as u32;
        let active = head[4] & 0x04 != 0;
        let words = dlac::decode(&d[at + 5..at + length]);
        let words = words.trim_matches(|c: char| c.is_whitespace() || c == dlac::ETX || c == dlac::RS);
        out.push(Text {
            product,
            kind: name.to_owned(),
            location: (!location.is_empty()).then(|| location.clone()),
            number: Some(number),
            text: words.to_owned(),
            cancelled: !active,
            time: time.to_owned(),
        });
        at += length;
    }
    out
}

/// A TWGO text record built as a ground station sends one, for the tests
/// and fixtures.
pub fn twgo_built(location: &str, number: u32, active: bool, words: &str) -> Vec<u8> {
    let text = dlac::encode(words);
    let mut d = vec![0x20, 0x10];
    let mut loc = dlac::encode(&format!("{location:<4}"));
    loc.resize(3, 0);
    d.extend(loc);
    d.push(0);
    d.extend(((5 + text.len()) as u16).to_be_bytes());
    d.extend([(number >> 6) as u8, ((number & 0x3F) << 2) as u8, if active { 0x04 } else { 0 }]);
    d.extend(text);
    d
}

#[cfg(test)]
mod tests {
    use super::*;

    fn apdu(product: u16, payload: Vec<u8>) -> Apdu {
        Apdu { product, hours: 14, minutes: 53, segmented: false, payload }
    }

    #[test]
    fn generic_text_reports() {
        let sent = "METAR KORD 091453Z 27012KT 10SM FEW050 08/M02 A3012\u{1e}TAF.AMD KORD 091520Z 0915/1018 27012KT P6SM SCT050\u{1e}";
        let Product::Texts(t) = read(&apdu(413, dlac::encode(sent))) else { panic!() };
        assert_eq!(t.len(), 2);
        assert_eq!((t[0].kind.as_str(), t[0].location.as_deref()), ("METAR", Some("KORD")));
        assert_eq!(t[0].text, "KORD 091453Z 27012KT 10SM FEW050 08/M02 A3012");
        assert_eq!(t[0].time, "1453Z");
        assert_eq!(t[1].kind, "TAF");
    }

    #[test]
    fn twgo_text_records() {
        let sent = twgo_built("KZAU", 4321, true, "TFR 6/1234 CHICAGO IL SFC-3000FT");
        let Product::Texts(t) = read(&apdu(8, sent)) else { panic!() };
        assert_eq!(t.len(), 1);
        assert_eq!((t[0].kind.as_str(), t[0].location.as_deref(), t[0].number), ("NOTAM", Some("KZAU"), Some(4321)));
        assert_eq!(t[0].text, "TFR 6/1234 CHICAGO IL SFC-3000FT");
        assert!(!t[0].cancelled);
        let Product::Texts(t) = read(&apdu(11, twgo_built("KZAU", 7, false, "AIRMET"))) else { panic!() };
        assert!(t[0].cancelled);
        assert!(matches!(read(&apdu(70, vec![0; 10])), Product::Other));
    }
}
