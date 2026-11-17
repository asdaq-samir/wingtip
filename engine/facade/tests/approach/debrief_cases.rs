use super::*;

// --- the figures it is held to

#[test]
fn the_glidepath_at_the_faf_is_the_charts_glide_slope_altitude() {
    // ARINC 424-18 5.29 code "I" at BUDDE: 3,000 ft, the glide slope at
    // 2,753 ft; 3.00° up from RW08's 787 ft (its 727 ft threshold and 60
    // ft crossing height), over the curve of the earth.
    let ils = drawing("I08-Y");
    let budde = ils["fixes"].as_array().unwrap().iter().find(|f| f["ident"] == "BUDDE").unwrap();
    let out = nm((budde["lat"].as_f64().unwrap(), budde["lon"].as_f64().unwrap()), RW08);
    assert!((glidepath_ft(out) - 2753.0).abs() < 15.0);
}

#[test]
fn guidance_is_read_from_the_coded_identifier() {
    for (id, want) in [
        ("I08-Y", "localizer"),
        ("L08-Z", "localizer"),
        ("R08-Z", "gps"),
        ("RNV-A", "gps"),
        ("S08", "other"),
        ("VDM-A", "other"),
        ("GPS-B", "gps"),
        ("L08L-Y", "localizer"),
        ("P26L", "gps"),
        ("RNV-", "other"),
        ("", "other"),
    ] {
        assert_eq!(ask("approach_guidance", json!({"id": id})), json!(want), "{id}");
    }
}

#[test]
fn the_localizers_full_scale_is_350_ft_at_the_threshold_opening_at_2_5_deg() {
    // AIM 1-1-9: 700 ft full fly-left to full fly-right at the threshold.
    // At 5 nm out: 350 + 30,381 × tan 2.5° = 1,676 ft, 0.28 nm.
    use wingtip_engine::approach::debrief::{LOCALIZER_DEG, LOCALIZER_THRESHOLD_FT};
    let half = (LOCALIZER_THRESHOLD_FT + 5.0 * FT_PER_NM * (LOCALIZER_DEG * std::f64::consts::PI / 180.0).tan()) / FT_PER_NM;
    assert!((half - 0.276).abs() < 0.005);
}

// --- an ILS flown as charted

#[test]
fn an_ils_flown_as_charted_scores_clean() {
    let d = debrief(&drawing("I08-Y"), &ils_track(120, 12.0), None);
    assert!(!d.is_null());
    assert!(d["fit_nm"].as_f64().unwrap() < 0.01);
    assert_eq!(findings_toned(&d, &["stop", "caution"]), Vec::<Value>::new());
    assert!(texts(&d).iter().any(|t| t.starts_with("Within full scale all the way")));
    let idents: Vec<&str> = d["crossings"].as_array().unwrap().iter().map(|c| c["ident"].as_str().unwrap()).collect();
    assert_eq!(idents, ["SILEX", "BUDDE", "RW08"]);
    assert!(!d["plan"]["track"].as_array().unwrap().iter().any(|p| p["off"] == true));
}

#[test]
fn the_missed_approachs_start_is_timed_from_the_map() {
    let d = debrief(&drawing("I08-Y"), &ils_track(120, 12.0), None);
    assert_eq!(d["outcome"]["kind"], "missed");
    let s = d["outcome"]["seconds_after_map"].as_f64().unwrap();
    assert!((10.0..=14.0).contains(&s), "{s}");
    assert!(texts(&d).iter().any(|t| {
        t.strip_prefix("Missed approach started 1")
            .and_then(|r| r.strip_suffix(" s after the MAP"))
            .is_some_and(|n| n.len() == 1 && ('0'..='4').contains(&n.chars().next().unwrap()))
    }));
}

#[test]
fn a_landing_is_said_as_one() {
    let d = debrief(&drawing("I08-Y"), &ils_landing(), None);
    assert_eq!(d["outcome"]["kind"], "landed");
    assert!(texts(&d).iter().any(|t| t.starts_with("Landed")));
}

#[test]
fn it_is_found_among_the_fields_approaches_the_rnav_named_with_it() {
    let found = find(&[drawing("R08-Z"), drawing("I08-Y")], &ils_track(120, 12.0), None);
    assert_eq!(found.len(), 1);
    assert_eq!(found[0]["id"], "I08-Y");
    assert!(found[0]["also_fits"].as_array().unwrap().contains(&json!("RNAV (GPS) Z RWY 08")));
}

#[test]
fn the_one_the_pilot_picked_wins_where_two_fit_alike() {
    // Both laterally on the same final and neither's glidepath followed:
    // no altitudes.
    let flat = fly(&final_of(&drawing("I08-Y")), Fly { after: 60, ..Default::default() });
    assert_eq!(find(&[drawing("I08-Y"), drawing("R08-Z")], &flat, Some("R08-Z"))[0]["id"], "R08-Z");
}

