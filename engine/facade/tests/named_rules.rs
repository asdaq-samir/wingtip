//! The flight, airspace, altitude, route and Go / No-Go rules no test had
//! asked by name (the coverage audit of 2026-11-21), each asked as the
//! hosts ask it, JSON in and out, so a host reading the answer wrongly
//! fails here rather than on a map or a Brief: a route point's kind, a
//! field's name as NASR's ARPT_NAME title-cased with the FAA's codes kept,
//! a leg's floor along a procedure's path (14 CFR 91.119, 91.177(a)(2)),
//! icing not checked for want of a freezing level (FAA-H-8083-28B ch. 20),
//! and NASR APT_BASE's and APT_RWY's codes read into a field's map rank,
//! its military use, its kind of site and a runway's hard surface (the
//! FAA Aeronautical Chart User's Guide's "hard-surfaced runways"). Each
//! boundary is asked from both sides.

mod common;

use common::assert_same;
use serde_json::{json, Value};
use wingtip_engine::call::call;

fn ask(name: &str, input: &Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"))
}

#[test]
fn a_route_point_is_a_fix_the_pilots_own_point_or_neither() {
    // A fix's ident is two to five capitals and figures; the pilot's own
    // point is a fix, a three-figure course and a distance, written
    // "VPBNG/090/30" or packed as a flight plan does, "DLH090030" (AIM
    // Appendix 4's fix/radial/distance). Read as typed: lower case is not
    // taken for a fix.
    for (text, want) in [
        ("KDLH", json!("fix")),
        ("VPBNG", json!("fix")),
        ("K", Value::Null),
        ("ABCDEF", Value::Null),
        ("VPBNG/090/30", json!("own")),
        ("VPBNG/090/4.5", json!("own")),
        ("DLH090030", json!("own")),
        ("VPBNG/90/30", Value::Null),
        ("kdlh", Value::Null),
    ] {
        assert_eq!(ask("point_kind", &json!({ "text": text })), want, "{text}");
    }
    assert!(call("point_kind", "{}").is_err());
}

