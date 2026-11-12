//! The four lines of NOTAMs in the forms FAA Order JO 7930.2 gives them,
//! KORD's and DLH's as the FAA's feed sent them (2026-11-11).

use super::read;

/// What, where and why of `text`, the field's idents ORD and KORD.
fn four(text: &str) -> (Option<String>, Option<String>, Option<String>) {
    let r = read(text, &["ORD".to_owned(), "KORD".to_owned()]);
    (r.what, r.place, r.why)
}

fn some(s: &str) -> Option<String> {
    Some(s.to_owned())
}

#[test]
fn a_runway_closed_says_what_is_still_allowed_and_no_where() {
    assert_eq!(
        four("!ORD 11/435 ORD RWY 04L/22R CLSD EXC TAX 2611111120-2611121200"),
        (some("Runway 04L/22R closed except taxiing"), None, some("No landing or takeoff on it while it is closed. It may be taxied on."))
    );
    // The ICAO form, another field's, its schedule (D) in the what.
    let icao = "A0917/26 NOTAMN Q) KZFW/QMRLC////000/999/3226N09349W005 A) KSHV B) 2611010000 C) 2611301200 D) DLY SS-SR E) RWY 06/24 CLSD EXC XNG";
    assert_eq!(
        four(icao),
        (
            some("Runway 06/24 closed except crossing, daily sunset to sunrise"),
            None,
            some("No landing or takeoff on it while it is closed. It may be crossed.")
        )
    );
    // Closed to some aircraft only: no what of ours, the words stand.
    let (what, place, why) = four("!ORD 10/175 ORD TWY A2 BTN TWY A AND TWY B CLSD TO ACFT WINGSPAN MORE THAN 118FT 2610311030-2611261200");
    assert_eq!((what, place.as_deref(), why), (None, None, None));
}

#[test]
fn a_taxiway_closed_between_two_others() {
    assert_eq!(
        four("!ORD 11/070 ORD TWY A BTN TWY B AND TWY C CLSD 2611120000-2611202359"),
        (some("Taxiway A closed between taxiway B and taxiway C"), None, None)
    );
}

#[test]
fn a_runway_light_and_what_it_takes_away() {
    // AIM 2-1-2: a PAPI is visual glide path guidance.
    assert_eq!(
        four("!ORD 11/052 ORD RWY 27 PAPI U/S 2611101200-2612012359EST"),
        (some("Runway 27 PAPI out of service"), None, some("No visual glide path guidance to runway 27."))
    );
    let (what, _, why) = four("!ORD 11/053 ORD RWY 10R ALS U/S 2611101200-2612012359");
    assert_eq!(what.as_deref(), Some("Runway 10R ALS out of service"));
    assert!(why.is_some_and(|w| w.starts_with("Visibility minimums may be higher")));
}

#[test]
fn an_ils_part_and_what_it_leaves() {
    // AIM 1-1-9: the glide slope out, a localizer approach; the
    // localizer out, no ILS approach.
    assert_eq!(
        four("!ORD 11/055 ORD NAV ILS RWY 09 GP U/S 2611101200-2611202359"),
        (
            some("Glide slope runway 09 out of service"),
            None,
            some("No vertical guidance: fly it as a localizer approach, to the chart's LOC minimums where it gives them.")
        )
    );
    assert_eq!(
        four("!ORD 11/441 ORD NAV ILS RWY 22R GP/LOC U/S 2611150800-2611151200"),
        (some("ILS runway 22R glide slope and localizer out of service"), None, some("No ILS or localizer approach to runway 22R."))
    );
    // The ICAO form, the place before its keyword in E).
    let icao = "A3362/26 NOTAMN Q) KZAU/QICAS////000/999/4158N08754W005 A) KORD B) 2611150300 C) 2611150900 E) ORD NAV ILS RWY 09R U/S";
    assert_eq!(four(icao).0.as_deref(), Some("ILS runway 09R out of service"));
    // A DME alone: said, no why.
    let (what, _, why) = four("!ORD 11/456 ORD NAV ILS RWY 27R DME U/S 2611120800-2611121200");
    assert_eq!((what.as_deref(), why), (Some("ILS runway 27R DME out of service"), None));
}

#[test]
fn kords_approach_notams() {
    // PROCEDURE NA: not authorized (JO 7340.2).
    let na = "!FDC 6/4918 ORD IAP CHICAGO O'HARE INTL, CHICAGO, IL. ILS Z RWY 10R (SA CAT I), ORIG-C ... ILS Z RWY 10R (SA CAT II AND III), ORIG-C ... PROCEDURE NA. TEMPORARY CRANES, UP TO 846 MSL, 1808FT SE OF RWY 10R (2024-AGL-15026 THRU 15039-NRA) 2611031515-2706152355EST";
    assert_eq!(
        four(na),
        (some("ILS Z RWY 10R (SA CAT I): not authorized"), None, some("It cannot be flown while this NOTAM is in force."))
    );
    // New minimums (AIM 5-1-3: FDC NOTAMs amend published approaches).
    let minimums = "!FDC 6/4920 ORD IAP CHICAGO O'HARE INTL, CHICAGO, IL. ILS Z OR LOC Z RWY 10R, ORIG-C... S-ILS 10R DA 945/HAT 265 ALL CATS. VIS RVR 2000 ALL CATS. TEMPORARY CRANES, UP TO 846 MSL, 1808FT SE OF RWY 10R (2024-AGL-15026 THRU 15039-NRA). 2611031518-2706152355EST";
    assert_eq!(
        four(minimums),
        (some("ILS Z OR LOC Z RWY 10R: new minimums"), None, some("The minimums in this NOTAM apply in place of the chart's."))
    );
}

