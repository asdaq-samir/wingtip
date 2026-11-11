//! NOTAMs in the forms FAA Order JO 7930.2 gives them, against a card like
//! Duluth's (KDLH): runways 09/27 and 03/21, a PAPI and a MALSR, an ILS
//! and an RNAV approach, a tower, an ATIS and an AWOS.

use super::*;

fn card() -> Card {
    Card {
        idents: vec!["DLH".into(), "KDLH".into()],
        runways: vec!["09/27".into(), "03/21".into()],
        lights: vec![
            CardLight { code: Some("PAPI".into()), name: "Precision approach path indicator".into(), runways: vec!["27".into()] },
            CardLight { code: Some("MALSR".into()), name: "Approach lights".into(), runways: vec!["09".into()] },
            CardLight { code: None, name: "Rotating beacon".into(), runways: vec![] },
            CardLight { code: Some("PAPI".into()), name: "Precision approach path indicator".into(), runways: vec!["03".into()] },
        ],
        approaches: vec![
            "ILS OR LOC RWY 09".into(),
            "RNAV (GPS) RWY 27".into(),
            "LOC BC RWY 27".into(),
            "ILS RWY 09 (CAT II - III)".into(),
        ],
        frequencies: vec![(Some("TWR".into()), Some(118.3)), (Some("ATIS".into()), Some(124.1)), (Some("AWOS-3".into()), Some(119.025))],
    }
}

/// Each badge's place, word and how bad, its label left out.
fn said(text: &str) -> Vec<(On, &'static str, Severity)> {
    subject(text, false, &card()).into_iter().map(|b| (b.on, b.word, b.severity)).collect()
}

use On::*;
use Severity::*;

#[test]
fn a_runway_closed_is_closed_and_its_qualifiers_said() {
    // RWY (1-2-1), its designation as written (3-3-5): "09/27" is the
    // card's 09/27; "9/27" and one end, "27", are too.
    assert_eq!(said("!DLH 11/042 DLH RWY 09/27 CLSD 2611101200-2611121432"), [(Runway(0), "Closed", Unusable)]);
    assert_eq!(said("!DLH 11/043 DLH RWY 3/21 CLSD 2611101200-2611121432"), [(Runway(1), "Closed", Unusable)]);
    // Closed to landing and takeoff, open to cross: closed, and said so.
    let b = subject("!DLH 11/044 DLH RWY 03/21 CLSD EXC XNG 2611101200-2611121432", false, &card());
    assert_eq!((b[0].on, b[0].word, b[0].severity), (Runway(1), "Closed", Unusable));
    assert!(b[0].label.ends_with("Still closed to landing and takeoff."), "{}", b[0].label);
    assert_eq!(said("!DLH 11/045 DLH RWY 09/27 CLSD EXC PPR 2611101200-2611121432"), [(Runway(0), "Closed", Unusable)]);
    // To some aircraft, at some times, or part of it: never "Closed".
    assert_eq!(
        said("!DLH 11/046 DLH RWY 09/27 CLSD TO ACFT MORE THAN 12500LB 2611101200-2611121432"),
        [(Runway(0), "Restricted", Caution)]
    );
    assert_eq!(said("!DLH 11/047 DLH RWY 09/27 CLSD DLY 0400-1100 2611101200-2611121432"), [(Runway(0), "Closed at times", Caution)]);
    assert_eq!(said("!DLH 11/048 DLH RWY 09/27 E 500FT CLSD 2611101200-2611121432"), [(Runway(0), "Part closed", Caution)]);
    // Another runway's: no badge on this card's.
    assert_eq!(said("!DLH 11/049 DLH RWY 18/36 CLSD 2611101200-2611121432"), []);
}

#[test]
fn the_06_24_closure_except_crossing_is_closed() {
    let card = Card { runways: vec!["06/24".into()], ..Card::default() };
    let b = subject("!ABC 11/001 ABC RWY 06/24 CLSD EXC XNG 2611101200-2611121432", false, &card);
    assert_eq!((b.len(), b[0].on, b[0].word, b[0].severity), (1, Runway(0), "Closed", Unusable));
}

#[test]
fn a_taxiway_between_runways_badges_no_runway() {
    // TWY is the keyword (1-2-1): the runway it names is where the
    // taxiway is (3-3-6), not what is closed.
    assert_eq!(said("!DLH 11/050 DLH TWY A BTN RWY 09 AND TWY C CLSD 2611101200-2611121432"), []);
    assert_eq!(said("!DLH 11/051 DLH TWY A BTN TWY B AND TWY C CLSD 2611101200-2611121432"), []);
}

#[test]
fn a_runway_light_is_the_lights_and_the_runways() {
    // RWY 27 PAPI U/S: the PAPI serving 27, not 03's; runway 09/27 a NOTAM.
    assert_eq!(
        said("!DLH 11/052 DLH RWY 27 PAPI U/S 2611101200-2611202359EST"),
        [(Light(0), "Out of service", Caution), (Runway(0), "NOTAM", Caution)]
    );
    // ALS names the MALSR (AIM 2-1-1).
    assert_eq!(
        said("!DLH 11/053 DLH RWY 09 ALS U/S 2611101200-2611202359"),
        [(Light(1), "Out of service", Caution), (Runway(0), "NOTAM", Caution)]
    );
    assert_eq!(said("!DLH 11/054 DLH AD AP BCN U/S 2611101200-2611202359"), [(Light(2), "Out of service", Caution)]);
}

