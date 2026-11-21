use super::pass_times_cases::call;
use super::*;

// --- frat -------------------------------------------------------------------

pub(super) const DAY: &str = "2026-10-05";

pub(super) fn quiet_risk() -> frat::Input {
    frat::Input { fuel_margin_gal: Some(10.0), day: s(DAY), ..Default::default() }
}

pub(super) fn current() -> Currency {
    Currency {
        day_passengers_until: Some(s("2026-12-01")),
        flight_review_until: Some(s("2027-06-30")),
        medical_expires_on: Some(s("2028-01-31")),
        total_hours: 240.0,
        flights: 120.0,
        ..Default::default()
    }
}

pub(super) fn keys(a: &frat::Assessment) -> Vec<&str> {
    a.factors.iter().map(|f| f.key.as_str()).collect()
}

#[test]
fn a_quiet_day_is_low_and_a_few_things_together_raise_it() {
    let a = frat::assess(&quiet_risk());
    assert_eq!((a.score, a.level, a.factors.len()), (0, "low", 0));
    let evening = frat::assess(&frat::Input { night: true, hazards: 1, ticked: strings(&["pressure"]), ..quiet_risk() });
    assert_eq!((evening.score, evening.level), (3 + 2 + 3, "caution"));
    assert_eq!(keys(&evening), ["hazards", "night", "pressure"]);
    // A self check ticked keeps its group, and is drawn with no mark.
    let pressure = &evening.factors[2];
    assert_eq!((pressure.group.as_deref(), frat::mark(pressure)), (Some("The day"), None));
    assert_eq!(frat::mark(&evening.factors[0]), Some("caution"));
}

#[test]
fn the_briefings_no_go_and_the_pilots_own_minimums_are_high_on_their_own() {
    let vnr = frat::assess(&frat::Input { vfr_not_recommended: true, ..quiet_risk() });
    assert_eq!(vnr.level, "high");
    assert_eq!(frat::mark(&vnr.factors[0]), Some("stop"));
    let mine = frat::assess(&frat::Input { under_minimums: strings(&["KDLH ceiling 900 ft, under your 1,500 ft"]), ..quiet_risk() });
    assert!(mine.factors[0].why.as_deref().unwrap().contains("KDLH"));
}

#[test]
fn what_makes_the_flight_unlawful_is_high_whatever_the_points() {
    let alcohol = frat::assess(&frat::Input { ticked: strings(&["alcohol"]), ..quiet_risk() });
    assert_eq!((alcohol.score, alcohol.level), (0, "high"));
    let short = frat::assess(&frat::Input { fuel_margin_gal: Some(-0.5), ..quiet_risk() });
    assert_eq!((short.level, short.factors[0].why.as_deref()), ("high", Some("91.151")));
    let ifr_short = frat::assess(&frat::Input { fuel_margin_gal: Some(-0.5), ifr: true, ..quiet_risk() });
    assert_eq!(ifr_short.factors[0].why.as_deref(), Some("91.167"));
    assert_eq!(keys(&frat::assess(&frat::Input { currency: Some(current()), ifr: true, ..quiet_risk() })), ["instrument"]);
    let instrument = Currency { instrument_current_until: Some(s("2026-10-31")), ..current() };
    assert!(frat::assess(&frat::Input { currency: Some(instrument), ifr: true, ..quiet_risk() }).factors.is_empty());
    assert!(frat::assess(&frat::Input { currency: Some(current()), ..quiet_risk() }).factors.is_empty());
    assert_eq!(keys(&frat::assess(&frat::Input { ifr: true, vor_check: VorCheck::None, ..quiet_risk() })), ["vor"]);
    let checked = |good_through: &str| VorCheck::Checked { good_through: s(good_through), within_limit: true };
    assert!(frat::assess(&frat::Input { ifr: true, vor_check: checked("2026-10-20"), ..quiet_risk() }).factors.is_empty());
    assert_eq!(keys(&frat::assess(&frat::Input { ifr: true, vor_check: checked("2026-10-01"), ..quiet_risk() })), ["vor"]);
    assert!(frat::assess(&frat::Input { ifr: true, ..quiet_risk() }).factors.is_empty());
    let lapsed = Currency { flight_review_until: Some(s("2026-09-30")), ..current() };
    assert_eq!(frat::assess(&frat::Input { currency: Some(lapsed), ..quiet_risk() }).level, "high");
}

