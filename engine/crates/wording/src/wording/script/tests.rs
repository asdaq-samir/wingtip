use super::*;

#[test]
fn spoken_as_the_aim_speaks_it() {
    assert_eq!(spoken_tail("N345SP"), "Three Four Five Sierra Papa");
    assert_eq!(spoken_tail("n19"), "One Niner");
    assert_eq!(call_sign("Cessna", Some("N345SP")), "Cessna Three Four Five Sierra Papa");
    assert_eq!(call_sign("Piper", None), "Piper [your registration]");
    assert_eq!(spoken_altitude(3500.0), "three thousand five hundred");
    assert_eq!(spoken_altitude(10500.0), "one zero thousand five hundred");
    assert_eq!(spoken_altitude(2000.0), "two thousand");
    assert_eq!(spoken_altitude(800.0), "eight hundred");
    assert_eq!(spoken_runway("27"), "two seven");
    assert_eq!(spoken_runway("09L"), "niner left");
    assert_eq!(spoken_runway("06"), "six");
    assert_eq!(place_name(Some("Waukegan National Airport"), "KUGN"), "Waukegan");
    assert_eq!(place_name(Some("Lake In The Hills Airport"), "3CK"), "Lake In The Hills");
    assert_eq!(place_name(None, "C81"), "C81");
    assert_eq!(mhz_text(122.9), "122.9");
    assert_eq!(mhz_text(122.95), "122.95");
    assert_eq!(mhz_text(124.475), "124.475");
    assert_eq!(mhz_text(120.05), "120.05");
}

#[test]
fn a_facility_is_called_by_its_own_name() {
    let f = |d: &str| Frequency { kind: None, description: Some(d.into()), mhz: Some(120.0) };
    assert_eq!(facility_name(&f("CHICAGO APP/DEP"), "Waukegan"), "Chicago");
    assert_eq!(facility_name(&f("TWR"), "Waukegan"), "Waukegan");
    assert_eq!(facility_name(&f("ROCKFORD TWR"), "X"), "Rockford");
}