#[test]
fn an_obstacle_its_height_and_where_it_is() {
    assert_eq!(
        four("!ORD 11/437 ORD OBST CRANE (ASN 2024-AGL-12392-NRA) 415841N0875616W (1.3NM W ORD) 759FT (145FT AGL) FLAGGED AND LGTD 2611111139-2611112300"),
        (
            some("Crane"),
            some("1.3 nm west of the field, 759 ft MSL (145 ft above ground)"),
            some("Its top is 759 ft MSL: keep clear of it.")
        )
    );
    // Its light out; a case number ending "-OE)" is no ICAO E) item.
    let (what, place, why) = four(
        "!ORD 10/784 ORD OBST TOWER LGT (ASN 2020-AGL-1577-OE) 415233N0875509W (6.0NM S ORD) 920FT (228FT AGL) U/S 2610211715-2612051715",
    );
    assert_eq!(what.as_deref(), Some("Tower light out of service"));
    assert_eq!(place.as_deref(), Some("6.0 nm south of the field, 920 ft MSL (228 ft above ground)"));
    assert!(why.is_some_and(|w| w.ends_with("hard to see at night.")));
}

#[test]
fn an_obstacles_tenths_are_rounded_up_to_whole_feet() {
    // KSJT's, as the FAA's feed sent it (2026-11-12): the survey's tenths,
    // said in whole feet and up, the top a pilot clears (JO 7930.2 5-2-2,
    // 4-2-1; 14 CFR 91.119). 2863.8 is 2,864, never 2,863.
    let r = read(
        "!SJT 11/073 SJT OBST TOWER LGT (ASR 1049326) 311207.00N1002759.60W (9.4NM S SJT) 2863.8FT (443.9FT AGL) U/S 2611080154-2703080154",
        &["SJT".to_owned(), "KSJT".to_owned()],
    );
    assert_eq!(r.what.as_deref(), Some("Tower light out of service"));
    assert_eq!(r.place.as_deref(), Some("9.4 nm south of the field, 2,864 ft MSL (444 ft above ground)"));
    assert!(r.why.is_some_and(|w| w.starts_with("Its top is 2,864 ft MSL: keep clear of it.")));
    // A tenth of zero stays the figure: 500.0 is 500, not 501.
    let (_, place, _) = four("!ORD 10/267 ORD OBST TOWER LGT (ASR 1227546) 312811.00N1002707.00W (7.1NM NNE ORD) 2336.9FT (500.0FT AGL) U/S 2610182314-2702152314");
    assert_eq!(place.as_deref(), Some("7.1 nm north-northeast of the field, 2,337 ft MSL (500 ft above ground)"));
}

#[test]
fn a_field_conditions_observed_time_is_not_said_again_when_it_is_its_start() {
    // KORD's FICON (2026-11-11): OBS AT is B)'s time, which the card says.
    let text = "A3595/26 NOTAMN\nQ) KZAU/QMRXX////000/999/4158N08754W005\nA) KORD\nB) 2611112003\nC) 2611122003\nE) RWY 09R FICON 5/5/5 100 PCT WET OBS AT 2611112003.";
    let r = read(text, &[]);
    assert!(!r.words.contains("2611112003"), "{}", r.words);
    assert!(r.words.ends_with("100 percent wet."), "{}", r.words);
    // Observed at another time: a fact of its own, kept.
    let other = text.replace("OBS AT 2611112003", "OBS AT 2611111950");
    assert!(read(&other, &[]).words.contains("OBS at 2611111950"));
}

#[test]
fn fuel_a_frequency_the_field_and_a_tfr() {
    assert_eq!(
        four("!ORD 11/061 ORD SVC FUEL 100LL NOT AVBL 2611101200-2611202359"),
        (some("100LL fuel not available"), None, some("Plan to fuel elsewhere."))
    );
    assert_eq!(
        four("!ORD 11/057 ORD COM TWR 120.75 U/S 2611101200-2611202359"),
        (some("Tower 120.75 out of service"), None, some("Use another of the field's frequencies (Chart Supplement)."))
    );
    assert_eq!(
        four("!ORD 11/063 ORD AD AP CLSD 2611101200-2611202359"),
        (some("Aerodrome closed"), None, some("No landing or takeoff at the field while it is closed."))
    );
    let tfr = "!FDC 5/2345 ZMP WI..AIRSPACE OSHKOSH, WI..TEMPORARY FLIGHT RESTRICTIONS WI AN AREA DEFINED AS 3NM RADIUS OF 435904N0883327W (OSH) SFC-3000FT. 2511151400-2511152200";
    assert_eq!(four(tfr).2.as_deref(), Some("Read its area, altitudes and times before flying near it."));
}

#[test]
fn what_it_cannot_say_whole_it_leaves_to_the_words() {
    for text in [
        "!ORD 10/163 ORD RWY 10R/28L CL MARKINGS OBSC 2610311021-2611261200",
        "!ORD 11/445 ORD SVC SMR U/S 2611120500-2611121100",
        "!ORD 10/820 ORD COM REMOTE TRANS/REC 351.675 CHANGED TO 340.200 2610230901-PERM",
        "!ORD 11/080 ORD AD AP WINDCONE FOR RWY 18 LGT U/S 2511120000-2511202359",
        "Runway 18 closed for paint",
    ] {
        let (what, _, why) = four(text);
        assert_eq!((what, why), (None, None), "{text}");
    }
}