#[test]
fn the_logbook_counts_only_where_the_pilot_keeps_one_and_night_landings_only_at_night() {
    let none = Currency { flights: 0.0, total_hours: 0.0, day_passengers_until: None, ..current() };
    assert!(frat::assess(&frat::Input { currency: Some(none), ..quiet_risk() }).factors.is_empty());
    assert_eq!(keys(&frat::assess(&frat::Input { night: true, currency: Some(current()), ..quiet_risk() })), ["night", "recent-night"]);
}

/// 61.57(b)'s night-passenger caution follows its own window, an hour
/// after sunset to an hour before sunrise, not 1.1's night: out of
/// Anchorage at 02:00 on the June solstice there is no 1.1 night (civil
/// twilight all night) but the caution is raised; at Chicago 45 minutes
/// after sunset it is 1.1's night but not yet the period.
#[test]
fn the_night_passenger_caution_follows_61_57_bs_own_window() {
    let anchorage = frat::Input { night: false, night_passengers: Some(true), currency: Some(current()), ..quiet_risk() };
    assert_eq!(keys(&frat::assess(&anchorage)), ["recent-night"]);
    let dusk = frat::Input { night: true, night_passengers: Some(false), currency: Some(current()), ..quiet_risk() };
    assert_eq!(keys(&frat::assess(&dusk)), ["night"]);
    let risk = call(
        "gonogo_risk",
        r#"{"day": "2026-06-21", "night": false, "night_passengers": true, "currency": {"flights": 10, "total_hours": 200,
        "day_passengers_until": "2026-12-01", "flight_review_until": "2027-06-30", "medical_expires_on": "2028-01-31"}}"#,
    );
    assert_eq!(risk["factors"][0]["key"], "recent-night");
}

/// 91.209(a) wants the position lights lit from sunset, before 1.1's
/// night begins: a flight twenty minutes after sunset with an inoperative
/// item deferred for VFR by day is grounded by it, as at night, and by
/// day it is not.
#[test]
fn a_day_deferral_grounds_a_flight_after_sunset() {
    let open = Some(vec![squawk("Left position light out", true, Some("VFR_DAY"))]);
    let dusk = frat::Input { night: false, lights: Some(true), squawks: open.clone(), ..quiet_risk() };
    assert_eq!(keys(&frat::assess(&dusk)), ["inoperative"]);
    let day = frat::Input { night: false, lights: Some(false), squawks: open, ..quiet_risk() };
    assert!(keys(&frat::assess(&day)).is_empty());
}

/// Approaches flown this month count from next month (61.57(c)(1)): with
/// the currency's first day after the flight's, the pilot is not
/// instrument current yet, whatever its last day.
#[test]
fn an_instrument_currency_not_begun_yet_is_not_current() {
    let soon = Currency { instrument_current_from: Some(s("2026-11-01")), instrument_current_until: Some(s("2027-04-30")), ..current() };
    assert_eq!(keys(&frat::assess(&frat::Input { currency: Some(soon.clone()), ifr: true, ..quiet_risk() })), ["instrument"]);
    let november = frat::Input { currency: Some(soon), ifr: true, day: s("2026-11-01"), ..quiet_risk() };
    assert!(frat::assess(&november).factors.is_empty());
}

pub(super) fn good() -> Inspections {
    Inspections {
        annual_good_through: Some(s("2026-10-31")),
        hours_now: Some(1250.0),
        hundred_hour_due_at_hours: Some(1300.5),
        static_check_good_through: Some(s("2027-01-31")),
        transponder_check_good_through: Some(s("2027-01-31")),
        elt_inspection_good_through: Some(s("2027-02-28")),
        elt_battery_due_on: Some(s("2028-06-01")),
    }
}

pub(super) fn inspection_keys(i: &Inspections, ifr: bool) -> Vec<String> {
    frat::inspection_factors(i, DAY, ifr).into_iter().map(|f| f.key).collect()
}

#[test]
fn inspections_all_good_nothing_none_recorded_nothing_either_way() {
    assert!(inspection_keys(&good(), true).is_empty());
    assert!(inspection_keys(&Inspections::default(), true).is_empty());
}

