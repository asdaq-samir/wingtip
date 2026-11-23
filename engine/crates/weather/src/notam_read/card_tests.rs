//! notam_card's cases, FAA Order JO 7930.2's forms (card.rs).
use super::*;

const FDC_6_3373: &str = "!FDC 6/3373 ARR SID AURORA MUNI, CHICAGO/AURORA, IL. ADELL EIGHT DEPARTURE (RNAV)... BLOKR EIGHT DEPARTURE (RNAV)... CARYN EIGHT DEPARTURE (RNAV)... DARCY EIGHT DEPARTURE (RNAV)... ELANR NINE DEPARTURE (RNAV)... OBENE THREE DEPARTURE (RNAV)... RWY 18/36 PROCEDURES NA. RWY 18/36 PERMANENTLY CLSD. 2605271843-2805271843EST";

#[test]
fn a_runway_closed_for_good_takes_its_departures_away() {
    let c = card(FDC_6_3373, &[]);
    assert_eq!(c.account.as_deref(), Some("FDC"));
    assert_eq!(c.category.as_deref(), Some("Departure procedures"));
    assert_eq!(c.title.as_deref(), Some("Runway 18/36 closed"));
    assert_eq!(c.effect.as_deref(), Some("Runway 18/36 is permanently closed, so its RNAV departures are not authorized."));
    assert!(c.permanent);
    let names: Vec<&str> = c.procedures.iter().map(|p| p.name.as_str()).collect();
    assert_eq!(names, ["ADELL 8", "BLOKR 8", "CARYN 8", "DARCY 8", "ELANR 9", "OBENE 3"]);
    assert!(c.procedures.iter().all(|p| p.rnav));
}

#[test]
fn each_kind_says_its_effect_or_none() {
    // A runway (JO 7930.2 5-1-3 c), for now: not permanent.
    let c = card("!OSH 11/041 OSH RWY 18/36 CLSD 2511120900-2511121700", &[]);
    assert_eq!((c.title.as_deref(), c.effect.as_deref()), (Some("Runway 18/36 closed"), Some("Runway 18/36 is closed.")));
    assert_eq!((c.category.as_deref(), c.permanent, c.procedures.len()), (Some("Runway"), false, 0));
    // A navaid's part (NAV; AIM 1-1-9).
    let c = card("!OSH 11/081 OSH NAV ILS RWY 36 GP U/S 2511120000-2511202359", &[]);
    assert_eq!(c.effect.as_deref(), Some("Glide slope runway 36 is out of service."));
    // One arrival not authorized (STAR, 7-1-3).
    let c = card("!FDC 6/1 ORD STAR CHICAGO O'HARE INTL, CHICAGO, IL. BENKY SIX ARRIVAL NA. 2611010000-2612010000", &[]);
    assert_eq!(c.category.as_deref(), Some("Arrival procedures"));
    assert_eq!(c.title.as_deref(), Some("BENKY 6 arrival not authorized"));
    assert_eq!(c.effect.as_deref(), Some("The BENKY 6 arrival is not authorized."));
    // Permanent by its end (PERM, 4-2-1).
    let c = card("!OSH 11/090 OSH TWY B CLSD 2511120900-PERM", &[]);
    assert_eq!((c.effect.as_deref(), c.permanent), (Some("Taxiway B is permanently closed."), true));
    // Airspace it cannot structure: none, the words stand in.
    let c = card("!OSH 11/100 OSH AIRSPACE UAS WI AN AREA DEFINED AS 2NM RADIUS OF OSH SFC-400FT 2511120900-2511121700", &[]);
    assert_eq!((c.title, c.effect, c.category.as_deref()), (None, None, Some("Airspace")));
}

/// Title and effect of `text`.
fn said(text: &str) -> (Option<String>, Option<String>) {
    let c = card(text, &[]);
    (c.title, c.effect)
}

fn some(a: &str, b: &str) -> (Option<String>, Option<String>) {
    (Some(a.to_owned()), Some(b.to_owned()))
}

#[test]
fn a_closure_names_the_notams_own_subject_never_a_between_point() {
    // JO 7930.2 3-3-6: the closed taxiway first, its between-points after.
    assert_eq!(
        said("!ORD 11/070 ORD TWY A BTN TWY B AND TWY C CLSD 2611120000-2611202359"),
        some("Taxiway A closed between taxiway B and taxiway C", "Taxiway A is closed between taxiway B and taxiway C.")
    );
    assert_eq!(
        said("!OSH 11/072 OSH TWY A BTN TWY B AND RWY 01/19 CLSD 2511120000-2511202359"),
        some("Taxiway A closed between taxiway B and runway 01/19", "Taxiway A is closed between taxiway B and runway 01/19.")
    );
    // Closed to some airplanes only: no card of ours, the words stand.
    assert_eq!(
        said("!ORD 10/175 ORD TWY A2 BTN TWY A AND TWY B CLSD TO ACFT WINGSPAN MORE THAN 118FT 2610311030-2611261200"),
        (None, None)
    );
    assert_eq!(said("!OSH 11/043 OSH RWY 04/22 CLSD TO ACFT MORE THAN 12500LBS 2511120900-2511121700"), (None, None));
}

