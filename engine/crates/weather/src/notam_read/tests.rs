//! NOTAMs in the forms JO 7930.2's examples give them (Appendix A), with
//! Oshkosh's places and times, read as a pilot reads them.

use super::*;

fn words(text: &str) -> String {
    read(text, &[]).words
}

#[test]
fn a_closed_runway_is_its_runway_closed_with_its_window_in_utc() {
    // JO 7930.2 5-1-3 c: "RWY 36 CLSD"; 4-2-1: YYMMDDHHMM-YYMMDDHHMM, UTC.
    let r = read("!OSH 11/041 OSH RWY 18/36 CLSD 2511120900-2511121700", &[]);
    assert_eq!((r.form, r.number.as_deref(), r.location.as_deref()), ("domestic", Some("11/041"), Some("OSH")));
    assert_eq!((r.keyword.as_deref(), r.heading.as_deref()), (Some("RWY"), Some("Runway")));
    assert_eq!(r.words, "Runway 18/36 closed.");
    assert_eq!((r.starts.as_deref(), r.ends.as_deref()), (Some("2025-11-12T09:00:00Z"), Some("2025-11-12T17:00:00Z")));
    assert!(!r.estimated && !r.permanent);
}

#[test]
fn a_papi_out_of_service_until_an_estimated_time() {
    // 5-2-1 d: "RWY 01L PAPI U/S"; 4-2-1: an end followed by EST.
    let r = read("!OSH 11/052 OSH RWY 27 PAPI U/S 2511101200-2512012359EST", &[]);
    assert_eq!(r.words, "Runway 27 PAPI out of service.");
    assert_eq!((r.ends.as_deref(), r.estimated), (Some("2025-12-01T23:59:00Z"), true));
}

#[test]
fn a_crane_is_its_height_msl_and_above_ground_and_where_it_is() {
    // 5-2-2: "OBST CRANE (ASN ...) 345140N0804506W (1.44NM SW N52) 580FT
    // (195FT AGL) FLAGGED, NOT LGTD"; 4-2-1: feet are MSL unless stated.
    let r = read(
        "!OSH 11/060 OSH OBST CRANE (ASN 2025-AGL-1234-NRA) 435800N0883300W (1.2NM SE OSH) 1047FT (210FT AGL) FLAGGED AND LGTD 2511110000-2512312359",
        &[],
    );
    assert_eq!(r.heading.as_deref(), Some("Obstacle"));
    assert_eq!(
        r.words,
        "Crane (ASN 2025-AGL-1234-NRA) 43°58′00″N 88°33′00″W (1.2 nm southeast of OSH) 1,047 ft MSL (210 ft above ground) flagged and lighted."
    );
}

#[test]
fn a_tfr_is_its_place_its_area_and_its_altitudes() {
    // 7-1-5: "!FDC y/nnnn ZLC MT..AIRSPACE MISSOULA, MT..TEMPORARY FLIGHT
    // RESTRICTIONS ... WI AN AREA DEFINED AS 3NM RADIUS OF ... SFC-10000FT".
    let r = read(
        "!FDC 5/2345 ZMP WI..AIRSPACE OSHKOSH, WI..TEMPORARY FLIGHT RESTRICTIONS WI AN AREA DEFINED AS 3NM RADIUS OF 435904N0883327W (OSH) SFC-3000FT. 2511151400-2511152200",
        &[],
    );
    assert_eq!((r.keyword.as_deref(), r.heading.as_deref()), (Some("AIRSPACE"), Some("Temporary flight restriction")));
    assert_eq!(
        r.words,
        "Oshkosh, WI. Temporary flight restrictions within an area defined as 3 nm radius of 43°59′04″N 88°33′27″W (OSH) surface to 3,000 ft MSL."
    );
}

#[test]
fn an_amended_approach_keeps_its_codes_and_its_place() {
    // 7-1-3 i: "!FDC x/xxxx ORD IAP CHICAGO O'HARE INTL, CHICAGO, IL. VOR RWY
    // 22R AMDT 8B... MDA 1400/ HAT 750, VIS 1-1/2 ALL CATS. TEMPORARY CRANE
    // 1100 MSL 1.2 NM SE OF RWY 23".
    let r = read(
        "!FDC 5/1234 OSH IAP WITTMAN RGNL, OSHKOSH, WI. RNAV (GPS) RWY 36, AMDT 2... LPV DA 1095/HAT 300 ALL CATS. TEMPORARY CRANE 1047 MSL 1.2 NM SE OF RWY 36. 2511120000-2602122359EST",
        &[],
    );
    assert_eq!(r.heading.as_deref(), Some("Instrument approach"));
    assert_eq!(
        r.words,
        "Wittman Regional, Oshkosh, WI. RNAV (GPS) runway 36, amendment 2... LPV DA 1095/HAT 300 all categories. Temporary crane 1047 MSL 1.2 nm southeast of runway 36."
    );
    assert!(r.estimated);
}

#[test]
fn a_taxiway_between_two_others_keeps_their_designators() {
    // 3-3-6: "TWY A BTN TWY B AND RWY 01/19".
    assert_eq!(
        words("!OSH 11/070 OSH TWY A BTN TWY B AND TWY C CLSD 2511120000-2511202359"),
        "Taxiway A between taxiway B and taxiway C closed."
    );
    assert_eq!(words("!OSH 11/071 OSH TWY B3, C, N CLSD 2511120000-PERM"), "Taxiway B3, C, N closed.");
    assert!(read("!OSH 11/071 OSH TWY B3, C, N CLSD 2511120000-PERM", &[]).permanent);
}