#[test]
fn an_annual_an_elt_inspection_or_an_elt_battery_past_due_stops_the_flight() {
    assert!(frat::inspection_factors(&Inspections { annual_good_through: Some(s(DAY)), ..good() }, DAY, false).is_empty());
    let annual = frat::inspection_factors(&Inspections { annual_good_through: Some(s("2026-09-30")), ..good() }, DAY, false);
    assert_eq!(
        annual.iter().map(|f| (f.key.as_str(), f.stop, f.why.as_deref())).collect::<Vec<_>>(),
        [("annual", true, Some("91.409(a)"))]
    );
    assert_eq!(inspection_keys(&Inspections { elt_inspection_good_through: Some(s("2026-09-30")), ..good() }, false), ["elt"]);
    assert_eq!(inspection_keys(&Inspections { elt_battery_due_on: Some(s(DAY)), ..good() }, false), ["eltBattery"]);
    let past = Inspections { annual_good_through: Some(s("2026-09-30")), ..good() };
    assert_eq!(frat::assess(&frat::Input { inspections: Some(past), ..quiet_risk() }).level, "high");
}

#[test]
fn the_static_test_only_under_ifr_the_transponder_and_the_100_hour_as_cautions() {
    let lapsed = Inspections { static_check_good_through: Some(s("2026-09-30")), ..good() };
    assert!(inspection_keys(&lapsed, false).is_empty());
    assert_eq!(inspection_keys(&lapsed, true), ["static"]);
    let transponder =
        frat::inspection_factors(&Inspections { transponder_check_good_through: Some(s("2026-09-30")), ..good() }, DAY, false);
    assert_eq!((transponder[0].key.as_str(), transponder[0].points, transponder.len()), ("transponder", 3, 1));
    assert_eq!(inspection_keys(&Inspections { hours_now: Some(1300.5), ..good() }, false), ["hundredHour"]);
    assert!(inspection_keys(&Inspections { hours_now: Some(1300.4), ..good() }, false).is_empty());
}

pub(super) fn squawk(text: &str, inoperative: bool, deferred_for: Option<&str>) -> Squawk {
    Squawk { text: s(text), inoperative, deferred_for: deferred_for.map(s) }
}

#[test]
fn an_inoperative_item_not_deferred_for_this_kind_of_flight_stops_it_other_squawks_are_a_caution() {
    let light = squawk("Landing light out", true, Some("VFR_DAY"));
    let keys_of = |f: Vec<frat::Factor>| f.into_iter().map(|f| f.key).collect::<Vec<_>>();
    assert_eq!(keys_of(frat::squawk_factors(std::slice::from_ref(&light), false, false)), ["squawks"]);
    let night = frat::squawk_factors(std::slice::from_ref(&light), true, false);
    assert_eq!((night[0].key.as_str(), night[0].stop, night[0].why.as_deref()), ("inoperative", true, Some("91.213(d)")));
    assert_eq!(frat::squawk_factors(&[light], false, true)[0].label, "Inoperative and not deferred for this flight: Landing light out");
    assert_eq!(keys_of(frat::squawk_factors(&[squawk("Landing light out", true, Some("ALL"))], true, true)), ["squawks"]);
    let both = frat::squawk_factors(&[squawk("Landing light out", true, None), squawk("Paint chip", false, None)], false, false);
    assert_eq!(both.iter().map(|f| f.key.as_str()).collect::<Vec<_>>(), ["inoperative", "squawks"]);
    assert_eq!((both[1].label.as_str(), both[1].points), ("1 open squawk: read it before flight", 1));
    let grounded = frat::Input { squawks: Some(vec![squawk("Landing light out", true, None)]), ..quiet_risk() };
    assert_eq!(frat::assess(&grounded).level, "high");
}

#[test]
fn a_stock_profile_has_none_to_say_and_the_lines_and_checks_read_as_the_web() {
    assert!(frat::assess(&quiet_risk()).factors.is_empty());
    assert_eq!(frat::risk_line("caution", 8), "Raised · 8 points");
    assert_eq!(frat::risk_line("low", 1), "Low · 1 point");
    let checks: Value = serde_json::from_str(&frat::self_checks_json()).unwrap();
    assert_eq!(checks[3]["key"], "alcohol");
    assert_eq!((checks[3]["stop"].as_bool(), checks[3]["group"].as_str(), checks[3]["finding"].is_null()), (Some(true), Some("You"), true));
    let whole: Value = serde_json::from_str(&frat::assessment_json(&frat::assess(&frat::Input { night: true, ..quiet_risk() }))).unwrap();
    assert_eq!((whole["line"].as_str(), whole["words"].as_str()), (Some("Low · 3 points"), Some("Go, with the usual care.")));
    assert_eq!(whole["factors"][0]["finding"], "caution");
}
