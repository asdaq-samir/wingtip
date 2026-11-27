//! 61.57(b)(1)'s night takeoffs and full stops counted together.

use super::*;

fn at(kind: &'static str, passenger_night: bool) -> Event {
    let counts_night = kind == "full_stop" && passenger_night;
    Event { t: 0.0, lat: 0.0, lon: 0.0, field: None, towered: false, kind, night: true, passenger_night, counts_night }
}

#[test]
fn a_night_full_stop_counts_only_with_a_takeoff_in_the_period_too() {
    // 61.57(b)(1): a takeoff at sunset +59 min is outside the period, +61 inside.
    assert_eq!(night_currency_landings(&[at("", false)], &[at("full_stop", true)]), 0);
    assert_eq!(night_currency_landings(&[at("", true)], &[at("full_stop", true)]), 1);
    // Three takeoffs and three full stops in it: three; a touch-and-go never.
    let three = [at("", true), at("", true), at("", true)];
    assert_eq!(night_currency_landings(&three, &[at("full_stop", true), at("touch_and_go", true), at("full_stop", true)]), 2);
}