// --- what it flags

#[test]
fn a_track_a_mile_off_the_final_is_flagged_full_scale_on_final() {
    // A mile left from 4.5 to 2.5 nm out, back on by the runway.
    let off = |t: f64| {
        if t < 4.5 && t > 2.5 {
            -1.0
        } else if t <= 2.5 && t > 2.0 {
            -(t - 2.0) * 2.0
        } else {
            0.0
        }
    };
    let track = fly(
        &final_of(&drawing("I08-Y")),
        Fly { alt: Some(on_ils()), off: Some(Box::new(off)), after: 60, after_alt: Some(missed_after(5.0)), ..Default::default() },
    );
    let d = debrief(&drawing("I08-Y"), &track, None);
    let lateral = d["findings"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["text"].as_str().unwrap().starts_with("Full scale left of the course"))
        .unwrap();
    assert_eq!(lateral["tone"], "stop");
    let text = lateral["text"].as_str().unwrap();
    assert!(text.ends_with("on final, 1.0 nm off at most"), "{text}");
    let miles: f64 = text.split("for ").nth(1).unwrap().split(" nm").next().unwrap().parse().unwrap();
    assert!(miles > 1.8 && miles < 3.1, "{miles}");
    assert!(d["plan"]["track"].as_array().unwrap().iter().any(|p| p["off"] == true));
}

#[test]
fn a_track_that_never_came_near_the_faf_is_no_approach_of_it() {
    let wide = fly(&final_of(&drawing("I08-Y")), Fly { off: Some(Box::new(|_| 2.0)), alt: Some(on_ils()), ..Default::default() });
    assert_eq!(ask("approach_attempts", json!({"drawing": drawing("I08-Y"), "points": wide})), json!([]));
    assert!(debrief(&drawing("I08-Y"), &wide, None).is_null());
    assert!(find(&[drawing("I08-Y"), drawing("R08-Z")], &wide, None).is_empty());
}

#[test]
fn on_an_rnav_a_mile_off_before_the_faf_is_within_terminal_full_scale_after_it_is_not() {
    let mikei = drawing("R08-Z:MIKEI");
    let line = way_in(&mikei);
    let mikei_to_go = length_of(&line[1..]);
    let alt = move |t: f64| {
        if t > mikei_to_go - 2.0 {
            7000.0
        } else if t > 6.0 {
            4100.0
        } else if t > 5.2 {
            3000.0
        } else {
            1200.0
        }
    };
    let half = |t: f64| if (t > 7.0 && t < 9.0) || (t > 1.5 && t < 3.0) { 0.6 } else { 0.0 };
    let track = fly(
        &line,
        Fly {
            alt: Some(Box::new(alt)),
            off: Some(Box::new(half)),
            after: 90,
            after_alt: Some(Box::new(|s| 1200.0 + s * 15.0)),
            ..Default::default()
        },
    );
    let d = debrief(&mikei, &track, None);
    let full: Vec<String> = texts(&d).into_iter().filter(|t| t.starts_with("Full scale")).collect();
    // ±1 nm before the ramp (AIM 1-1-17), ±0.3 nm down the final.
    assert_eq!(full.len(), 1, "{full:?}");
    assert!(full[0].starts_with("Full scale right of the course") && full[0].contains(" on final"), "{}", full[0]);
}

#[test]
fn a_track_under_a_fixs_altitude_before_it_is_flagged() {
    // The RNAV via MIKEI, down to 3,500 a mile and a half before SILEX's
    // 4,100 (at or above).
    let mikei = drawing("R08-Z:MIKEI");
    let line = way_in(&mikei);
    let silex_to_go = length_of(&line[2..]);
    let alt = move |t: f64| {
        if t > silex_to_go + 1.5 {
            7000.0
        } else if t > 5.5 {
            3500.0
        } else {
            1200.0
        }
    };
    let track =
        fly(&line, Fly { alt: Some(Box::new(alt)), after: 60, after_alt: Some(Box::new(|s| 1200.0 + s * 15.0)), ..Default::default() });
    let d = debrief(&mikei, &track, None);
    let silex = d["findings"].as_array().unwrap().iter().find(|f| f["text"].as_str().unwrap().contains("SILEX")).unwrap().clone();
    assert_eq!(silex, json!({"tone": "stop", "text": "At SILEX: 600 ft below 4,100"}));
    let under = d["crossings"].as_array().unwrap().iter().find(|c| c["ident"] == "SILEX").unwrap()["under_ft"].as_f64().unwrap();
    assert!((under - 600.0).abs() < 0.5, "{under}");
}

