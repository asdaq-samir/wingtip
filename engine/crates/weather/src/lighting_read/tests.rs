//! Real remarks from NASR's APT_RMK.csv (the 2026-10-29 cycle), each
//! system's way of being turned on worked by hand from the Chart
//! Supplement legend and AIM 2-1-8, not from the code.

use super::*;

fn one(text: &str) -> LightingRead {
    read(&[text], &[])
}

fn hows(r: &LightingRead) -> Vec<(Option<&str>, Vec<&str>, Option<String>)> {
    r.systems.iter().map(|s| (s.code, s.runways.iter().map(String::as_str).collect(), how(s))).collect()
}

fn said(s: &str) -> Option<String> {
    Some(s.to_owned())
}

#[test]
fn oshkosh_keyed_when_the_tower_closes_its_hirl_preset_and_its_papi_always_on() {
    let r =
        one("WHEN ATCT CLSD, ACTVT MALSR RWY 36; REIL RWY 18 & 27; HIRL RWY 09/27 & 18/36 - CTAF. HIRL 18/36 PRESET ON LOW INTST SS-SR, \
         TO INCR INTST & ACTVT - CTAF. PAPI RWY 09, 27, 18 & 36 OPR CONSLY.");
    let key = said("Key the mic on CTAF when the tower is closed");
    assert_eq!(
        hows(&r),
        vec![
            (Some("MALSR"), vec!["36"], key.clone()),
            (Some("REIL"), vec!["18", "27"], key.clone()),
            (Some("HIRL"), vec!["09/27", "18/36"], key),
            (Some("HIRL"), vec!["18/36"], said("Preset low, sunset to sunrise; key the mic on CTAF for more")),
            (Some("PAPI"), vec!["09", "27", "18", "36"], said("On all the time")),
        ]
    );
    assert_eq!(r.systems[0].name, "Approach lights");
    assert_eq!(r.systems[2].name, "Runway edge lights, high intensity");
    assert!(r.notes.is_empty() && r.standard_keying);
    assert_eq!(r.systems[4].as_written, "PAPI RWY 09, 27, 18 & 36 OPR CONSLY.");
}

#[test]
fn waukegans_misspelt_actvt_is_activate_and_a_sentence_of_no_system_is_kept_as_written() {
    // NASR's own "ATCTVT" for ACTVT, which was read as "Atctvt".
    let r = one(
        "ATCTVT MALSR RWY 23; REIL RWY 05; HIRL RWY 05/23; MIRL RWY 14/32 TWY LGTS - CTAF. WHEN ATCT CLSD TO INCR INTST & ACTVT - CTAF",
    );
    let key = said("Key the mic on CTAF");
    assert_eq!(
        hows(&r),
        vec![
            (Some("MALSR"), vec!["23"], key.clone()),
            (Some("REIL"), vec!["05"], key.clone()),
            (Some("HIRL"), vec!["05/23"], key.clone()),
            (Some("MIRL"), vec!["14/32"], key.clone()),
            (None, vec![], key),
        ]
    );
    assert_eq!(r.systems[4].name, "Taxiway lights");
    // It names no light, and none before is preset: which lights it turns
    // up is not said, so it is said as written.
    assert_eq!(
        r.notes,
        vec![(
            "When the tower closed to increase intensity & activate - CTAF.".to_owned(),
            "WHEN ATCT CLSD TO INCR INTST & ACTVT - CTAF.".to_owned()
        )]
    );
}

#[test]
fn madisons_hirl_preset_low_when_the_tower_closes() {
    let r =
        one("ACTVT MALSR RWY 18 & 21;  REIL RWY 03, 14 & 32; HIRL RWY 03/21, 14/32 & 18/36 - CTAF.  WHEN ATCT CLSD HIRL RWY 18/36 PRESET \
         LOW INTST; INCR INTST - CTAF.");
    let key = said("Key the mic on CTAF");
    assert_eq!(
        hows(&r),
        vec![
            (Some("MALSR"), vec!["18", "21"], key.clone()),
            (Some("REIL"), vec!["03", "14", "32"], key.clone()),
            (Some("HIRL"), vec!["03/21", "14/32", "18/36"], key),
            (Some("HIRL"), vec!["18/36"], said("When the tower is closed, preset low; key the mic on CTAF for more")),
        ]
    );
    assert!(r.notes.is_empty());
}

