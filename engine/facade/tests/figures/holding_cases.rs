use super::*;

// --- Holding (AIM 5-3-8) ----------------------------------------------------

pub(super) fn entry(inbound: f64, heading: f64, right: bool) -> Entry {
    holding::holding_entry(inbound, heading, right).0
}

#[test]
fn a_standard_hold_on_360() {
    assert_eq!(entry(360.0, 360.0, true), Entry::Direct);
    assert_eq!(entry(360.0, 90.0, true), Entry::Direct);
    assert_eq!(entry(360.0, 300.0, true), Entry::Direct);
    // From the north-west, heading south-east: the non-holding side, beyond the fix.
    assert_eq!(entry(360.0, 150.0, true), Entry::Teardrop);
    // From the north-east, heading south-west, and from the east heading west: the holding side.
    assert_eq!(entry(360.0, 220.0, true), Entry::Parallel);
    assert_eq!(entry(360.0, 270.0, true), Entry::Parallel);
}

#[test]
fn left_turns_are_the_mirror() {
    assert_eq!(entry(360.0, 210.0, false), Entry::Teardrop);
    assert_eq!(entry(360.0, 140.0, false), Entry::Parallel);
    assert_eq!(entry(360.0, 270.0, false), Entry::Direct);
    assert_eq!(entry(90.0, 160.0, false), Entry::Direct);
}

#[test]
fn within_5_degrees_of_a_sectors_edge_either_entry() {
    assert_eq!(holding::holding_entry(360.0, 112.0, true), (Entry::Teardrop, Some(Entry::Direct)));
    assert_eq!(holding::holding_entry(360.0, 288.0, true), (Entry::Parallel, Some(Entry::Direct)));
    assert_eq!(holding::holding_entry(360.0, 45.0, true).1, None);
}

#[test]
fn a_headwind_inbound_the_outbound_leg_shorter() {
    let w = holding::holding_wind(360.0, 100.0, 360.0, 20.0, 5000.0).unwrap();
    assert_eq!(w.leg_min, 1.0);
    assert!(near(w.inbound.gs, 80.0, 1e-9));
    assert!(near(w.outbound.gs, 120.0, 1e-9));
    // 80 kt for a minute is 1.33 nm, flown outbound at 120 kt: 40 s.
    assert!(near(w.outbound_sec, 40.0, 1e-9));
    assert!(near(w.rule_sec, 40.0, 1e-9));
}

#[test]
fn a_crosswind_outbound_three_times_the_inbound_correction_a_minute_and_a_half_up_high() {
    let w = holding::holding_wind(360.0, 100.0, 90.0, 15.0, 16000.0).unwrap();
    assert_eq!(w.leg_min, 1.5);
    assert!(near(w.inbound.wca, 8.63, 0.05));
    assert!(near(w.outbound.wca, -3.0 * w.inbound.wca, 1e-9));
    assert!(near(w.outbound.heading, 180.0 - 3.0 * w.inbound.wca, 1e-9));
    assert!(holding::holding_wind(360.0, 50.0, 90.0, 60.0, 5000.0).is_none());
}

#[test]
fn the_inbound_legs_time() {
    // A minute at or below 14,000 ft MSL, a minute and a half above (AIM 5-3-8 j.4(a)).
    assert_eq!(holding::leg_minutes(Some(3000.0)), 1.0);
    assert_eq!(holding::leg_minutes(Some(14_000.0)), 1.0);
    assert_eq!(holding::leg_minutes(Some(14_001.0)), 1.5);
    assert_eq!(holding::leg_minutes(Some(17_000.0)), 1.5);
    assert_eq!(holding::leg_minutes(None), 1.0);
}

#[test]
fn the_entries_in_words() {
    assert_eq!(
        holding::entry_steps(Entry::Direct, 360.0, true, 5000.0),
        "Fly to the fix and turn right to follow the pattern: outbound on 180°."
    );
    assert!(holding::entry_steps(Entry::Teardrop, 360.0, true, 5000.0)
        .starts_with("Fly to the fix, then turn to 150°, 30° into the holding side, for one minute"));
    assert!(holding::entry_steps(Entry::Parallel, 90.0, false, 16000.0).contains("for a minute and a half; then turn right"));
}

#[test]
fn the_holding_answer() {
    let d: Value =
        serde_json::from_str(&holding::holding_json(360.0, 220.0, true, Some(100.0), Some(360.0), Some(20.0), Some(5000.0))).unwrap();
    assert_eq!(d["entry"], "parallel");
    assert_eq!(d["entry_name"], "Parallel");
    assert!(d["either"].is_null());
    assert!(d["steps"]
        .as_str()
        .unwrap()
        .starts_with("At the fix, turn to 180°, parallel to the holding course on the non-holding side, for one minute"));
    assert_eq!(d["approach_relative"], 40.0);
    assert!(near(d["wind"]["outbound_sec"].as_f64().unwrap(), 40.0, 1e-9));
    assert_eq!(d["wind"]["time_words"], "So the inbound leg takes a minute at 80 kt; by the rule of a second a knot, 40 s");
    let near_edge: Value = serde_json::from_str(&holding::holding_json(360.0, 112.0, true, None, None, None, None)).unwrap();
    assert_eq!(near_edge["entry"], "teardrop");
    assert_eq!(near_edge["either_name"], "Direct");
    assert!(near_edge["wind"].is_null() && near_edge["wind_problem"].is_null());
    let strong: Value =
        serde_json::from_str(&holding::holding_json(360.0, 0.0, true, Some(50.0), Some(90.0), Some(60.0), Some(5000.0))).unwrap();
    assert!(strong["wind"].is_null());
    assert_eq!(strong["wind_problem"], "A wind stronger than the airplane holds no heading.");
}

