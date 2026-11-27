use super::*;

// --- verdict ----------------------------------------------------------------

pub(super) fn quiet() -> Input {
    Input {
        weather: verdict::Weather { worst: Some(s("3,500 ft · 6 sm")), ..Default::default() },
        airspace: Default::default(),
        altitude: verdict::Altitude { flown: Some(s("FL055 · Lowest")), ..Default::default() },
        fuel: verdict::Fuel { margin_gal: Some(12.4), required_gal: Some(27.6), reserve_min: Some(30.0), ..Default::default() },
        runways: verdict::Runways { worked: true, ..Default::default() },
        balance: verdict::Balance { worked: true, takeoff: Some(s("2,407 lb at 41.2 in")), ..Default::default() },
        risk: Some((s("low"), s("Low · 2 points"))),
    }
}

pub(super) fn finding(v: &Input, key: &str) -> verdict::Item {
    verdict::verdict_items(v).into_iter().find(|i| i.key == key).unwrap()
}

#[test]
fn finds_nothing_against_a_quiet_day_every_row_saying_what_it_checked() {
    let items = verdict::verdict_items(&quiet());
    assert!(items.iter().all(|i| i.finding == "ok"));
    assert_eq!(items.len(), 7);
    assert_eq!(finding(&quiet(), "fuel").detail, "Needs 27.6 gal with taxi and a 30 min reserve; 12.4 gal beyond reserve");
    assert_eq!(verdict::verdict_line(&items), ("ok", s("Nothing found against this flight")));
}

#[test]
fn is_no_go_on_vfr_not_recommended_a_tfr_in_force_too_little_fuel_or_no_altitude_naming_each() {
    let mut v = quiet();
    v.weather.vfr_not_recommended = strings(&["KDLH currently reporting IFR"]);
    v.airspace.in_force = strings(&["6/1111"]);
    v.fuel.margin_gal = Some(-2.25);
    v.altitude.problem = Some(s("Ceiling 11,700 ft: terrain 40 nm past KDLH needs 12,500"));
    assert_eq!(finding(&v, "weather").detail, "VFR not recommended: KDLH currently reporting IFR");
    assert_eq!(finding(&v, "fuel").detail, "2.3 gal short of the fuel and its 30 min reserve (14 CFR 91.151)");
    assert_eq!(verdict::verdict_line(&verdict::verdict_items(&v)).1, "No-go as planned: weather, TFRs & special use, altitude, fuel");
}

#[test]
fn under_ifr_cites_the_ifr_reserves_rule() {
    let mut v = quiet();
    v.fuel = verdict::Fuel { margin_gal: Some(-2.25), reserve_min: Some(45.0), ifr: true, ..v.fuel };
    assert_eq!(finding(&v, "fuel").detail, "2.3 gal short of the fuel and its 45 min reserve (14 CFR 91.167)");
}

#[test]
fn under_ifr_asks_for_another_look_at_icing_before_the_hazards_it_may_come_from() {
    let icing = "Icing possible at 6,000 ft: the freezing level at 5,000 ft, in cloud";
    let mut v = quiet();
    v.weather.icing = Some(s(icing));
    v.weather.hazards = strings(&["Icing G-AIRMET"]);
    let item = finding(&v, "weather");
    assert_eq!((item.finding.as_str(), item.detail.as_str(), item.section.as_deref()), ("caution", icing, Some("Adverse Conditions")));
    let mut mine = quiet();
    mine.weather.icing = Some(s(icing));
    mine.weather.under_minimums = strings(&["KDLH 800 ft"]);
    assert_eq!(finding(&mine, "weather").finding, "stop");
}

#[test]
fn asks_for_another_look_at_hazards_an_area_in_use_a_pilots_own_altitude_and_a_crosswind() {
    let mut v = quiet();
    v.weather.hazards = strings(&["IFR G-AIRMET"]);
    v.airspace.special_use = vec![(s("VOLK EAST MOA"), s("active"))];
    v.altitude.cautions = strings(&["Westbound above 3,000 ft flies even thousands plus 500 (14 CFR 91.159)"]);
    v.runways.crosswind = strings(&["C81"]);
    assert_eq!(finding(&v, "airspace").detail, "VOLK EAST MOA scheduled in use when you pass");
    assert_eq!(verdict::verdict_line(&verdict::verdict_items(&v)).1, "Look again at weather, TFRs & special use, altitude, runways");
}

#[test]
fn an_itws_alert_at_the_routes_airports_is_a_caution_saying_its_source() {
    let mut v = quiet();
    v.weather.terminal_alerts = strings(&["ATL: Runway 27L arrival microburst alert 40 kt, 3 mile final to runway"]);
    let item = finding(&v, "weather");
    assert_eq!(
        (item.finding.as_str(), item.detail.as_str()),
        ("caution", "ATL: Runway 27L arrival microburst alert 40 kt, 3 mile final to runway (FAA ITWS, now)")
    );
    // Under the pilot's own minimums still says so first.
    v.weather.under_minimums = strings(&["KATL 400 ft"]);
    assert_eq!(finding(&v, "weather").finding, "stop");
}