#[test]
fn turning_up_a_preset_light_in_the_next_sentence_is_that_lights() {
    // O47: "INCR INTST - CTAF." names no light; the MIRL is the one preset.
    let r = one("MIRL RWY 17/35 ON SS-SR, PRESET LOW INTST. INCR INTST - CTAF.");
    assert_eq!(hows(&r), vec![(Some("MIRL"), vec!["17/35"], said("Preset low, sunset to sunrise; key the mic on CTAF for more"))]);
    assert_eq!(r.systems[0].as_written, "MIRL RWY 17/35 ON SS-SR, PRESET LOW INTST. INCR INTST - CTAF.");
}

#[test]
fn a_count_of_clicks_a_frequency_and_a_schedule_before_the_lights() {
    let r = one("SS-SR ACTVT MIRL RWY 17/35 - 123.3.");
    assert_eq!(hows(&r), vec![(Some("MIRL"), vec!["17/35"], said("Key the mic on 123.3, sunset to sunrise"))]);
    assert!(r.standard_keying);
    let r = one("ACTVT MIRL RWY 18/36; REIL RWY 36; TWY LGTS - 7 CLICKS ON CTAF.");
    assert_eq!(r.systems.len(), 3);
    assert_eq!(how(&r.systems[2]), said("Key the mic 7 times on CTAF"));
    assert!(!r.standard_keying, "the field's own count, not AIM 2-1-8's");
    let r = one("ACTVT MIRL RWY 18/36; REIL RWY 36 - CTAF 5 CLICKS.");
    assert_eq!(r.systems[0].clicks, Some(5));
    assert!(!r.standard_keying, "the field's own count, not AIM 2-1-8's");
}

#[test]
fn a_beacon_remark_with_no_system_is_the_beacons() {
    let r = read(&[], &["DUSK-DAWN."]);
    assert_eq!(hows(&r), vec![(None, vec![], said("On from dusk to dawn"))]);
    assert_eq!(r.systems[0].name, "Rotating beacon");
    let r = read(&[], &["ACTVT ROTG BCN SS-SR - 122.85."]);
    assert_eq!(hows(&r), vec![(None, vec![], said("Key the mic on 122.85, sunset to sunrise"))]);
}

#[test]
fn what_is_not_read_is_a_note_never_a_guess() {
    // A schedule after the lights, of none of them: the whole sentence.
    let r = one("ACTVT REILS RWY 11 & 29; MIRL RWY 11/29 PRESET LOW INTS DUSK-0230; TO INCR INTS & ACTVT AFTER 0230 - CTAF.");
    assert!(r.systems.is_empty());
    assert_eq!(r.notes.len(), 1);
    let r = one("FOR PERIMETER LGTS CALL 901-885-2410.");
    assert_eq!(r.notes[0].0, "For perimeter lights call 901-885-2410.");
    assert!(r.systems.is_empty() && !r.standard_keying);
}

#[test]
fn the_runways_lights_before_their_verb_and_a_nonstandard_beacon() {
    let r = one("RY 15/33 LGTS ACTVT - 121.95.");
    assert_eq!(hows(&r), vec![(None, vec!["15/33"], said("Key the mic on 121.95"))]);
    assert_eq!(r.systems[0].name, "Runway lights");
    let r = one("ACTVT LIRL RY 17/35 & NSTD BCN - 123.6.");
    assert_eq!(r.systems.len(), 2);
    assert!(r.systems[1].nonstandard && r.systems[1].pilot_controlled);
}

#[test]
fn lights_the_tower_works_are_said_so_not_read_letter_by_letter() {
    // KDPA's whole remark (NASR APT_RMK.csv, the 2026-10-29 cycle).
    let r = one("ATC-CTL.");
    assert!(r.systems.is_empty());
    assert_eq!(r.notes[0].0, "Controlled by ATC.");
    assert_eq!(one("RDO-CTL.").notes[0].0, "Radio controlled.");
    assert_eq!(one("ATC CTL.").notes[0].0, "ATC controlled.");
}