#[test]
fn under_a_step_down_inside_the_final_is_marked_for_an_mdas_minimums() {
    // RNAV Z 08 with a step-down fix halfway down its final at 1,800.
    let rnav = drawing("R08-Z");
    let final_line = rnav["lines"].as_array().unwrap().iter().find(|l| l["role"] == "final").unwrap().clone();
    let (bubne, himen) = (ll(&final_line["points"][1]), ll(&final_line["points"][2]));
    let mid = ((bubne.0 + himen.0) / 2.0, (bubne.1 + himen.1) / 2.0);
    let mut stepped = rnav.clone();
    stepped["lines"] = Value::Array(
        rnav["lines"]
            .as_array()
            .unwrap()
            .iter()
            .map(|l| {
                if l["role"] == "final" {
                    let mut l = l.clone();
                    l["points"] = json!([l["points"][0], [bubne.0, bubne.1], [mid.0, mid.1], [himen.0, himen.1]]);
                    l
                } else {
                    l.clone()
                }
            })
            .collect(),
    );
    let fixes = rnav["fixes"].as_array().unwrap();
    let mut new_fixes: Vec<Value> = fixes[..2].to_vec();
    new_fixes.push(json!({"ident": "STEPP", "lat": mid.0, "lon": mid.1, "roles": [], "min_ft": 1800, "max_ft": null, "missed": false}));
    new_fixes.extend_from_slice(&fixes[2..]);
    stepped["fixes"] = Value::Array(new_fixes);
    let mid_to_go = nm(mid, himen);
    let alt = move |t: f64| {
        if t > 5.4 {
            4100.0
        } else if t > mid_to_go + 1.0 {
            2400.0
        } else {
            1500.0
        }
    };
    let track = fly(
        &final_of(&stepped),
        Fly { alt: Some(Box::new(alt)), after: 60, after_alt: Some(Box::new(|s| 1500.0 + s * 15.0)), ..Default::default() },
    );
    let d = debrief(&stepped, &track, None);
    let stepp = d["findings"].as_array().unwrap().iter().find(|f| f["text"].as_str().unwrap().contains("STEPP")).unwrap().clone();
    assert_eq!(stepp, json!({"tone": "caution", "text": "At STEPP: 300 ft below 1,800 (an MDA's step-down, not a glidepath's)"}));
}

#[test]
fn under_the_pilots_minimums_before_a_missed_approach_is_flagged() {
    let d = debrief(&drawing("I08-Y"), &ils_track(60, 3.0), Some(1000.0));
    let down = d["findings"].as_array().unwrap().iter().find(|f| f["text"].as_str().unwrap().starts_with("Down to")).unwrap();
    assert_eq!(down["tone"], "stop");
    // Typed again: at or above lower minimums, and the old finding gone.
    let lower = ask(
        "approach_minimums",
        json!({"findings": d["findings"], "lowest_ft": d["lowest_ft"], "outcome": d["outcome"]["kind"], "minimums_ft": 700}),
    );
    let mins: Vec<&Value> = lower.as_array().unwrap().iter().filter(|f| f["minimums"] == true).collect();
    assert_eq!(mins, [&json!({"tone": "ok", "text": "Lowest before the MAP: 787 ft, at or above 700", "minimums": true})]);
}

#[test]
fn under_the_minimums_to_land_is_what_91_175_c_allows() {
    let d = debrief(&drawing("I08-Y"), &ils_landing(), Some(1000.0));
    let f = d["findings"].as_array().unwrap().iter().find(|f| f["minimums"] == true).unwrap().clone();
    assert_eq!(f, json!({"tone": "info", "text": "Below 1,000 to land: 91.175(c) asks for the runway in sight there", "minimums": true}));
}

#[test]
fn below_the_glide_slopes_full_scale_is_flagged() {
    let ils = on_ils();
    let low = move |t: f64| if t < 4.0 && t > 2.0 { ils(t) - 400.0 } else { ils(t) };
    let track = fly(
        &final_of(&drawing("I08-Y")),
        Fly { alt: Some(Box::new(low)), after: 60, after_alt: Some(missed_after(5.0)), ..Default::default() },
    );
    let d = debrief(&drawing("I08-Y"), &track, None);
    assert!(d["findings"]
        .as_array()
        .unwrap()
        .iter()
        .any(|f| f["tone"] == "stop" && f["text"].as_str().unwrap().starts_with("Below the glide slope's full scale")));
    let gp = texts(&d).into_iter().find(|t| t.starts_with("Glidepath")).unwrap();
    assert!(gp.ends_with("to 400 ft below it"), "{gp}");
}