// --- Lost communications (14 CFR 91.185) -------------------------------------

pub(super) fn segs(list: &[(&str, Option<f64>)]) -> Vec<(String, Option<f64>)> {
    list.iter().map(|(n, m)| (n.to_string(), *m)).collect()
}

#[test]
fn each_segment_at_the_highest_of_assigned_minimum_and_expected() {
    let flown = lost_comms::segment_altitudes(
        &segs(&[("to SWEDE", Some(2600.0)), ("SWEDE to RAYMO", Some(5000.0)), ("RAYMO to the approach", Some(3400.0))]),
        Some(4000.0),
        Some(6000.0),
        1,
    );
    let got: Vec<_> = flown.iter().map(|f| (f.name.as_str(), f.fly)).collect();
    assert_eq!(
        got,
        vec![
            ("to SWEDE", Some((4000.0, Because::Assigned))),
            ("SWEDE to RAYMO", Some((6000.0, Because::Expected))),
            ("RAYMO to the approach", Some((6000.0, Because::Expected))),
        ]
    );
    // An MEA above both: the MEA.
    assert_eq!(
        lost_comms::segment_altitudes(&segs(&[("x", Some(7000.0))]), Some(4000.0), Some(6000.0), 0)[0].fly,
        Some((7000.0, Because::Minimum))
    );
    assert_eq!(lost_comms::segment_altitudes(&segs(&[("x", None)]), None, None, 0)[0].fly, None);
    // A tie goes to the first named, as the rule lists them.
    assert_eq!(
        lost_comms::segment_altitudes(&segs(&[("x", Some(4000.0))]), Some(4000.0), Some(4000.0), 0)[0].fly,
        Some((4000.0, Because::Assigned))
    );
    assert_eq!(lost_comms::fly_words(flown[1].fly), "Fly 6,000 ft: expected");
    assert_eq!(lost_comms::fly_words(Some((7000.0, Because::Minimum))), "Fly 7,000 ft: the minimum");
    assert_eq!(lost_comms::fly_words(None), "No altitude known");
}

#[test]
fn leaving_the_clearance_limit_at_the_efc_else_the_eta() {
    assert!(lost_comms::leave_limit(true, "1420Z", "1435Z").contains("expect-further-clearance time, 1420Z"));
    assert!(lost_comms::leave_limit(true, "", "1435Z").contains("estimated time of arrival, 1435Z"));
    assert!(lost_comms::leave_limit(false, "", "1435Z")
        .starts_with("Leave the clearance limit on arriving over it, proceed to a fix an approach begins from"));
    assert!(lost_comms::leave_limit(false, "1420Z", "").contains("Leave the clearance limit at the expect-further-clearance time, 1420Z"));
}

/// The shared fixture the web's and the iPhone's lost-comms pages are held
/// to (apps/web/src/lib/fixtures/lostComms.json), held here too, through
/// `call` as every host asks: 91.185(c)(1)'s routes in order, and (c)(3)'s
/// leaving the clearance limit at the EFC, else the ETA. No engine test
/// read it before, so a change of the rule's words reached only the apps.
#[test]
fn the_shared_lost_comms_fixture() {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/lostComms.json");
    let fixture: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let ask =
        |input: Value| -> Value { serde_json::from_str(&wingtip_engine::call::call("lost_comms", &input.to_string()).unwrap()).unwrap() };
    assert_eq!(ask(serde_json::json!({ "segments": [] }))["routes"], fixture["routes"]);
    let cases = fixture["leaveLimit"].as_array().unwrap();
    assert!(!cases.is_empty());
    for case in cases {
        let input = serde_json::json!({ "segments": [], "approach_fix": case["approachFix"], "efc": case["efc"], "eta": case["eta"] });
        assert_eq!(ask(input)["leave"], case["words"], "{case}");
    }
}

#[test]
fn the_lost_comms_answer() {
    let d: Value = serde_json::from_str(&lost_comms::lost_comms_json(
        &segs(&[("Departure to SWEDE", Some(2600.0)), ("SWEDE to RAYMO", Some(5000.0)), ("", None)]),
        Some(4000.0),
        Some(6000.0),
        1,
        false,
        "",
        " 1435Z ",
    ))
    .unwrap();
    let said: Vec<&str> = d["segments"].as_array().unwrap().iter().map(|s| s["words"].as_str().unwrap()).collect();
    assert_eq!(said, ["Fly 4,000 ft: assigned", "Fly 6,000 ft: expected", "Fly 6,000 ft: expected"]);
    assert_eq!(d["segments"][2]["name"], "Segment");
    assert!(d["leave"].as_str().unwrap().ends_with("estimated time of arrival, 1435Z."));
    let keys: Vec<&str> = d["routes"].as_array().unwrap().iter().map(|r| r["key"].as_str().unwrap()).collect();
    assert_eq!(keys, ["assigned", "vectored", "expected", "filed"]);
    assert!(d["vfr"].as_str().unwrap().starts_with("In VFR conditions"));
    assert_eq!(Because::from_key("minimum"), Some(Because::Minimum));
}