#[test]
fn the_icao_form_is_read_from_its_items() {
    let r = read(
        "A1234/25 NOTAMN Q) KZMP/QMRLC/IV/NBO/A/000/999/4359N08833W005 A) KOSH B) 2511120900 C) 2511121700 EST E) RWY 18/36 CLSD",
        &[],
    );
    assert_eq!((r.form, r.number.as_deref(), r.location.as_deref()), ("icao", Some("A1234/25"), Some("KOSH")));
    assert_eq!((r.heading.as_deref(), r.words.as_str()), (Some("Runway"), "Runway 18/36 closed."));
    assert_eq!((r.starts.as_deref(), r.ends.as_deref(), r.estimated), (Some("2025-11-12T09:00:00Z"), Some("2025-11-12T17:00:00Z"), true));
    // Appendix B: the Q) code's subject where E) has no keyword.
    let r = read("A1240/25 NOTAMN Q) KZMP/QOBCE/IV/M/A/000/011/4359N08833W001 A) KOSH B) 2511120900 C) PERM E) CRANE", &[]);
    assert_eq!((r.heading.as_deref(), r.permanent), (Some("Obstacle"), true));
}

#[test]
fn what_is_not_known_is_kept_as_written() {
    // A word the table does not know is set in lower case, never another
    // word; a code and an ident are kept; text in lower case is as sent.
    assert_eq!(
        words("!OSH 11/080 OSH AD AP WINDCONE FOR RWY 18 LGT U/S 2511120000-2511202359"),
        "Airport windcone for runway 18 light out of service."
    );
    assert_eq!(words("!OSH 11/081 OSH NAV ILS RWY 36 GP U/S 2511120000-2511202359"), "ILS runway 36 glide path out of service.");
    assert_eq!(words("Runway 18 closed for paint"), "Runway 18 closed for paint");
    assert_eq!(read("RWY 18 CLSD", &[]).form, "text");
}

#[test]
fn its_title_names_the_thing_its_subject_words_say() {
    let title = |text: &str| read(text, &[]).title;
    let cases = [
        // RWY (JO 7930.2 1-2-1), its designation as written (3-3-5).
        ("!OSH 11/041 OSH RWY 06/24 CLSD EXC XNG 2511120900-2511121700", Some("Runway 06/24")),
        ("!ORD 11/041 ORD RWY 04L/22R CLSD 2511120900-2511121700", Some("Runway 04L/22R")),
        ("!OSH 11/052 OSH RWY 27 PAPI U/S 2511101200-2512012359EST", Some("Runway 27 PAPI")),
        // TWY (3-3-6): the taxiways first, not those it runs between.
        ("!OSH 11/070 OSH TWY A BTN TWY B AND TWY C CLSD 2511120000-2511202359", Some("Taxiway A")),
        ("!OSH 11/071 OSH TWY B, C CLSD 2511120000-2511202359", Some("Taxiways B and C")),
        ("!OSH 11/072 OSH APRON C CLSD 2511120000-2511202359", Some("Apron C")),
        ("!OSH 11/073 OSH NAV ILS RWY 09 GP U/S 2511120000-2511202359", Some("Glide slope runway 09")),
        ("!OSH 11/074 OSH NAV ILS RWY 09 U/S 2511120000-2511202359", Some("ILS runway 09")),
        ("!OSH 11/075 OSH NAV OSH VOR U/S 2511120000-2511202359", Some("OSH VOR")),
        // IAP, the FDC form (7-1-3): the procedure as the plate prints it.
        (
            "!FDC 5/1234 OSH IAP WITTMAN RGNL, OSHKOSH, WI. RNAV (GPS) RWY 36, AMDT 2... LPV DA 1095/HAT 300 ALL CATS. 2511120000-2602122359EST",
            Some("RNAV (GPS) RWY 36"),
        ),
        ("!OSH 11/060 OSH OBST CRANE (ASN 2025-AGL-1234-NRA) 435800N0883300W 1047FT (210FT AGL) 2511110000-2512312359", Some("Obstacle: crane")),
        ("!OSH 11/076 OSH SVC FUEL 100LL NOT AVBL 2511120000-2511202359", Some("Fuel 100LL")),
        ("!OSH 11/077 OSH AD AP JET A FUEL NOT AVBL 2511120000-2511202359", Some("Fuel Jet A")),
        ("!OSH 11/078 OSH COM TWR 120.75 U/S 2511120000-2511202359", Some("Tower 120.75")),
        ("!OSH 11/079 OSH AD AP BCN U/S 2511120000-2511202359", Some("Aerodrome beacon")),
        ("!OSH 11/082 OSH AD AP CLSD 2511120000-2511202359", Some("Aerodrome closed")),
        ("A1234/25 NOTAMN Q) KZMP/QMRLC/IV/NBO/A/000/999/4359N08833W005 A) KOSH B) 2511120900 C) 2511121700 EST E) RWY 18/36 CLSD", Some("Runway 18/36")),
        // Nothing it knows: the heading is the title.
        ("!OSH 11/080 OSH AD AP WINDCONE FOR RWY 18 LGT U/S 2511120000-2511202359", None),
        ("!OSH 11/083 OSH TWY ALL CLSD 2511120000-2511202359", None),
        ("Runway 18 closed for paint", None),
    ];
    for (text, want) in cases {
        assert_eq!(title(text).as_deref(), want, "{text}");
    }
}