#[test]
fn a_navaid_is_on_the_approaches_that_use_it() {
    // The glide slope: the ILS's charts, not the RNAV's or the back course.
    assert_eq!(
        said("!DLH 11/055 DLH NAV ILS RWY 09 GP U/S 2611101200-2611202359"),
        [(Approach(0), "Out of service", Caution), (Approach(3), "Out of service", Caution)]
    );
    // A VOR names no approach by itself: none.
    assert_eq!(said("!DLH 11/056 DLH NAV DLH VOR U/S 2611101200-2611202359"), []);
}

#[test]
fn an_approach_by_its_title() {
    // The FDC form (7-1-3): the field's name, then the procedure's title.
    let na = "!FDC 6/1234 DLH IAP DULUTH INTL, DULUTH, MN. RNAV (GPS) RWY 27, AMDT 2... PROCEDURE NA. 2611101200-2611202359";
    assert_eq!(said(na), [(Approach(1), "Not authorized", Unusable)]);
    let changed =
        "!FDC 6/1235 DLH IAP DULUTH INTL, DULUTH, MN. ILS OR LOC RWY 9, AMDT 8B... S-ILS 9 DA 1640/HAT 250. 2611101200-2611202359";
    assert_eq!(said(changed), [(Approach(0), "Changed", Caution)]);
    // PROCEDURE TURN NA is not the procedure's.
    let turn = "!FDC 6/1236 DLH IAP DULUTH INTL, DULUTH, MN. RNAV (GPS) RWY 27, AMDT 2... PROCEDURE TURN NA. 2611101200-2611202359";
    assert_eq!(said(turn), [(Approach(1), "Changed", Caution)]);
}

#[test]
fn a_frequency_by_its_mhz_or_its_facility() {
    assert_eq!(said("!DLH 11/057 DLH COM TWR 118.3 U/S 2611101200-2611202359"), [(Frequency(0), "Out of service", Caution)]);
    assert_eq!(said("!DLH 11/058 DLH COM ATIS U/S 2611101200-2611202359"), [(Frequency(1), "Out of service", Caution)]);
    assert_eq!(said("!DLH 11/059 DLH AD AP AWOS NOT AVBL 2611101200-2611202359"), [(Frequency(2), "Not available", Caution)]);
    // Another field's frequency, or none named: none.
    assert_eq!(said("!DLH 11/060 DLH COM RCO 122.55 U/S 2611101200-2611202359"), []);
}

#[test]
fn fuel_is_the_fuel_rows() {
    assert_eq!(said("!DLH 11/061 DLH SVC FUEL 100LL NOT AVBL 2611101200-2611202359"), [(Fuel, "Not available", Caution)]);
    assert_eq!(said("!DLH 11/062 DLH AD AP 100LL FUEL NOT AVBL 2611101200-2611202359"), [(Fuel, "Not available", Caution)]);
}

#[test]
fn the_field_closed_and_a_tfr() {
    assert_eq!(said("!DLH 11/063 DLH AD AP CLSD 2611101200-2611202359"), [(Field, "Closed", Unusable)]);
    assert_eq!(said("!DLH 11/064 DLH AD AP CLSD DLY 0500-1100 2611101200-2611202359"), [(Field, "Closed at times", Caution)]);
    assert_eq!(subject("anything", true, &card())[0].word, "TFR");
    // Something else of the field's, or an obstacle: no badge.
    assert_eq!(said("!DLH 11/065 DLH AD AP WINDCONE U/S 2611101200-2611202359"), []);
    assert_eq!(said("!DLH 11/066 DLH OBST CRANE 465000N0921200W (1.2NM SE DLH) 1600FT (210FT AGL) 2611101200-2611202359"), []);
}

#[test]
fn the_icao_form_is_read_from_e_and_q() {
    let rwy = "A1234/26 NOTAMN Q) KZMP/QMRLC/IV/NBO/A/000/999/4650N09211W005 A) KDLH B) 2611120900 C) 2611121700 EST E) RWY 09/27 CLSD";
    assert_eq!(said(rwy), [(Runway(0), "Closed", Unusable)]);
    let ad = "A1235/26 NOTAMN Q) KZMP/QFALC/IV/NBO/A/000/999/4650N09211W005 A) KDLH B) 2611120900 C) 2611121700 E) AD CLSD";
    assert_eq!(said(ad), [(Field, "Closed", Unusable)]);
    let papi = "A1236/26 NOTAMN Q) KZMP/QLPAS/IV/NBO/A/000/999/4650N09211W005 A) KDLH B) 2611120900 C) 2611121700 E) PAPI RWY 27 U/S";
    assert_eq!(said(papi), [(Light(0), "Out of service", Caution)]);
}

#[test]
fn what_it_answers() {
    let v = crate::json::parse(r#"{"text":"!DLH 11/042 DLH RWY 09/27 CLSD 2611101200-2611121432","runways":["09/27"]}"#).unwrap();
    assert_eq!(
        call("notam_subject", &v).unwrap(),
        r#"{"badges":[{"on":"runway","index":0,"word":"Closed","severity":"unusable","label":"Runway 09/27 closed."}]}"#
    );
    assert!(call("notam_subject", &crate::json::parse("{}").unwrap()).is_err());
}