#[test]
fn what_follows_clsd_is_kept() {
    // CLSD EXC TAX (JO 7930.2 TBL 3-3-1): open to taxi on.
    assert_eq!(
        said("!OSH 11/042 OSH RWY 18/36 CLSD EXC TAX 2511120900-2511121700"),
        some("Runway 18/36 closed except taxiing", "Runway 18/36 is closed except taxiing.")
    );
}

#[test]
fn na_takes_away_only_what_it_names() {
    // A transition NA, or NA at night: a part, said by the words alone.
    for text in [
        "!FDC 6/2 ORD STAR CHICAGO O'HARE INTL, CHICAGO, IL. BENKY SIX ARRIVAL... CARYN TRANSITION NA. 2611010000-2612010000",
        "!FDC 6/3 ARR SID AURORA MUNI, CHICAGO/AURORA, IL. BLOKR EIGHT DEPARTURE (RNAV)... PROCEDURE NA AT NIGHT. 2611010000-2612010000",
        "!FDC 6/4 ORD IAP CHICAGO O'HARE INTL, CHICAGO, IL. ILS RWY 10R, AMDT 2... PROCEDURE NA WHEN RWY 9/27 CLSD. 2611010000-2612010000",
    ] {
        let c = card(text, &[]);
        assert_eq!((c.title, c.effect, c.procedures.len()), (None, None, 0), "{text}");
    }
    // From one runway, with no closure: said with the runway.
    let c = card("!FDC 6/5 ARR SID AURORA MUNI, CHICAGO/AURORA, IL. ADELL EIGHT DEPARTURE (RNAV)... BLOKR EIGHT DEPARTURE (RNAV)... RWY 18/36 PROCEDURES NA. 2611010000-2612010000", &[]);
    assert_eq!(c.effect.as_deref(), Some("These 2 RNAV departures are not authorized from runway 18/36."));
    assert_eq!(c.procedures.len(), 2);
    // One named NA, another named and not: only the one.
    let c = card("!FDC 6/6 ARR SID AURORA MUNI, CHICAGO/AURORA, IL. ADELL EIGHT DEPARTURE (RNAV) NA. BLOKR EIGHT DEPARTURE (RNAV) AMENDED. 2611010000-2612010000", &[]);
    assert_eq!(c.effect.as_deref(), Some("The ADELL 8 departure (RNAV) is not authorized."));
    assert_eq!(c.procedures.len(), 1);
}

#[test]
fn a_decimal_point_ends_no_sentence() {
    let s = sentences("!FDC 6/7 ARR SID AURORA MUNI. TAKEOFF MINIMUMS RWY 18 2.5 SM... RWY 18/36 CLSD. 2611010000-2612010000");
    assert!(s.iter().any(|w| w.contains(&"2.5")));
    assert!(s.iter().any(|w| w[..] == ["RWY", "18/36", "CLSD"]));
}

#[test]
fn a_what_is_said_at_its_first_condition_in_the_words() {
    assert_eq!(
        sentence_of("Taxiway A unusable between taxiway B and the ramp closed", false).as_deref(),
        Some("Taxiway A is unusable between taxiway B and the ramp closed.")
    );
}

#[test]
fn a_permanent_condition_with_an_estimated_end_or_none_runs_until_the_charts() {
    // FDC 6/3373: PERMANENTLY CLSD, its end EST (JO 7930.2 4-2-1).
    assert!(card(FDC_6_3373, &[]).until_charts);
    // PERM as its end: no end at all.
    assert!(card("!OSH 11/090 OSH TWY B CLSD 2511120900-PERM", &[]).until_charts);
    // Not permanent, EST or not: its end is its end.
    assert!(!card("!OSH 11/041 OSH RWY 18/36 CLSD 2511120900-2511121700EST", &[]).until_charts);
    // Permanent in its words with a firm end: said as its time.
    let firm = "!FDC 6/8 ARR SID AURORA MUNI, CHICAGO/AURORA, IL. RWY 18/36 PERMANENTLY CLSD. 2605271843-2805271843";
    assert!(!card(firm, &[]).until_charts);
    // A permanent text with no end of its own, where the feed gives a firm one.
    let bare = "!FDC 6/9 ARR SID AURORA MUNI, CHICAGO/AURORA, IL. RWY 18/36 PERMANENTLY CLSD.";
    assert!(card(bare, &[]).until_charts);
    assert!(!card_with_end(bare, &[], true).until_charts);
    let answer =
        call("notam_card", &crate::json::parse(&format!(r#"{{"text":"{bare}","ends":"2028-05-27T18:43:00Z"}}"#)).unwrap()).unwrap();
    assert!(answer.contains("\"until_charts\":false"));
}

#[test]
fn each_procedure_says_whether_it_is_a_departure() {
    // The card's "Affects your ..." chip matches it to the field's role.
    let json = |text: &str| call("notam_card", &crate::json::parse(&format!("{{\"text\":{text:?}}}")).unwrap()).unwrap();
    assert!(json(FDC_6_3373).contains("{\"name\":\"ADELL 8\",\"rnav\":true,\"departure\":true}"));
    let star = json("!FDC 6/1 ORD STAR CHICAGO O'HARE INTL, CHICAGO, IL. BENKY SIX ARRIVAL NA. 2611010000-2612010000");
    assert!(star.contains("{\"name\":\"BENKY 6\",\"rnav\":false,\"departure\":false}"), "{star}");
}
