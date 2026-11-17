use super::*;

// --- minimums ---------------------------------------------------------------

pub(super) fn wind(end: &str, headwind_kt: f64, crosswind_kt: f64, gust: Option<f64>) -> RunwayWind {
    RunwayWind { end: s(end), headwind_kt, crosswind_kt, gust_crosswind_kt: gust, in_use: false, crosswind_exact_kt: None }
}

pub(super) fn c81_winds() -> Vec<(bool, Option<RunwayWind>)> {
    vec![(false, Some(wind("24", 10.0, 9.0, Some(14.0)))), (false, Some(wind("36", 5.0, -11.0, Some(-13.0))))]
}

pub(super) fn briefing() -> minimums::Weather {
    minimums::Weather {
        landings: vec![
            Landing {
                ident: s("C81"),
                metar: Some(Winds {
                    ceiling_ft: Some(2500.0),
                    visibility_sm: Some(10.0),
                    wind_speed_kt: Some(12.0),
                    wind_gust_kt: Some(22.0),
                }),
                runways: c81_winds(),
            },
            Landing { ident: s("KDLH"), metar: None, runways: vec![] },
        ],
        dest: s("KDLH"),
        dest_forecast: Some((Some(4000.0), Some(4.0))),
        min_ceiling_ft: Some(1800.0),
        min_visibility_sm: Some(6.0),
    }
}

#[test]
fn none_set_nothing_is_under_them() {
    assert!(minimums::under_minimums(&Minimums::default(), &briefing()).is_empty());
}

#[test]
fn the_best_runway_is_the_one_with_the_least_crosswind_gusts_included() {
    assert_eq!(minimums::best_crosswind(&c81_winds(), None), Some((Some(s("36")), 13.0)));
}

#[test]
fn leaves_a_closed_runway_out_whatever_its_wind() {
    let runways = vec![(true, Some(wind("27", 15.0, 0.0, None))), (false, Some(wind("36", 0.0, -15.0, None)))];
    assert_eq!(minimums::best_crosswind(&runways, None), Some((Some(s("36")), 15.0)));
}

#[test]
fn takes_a_variable_wind_which_favours_no_runway_as_all_crosswind_gusts_included() {
    let runways = vec![(false, None)];
    assert_eq!(minimums::best_crosswind(&runways, Some((Some(15.0), Some(25.0)))), Some((None, 25.0)));
    assert_eq!(minimums::best_crosswind(&runways, Some((Some(0.0), None))), None);
    let vrb = minimums::Weather {
        landings: vec![Landing {
            ident: s("C81"),
            metar: Some(Winds { wind_speed_kt: Some(15.0), wind_gust_kt: Some(25.0), ..Default::default() }),
            runways,
        }],
        ..briefing()
    };
    let m = Minimums { crosswind_kt: Some(15.0), ..Default::default() };
    assert_eq!(minimums::under_minimums(&m, &vrb), strings(&["C81 variable wind 25 kt, which may all be crosswind, over your 15 kt"]));
}

#[test]
fn each_airports_report_the_destinations_forecast_and_the_routes_against_each_minimum() {
    let mine = Minimums { ceiling_ft: Some(3000.0), visibility_sm: Some(5.0), crosswind_kt: Some(10.0), wind_kt: Some(20.0) };
    assert_eq!(
        minimums::under_minimums(&mine, &briefing()),
        strings(&[
            "C81 ceiling 2,500 ft, under your 3,000 ft", "C81 wind 12G22 kt, over your 20 kt",
            "C81 crosswind 13 kt on its best runway (36), over your 10 kt", "KDLH forecast visibility 4 sm, under your 5 sm",
            "Along the route, forecast ceiling 1,800 ft, under your 3,000 ft",
        ])
    );
}

// --- icing ------------------------------------------------------------------

pub(super) fn selection(level: Option<f64>, possible: bool, at_or_below: bool) -> Selection {
    Selection { freezing_level_ft: level, possible, at_or_below }
}

#[test]
fn a_leg_at_or_above_the_freezing_level_in_cloud_with_the_reports_of_icing_near_the_route() {
    let pireps = [Some(s("MOD")), Some(s("NEG")), Some(s("NEGclr")), None, Some(s("LGT-MOD"))];
    let found = icing::icing_at_altitude(&selection(Some(5000.0), true, false), &[4000.0, 6000.0], &pireps).unwrap();
    assert_eq!(found, icing::Icing { altitude_ft: 6000.0, freezing_level_ft: 5000.0, at_or_below: false, reports: 2 });
    assert_eq!(
        icing::icing_line(&found),
        "Icing possible at 6,000 ft: the freezing level at 5,000 ft, in cloud; 2 pilot reports of icing near the route"
    );
    assert!(icing::icing_at_altitude(&selection(Some(5000.0), true, false), &[5000.0], &[]).is_some());
}

#[test]
fn nothing_below_the_freezing_level_without_the_moisture_or_where_the_level_is_not_known() {
    assert!(icing::icing_at_altitude(&selection(Some(5000.0), true, false), &[4000.0, 4999.0], &[]).is_none());
    assert!(icing::icing_at_altitude(&selection(Some(5000.0), false, false), &[8000.0], &[]).is_none());
    assert!(icing::icing_at_altitude(&selection(None, true, false), &[8000.0], &[]).is_none());
}

#[test]
fn a_freezing_level_at_or_below_the_lowest_forecast_altitude_is_every_altitude() {
    let found = icing::icing_at_altitude(&selection(Some(3000.0), true, true), &[2000.0], &[]).unwrap();
    assert_eq!(icing::icing_line(&found), "Icing possible at 2,000 ft: the freezing level at or below 3,000 ft, in cloud");
}