#[test]
fn a_ground_stop_is_a_caution_under_ifr_and_nothing_under_vfr() {
    let mut v = quiet();
    v.weather.flow_programs = strings(&["Ground stop at EWR until 2130Z"]);
    assert_eq!(finding(&v, "weather").finding, "ok");
    v.weather.ifr = true;
    let item = finding(&v, "weather");
    assert_eq!((item.finding.as_str(), item.detail.as_str()), ("caution", "Ground stop at EWR until 2130Z (FAA Command Center)"));
}

#[test]
fn sfdps_saying_an_area_is_active_or_cold_now_comes_before_its_schedule() {
    let mut v = quiet();
    v.airspace.special_use = vec![(s("R-4401A"), s("active")), (s("W-136C"), s("active-now"))];
    assert_eq!(finding(&v, "airspace").detail, "W-136C active now (FAA SFDPS)");
    v.airspace.special_use = vec![(s("R-4401A"), s("cold-now")), (s("B"), s("not-scheduled"))];
    let item = finding(&v, "airspace");
    assert_eq!(
        (item.finding.as_str(), item.detail.as_str()),
        ("ok", "1 special-use area not scheduled then; 1 special-use area cold now (FAA SFDPS)")
    );
}

#[test]
fn says_what_was_not_worked_out_and_what_is_still_coming() {
    let mut v = quiet();
    v.runways.worked = false;
    v.balance = verdict::Balance::default();
    assert_eq!(verdict::verdict_line(&verdict::verdict_items(&v)).1, "No problems found; not checked: runways, weight & balance");
    let mut coming = quiet();
    coming.weather.pending = true;
    coming.risk = None;
    assert_eq!(verdict::verdict_line(&verdict::verdict_items(&coming)), ("pending", s("Still checking: weather, risk")));
}

#[test]
fn names_a_near_tfr_and_an_area_not_scheduled_as_nothing_against_it() {
    let mut v = quiet();
    v.airspace.near = 2.0;
    v.airspace.special_use = vec![(s("A"), s("not-scheduled"))];
    let item = finding(&v, "airspace");
    assert_eq!(
        (item.finding.as_str(), item.detail.as_str()),
        ("ok", "2 TFRs near, none in force on the route; 1 special-use area not scheduled then")
    );
}

#[test]
fn an_altitude_line_left_empty_stays_empty_as_the_webs_nullish_says() {
    // `flown ?? "Planned"`: only none is "Planned".
    let mut v = quiet();
    v.altitude.flown = Some(String::new());
    assert_eq!(finding(&v, "altitude").detail, "");
    v.altitude.flown = None;
    assert_eq!(finding(&v, "altitude").detail, "Planned");
}

#[test]
fn the_alternate_speaks_for_the_weather_where_the_weather_says_nothing_worse() {
    // 91.169(a)(2) is a prohibition: a required alternate not filed is a stop.
    let needed = Alternates { required: true, alternate: None, ..Alternates::default() };
    assert_eq!(
        verdict::alternate_finding(Some(&needed)),
        Some(("stop", s("An alternate is required (14 CFR 91.169(a)(2)) and none is filed: file one in Weather")))
    );
    assert_eq!(verdict::alternate_finding(Some(&Alternates::default())), None);
    // A check that failed shows nothing 91.169(b) needs: unknown, never ok.
    let failed = Alternates { failed: true, ..Alternates::default() };
    assert_eq!(verdict::alternate_finding(Some(&failed)), Some(verdict::alternate_unchecked()));
    assert_eq!(verdict::alternate_unchecked().0, "unknown");
    let awaited = Alternates { pending: true, ..Alternates::default() };
    assert_eq!(verdict::alternate_finding(Some(&awaited)).map(|f| f.0), Some("pending"));
    let filed = |good, good_given| Alternates {
        required: true,
        alternate: Some(FiledAlternate { ident: s("KMSN"), good, good_given, first_reason: None, closed: false }),
        ..Alternates::default()
    };
    let under = verdict::alternate_finding(Some(&filed(Some(false), true)));
    assert_eq!(under, Some(("stop", s("KMSN is under its alternate minimums at the ETA there"))));
    assert_eq!(verdict::alternate_finding(Some(&filed(None, true))), Some(("caution", s("KMSN: check it"))));
    // A closed field is never an alternate (decision 0043).
    let mut closed = filed(Some(false), true);
    closed.alternate.as_mut().unwrap().closed = true;
    assert_eq!(verdict::alternate_finding(Some(&closed)), Some(("stop", s("KMSN is closed: file another alternate"))));
    // `good === null` only: an answer with no `good` says nothing.
    assert_eq!(verdict::alternate_finding(Some(&filed(None, false))), None);
    let (f, d) = under.unwrap();
    let items = verdict::with_alternate(verdict::verdict_items(&quiet()), Some((f, &d)));
    let weather = items.iter().find(|i| i.key == "weather").unwrap();
    assert_eq!((weather.finding.as_str(), weather.tab.as_str(), weather.section.as_deref()), ("stop", "arrive", Some("Alternate")));
    let mut vnr = quiet();
    vnr.weather.vfr_not_recommended = strings(&["x"]);
    let stopped = verdict::with_alternate(verdict::verdict_items(&vnr), Some((f, &d)));
    assert_eq!(stopped[0].section.as_deref(), Some("Adverse Conditions"));
    assert_eq!(verdict::verdict_line(&items).0, "stop");
}