#[test]
fn a_fields_name_is_title_cased_with_the_faas_codes_kept() {
    // NASR APT_BASE's ARPT_NAME, in capitals as filed.
    let names = json!(["SIERRA VISTA MUNI-LIBBY AAF", "FORT WORTH NAS JRB (CARSWELL FLD)", "CHICAGO O'HARE INTL", "NASHVILLE INTL"]);
    assert_eq!(
        ask("airport_names", &json!({ "names": names })),
        json!(["Sierra Vista Muni-Libby AAF", "Fort Worth NAS JRB (Carswell Fld)", "Chicago O'Hare Intl", "Nashville Intl"])
    );
    assert_eq!(ask("airport_names", &json!({"names": []})), json!([]));
    assert!(call("airport_names", r#"{"names":[1]}"#).is_err());
}

#[test]
fn a_legs_floor_along_a_procedures_path_is_the_highest_with_the_lowest_ground() {
    // The airplane is over all of the path at its altitude, so the highest
    // floor under any piece of it holds (91.119 VFR, 91.177(a)(2) IFR).
    let floor = |floors: Value| ask("floor_along_path", &json!({ "floors": floors }));
    assert_same(
        &floor(json!([
            {"floor_ft": 3000, "lowest_ground_ft": 1200},
            {"floor_ft": 3500, "lowest_ground_ft": 900},
            {"floor_ft": 2500, "lowest_ground_ft": 600}
        ])),
        &json!({"floor_ft": 3500, "lowest_ground_ft": 600}),
        "the highest, with the lowest ground of all",
    );
    // A tie keeps the leg's own.
    assert_same(
        &floor(json!([{"floor_ft": 3000, "lowest_ground_ft": 1200}, {"floor_ft": 3000, "lowest_ground_ft": 800}])),
        &json!({"floor_ft": 3000, "lowest_ground_ft": 800}),
        "a tie",
    );
    // IFR's floors have no ground; a ground not known is not the lowest.
    assert_same(&floor(json!([{"floor_ft": 4000}, {"floor_ft": 5000}])), &json!({"floor_ft": 5000}), "IFR");
    assert_same(
        &floor(json!([{"floor_ft": 3000, "lowest_ground_ft": null}, {"floor_ft": 2000, "lowest_ground_ft": 700}])),
        &json!({"floor_ft": 3000, "lowest_ground_ft": 700}),
        "a ground not known",
    );
    assert!(call("floor_along_path", r#"{"floors":[]}"#).is_err());
}

#[test]
fn icing_possible_with_no_freezing_level_is_said_not_checked() {
    // FAA-H-8083-28B ch. 20: structural icing needs visible moisture at or
    // below 0 °C; with no freezing level no altitude can be held to it.
    let line = json!("Icing not checked: freezing level not known");
    let unchecked = |selection: Value, flown: Value| ask("gonogo_icing_unchecked", &json!({"selection": selection, "flown_ft": flown}));
    assert_eq!(unchecked(json!({"freezing_level_ft": null, "icing_possible": true}), json!([8000])), line);
    // Read as JavaScript reads it: 1 is true, "" and 0 are not.
    assert_eq!(unchecked(json!({"icing_possible": 1}), json!([8000])), line);
    assert_eq!(unchecked(json!({"icing_possible": ""}), json!([8000])), Value::Null);
    assert_eq!(unchecked(json!({"icing_possible": 0}), json!([8000])), Value::Null);
    // A freezing level known is checked elsewhere (gonogo_icing).
    assert_eq!(unchecked(json!({"freezing_level_ft": 6000, "icing_possible": true}), json!([8000])), Value::Null);
    // Nothing flown, or no selection: nothing to say.
    assert_eq!(unchecked(json!({"icing_possible": true}), json!([])), Value::Null);
    assert_eq!(unchecked(json!({"icing_possible": true}), Value::Null), Value::Null);
    assert_eq!(unchecked(Value::Null, json!([8000])), Value::Null);
}

#[test]
fn a_fields_map_mark_is_ranked_by_its_tower_its_airspace_and_its_hard_runway() {
    let rank = |input: Value| ask("field_mark_rank", &input);
    // O'Hare: towered, the primary of a Class B, 13,000 ft of hard runway.
    assert_eq!(
        rank(json!({"site_type": "A", "use": "PU", "towered": true, "hard_ft": 13000, "primary_of": "B"})),
        json!({"tier": 0, "order": 86_999, "size": "largest"})
    );
    // A Class C's field, then a towered field under no B or C (D counts as none).
    assert_eq!(
        rank(json!({"site_type": "A", "use": "PU", "towered": true, "hard_ft": 8000, "primary_of": "C"})),
        json!({"tier": 0, "order": 191_999, "size": "larger"})
    );
    assert_eq!(
        rank(json!({"site_type": "A", "use": "PU", "towered": true, "hard_ft": 5000, "primary_of": "D"})),
        json!({"tier": 0, "order": 294_999, "size": "regular"})
    );
    // A public field's hard runway at 3,000 ft and at 2,999 ft.
    assert_eq!(rank(json!({"site_type": "A", "use": "PU", "hard_ft": 3000})), json!({"tier": 1, "order": 396_999, "size": "regular"}));
    assert_eq!(rank(json!({"site_type": "A", "use": "PU", "hard_ft": 2999})), json!({"tier": 2, "order": 497_000, "size": "small"}));
    // A private field, and a heliport, which is no landing site for an
    // airplane, whatever airspace names it.
    assert_eq!(rank(json!({"site_type": "A", "use": "PR", "hard_ft": 4000})), json!({"tier": 3, "order": 595_999, "size": "small"}));
    assert_eq!(rank(json!({"site_type": "H", "use": "PU", "primary_of": "B"})), json!({"tier": 4, "order": 699_999, "size": "small"}));
    assert!(call("field_mark_rank", r#"{"hard_ft":-1}"#).is_err());
}

#[test]
fn a_field_the_services_own_is_military_or_joint() {
    // NASR APT_BASE OWNERSHIP_TYPE_CODE MA, MN, MR, CG; joint where
    // FACILITY_USE_CODE is PU.
    for (ownership, facility_use, want) in [
        (json!("MA"), json!("PU"), json!("joint")),
        (json!("MA"), json!("PR"), json!("military")),
        (json!("MN"), Value::Null, json!("military")),
        (json!("MR"), json!("PR"), json!("military")),
        (json!(" cg "), json!("pu"), json!("joint")),
        (json!("PU"), json!("PU"), Value::Null),
        (json!("PR"), json!("PR"), Value::Null),
        (Value::Null, Value::Null, Value::Null),
    ] {
        assert_eq!(
            ask("field_military", &json!({"ownership": ownership.clone(), "use": facility_use.clone()})),
            json!({ "military": want }),
            "{ownership} {facility_use}"
        );
    }
    assert!(call("field_military", r#"{"ownership":1}"#).is_err());
}

#[test]
fn a_fields_kind_of_site_in_words_none_for_an_airport() {
    // NASR APT_BASE SITE_TYPE_CODE.
    for (code, want) in [
        (json!("A"), Value::Null),
        (json!("B"), json!("Balloonport")),
        (json!("C"), json!("Seaplane base")),
        (json!("G"), json!("Gliderport")),
        (json!(" h "), json!("Heliport")),
        (json!("U"), json!("Ultralight")),
        (json!("X"), Value::Null),
        (Value::Null, Value::Null),
    ] {
        assert_eq!(ask("field_site_type", &json!({"site_type": code.clone()})), json!({ "words": want }), "{code}");
    }
}

#[test]
fn a_runway_is_hard_only_where_every_part_of_its_surface_is() {
    // NASR APT_RWY SURFACE_TYPE_CODE; TRTD (treated) goes with a hard one.
    for (surface, hard) in [
        (json!("ASPH"), true),
        (json!("CONC"), true),
        (json!("PEM"), true),
        (json!("PFC"), true),
        (json!("BRICK"), true),
        (json!("ASPH-CONC"), true),
        (json!("ASPH/CONC"), true),
        (json!("ASPH-TRTD"), true),
        (json!("ASPH-TURF"), false),
        (json!("TURF"), false),
        (json!("GRVL"), false),
        (json!("TRTD"), false),
        (json!(""), false),
        (Value::Null, false),
    ] {
        assert_eq!(ask("runway_hard_surface", &json!({"surface": surface.clone()})), json!({ "hard": hard }), "{surface}");
    }
}
