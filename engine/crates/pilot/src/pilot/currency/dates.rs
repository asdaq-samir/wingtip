use super::*;

/// The dates the pilot gives, each "YYYY-MM-DD" or none.
pub struct Dates<'a> {
    pub flight_review_on: Option<&'a str>,
    pub medical_expires_on: Option<&'a str>,
    pub ipc_on: Option<&'a str>,
    pub today: &'a str,
}

pub(super) fn member(out: &mut String, key: &str) {
    if !out.ends_with('{') {
        out.push(',');
    }
    json::string(out, key);
    out.push(':');
}

/// Where the pilot stands on `today`, as the gateway's CurrencyDto:
/// `dayPassengersUntil` (61.57(a)), `nightPassengersUntil` (61.57(b)),
/// `flightReviewOn` and `flightReviewUntil` (61.56(c)), `medicalExpiresOn`
/// (as the pilot gives it: when it falls depends on its class and the
/// pilot's age, 61.23(d)), the logbook's totals, and instrument currency
/// -- `instrumentCurrentUntil` (61.57(c)(1), (d)), `instrumentCurrentFrom`
/// (the first day of a currency not begun yet, the month after
/// approaches flown this month; null when current now), `ipcOn`,
/// `ipcNeededAfter` (61.57(d)), and what the 6 calendar months before
/// this one hold (`approachesInWindow`, `holdingInWindow`,
/// `trackingInWindow`). Each date null where it cannot be had.
pub fn currency_json(name: &str, entries: &[Entry], dates: &Dates) -> Result<String, String> {
    let today = day(name, dates.today)?;
    let review = dates.flight_review_on.map(|d| day(name, d)).transpose()?;
    if let Some(m) = dates.medical_expires_on {
        day(name, m)?;
    }
    let ipc = dates.ipc_on.map(|d| day(name, d)).transpose()?;
    let ipc_month = ipc.map(|(y, m, _)| month_index(y, m));
    let instrument = instrument_until(entries, ipc_month);
    let month = month_index(today.0, today.1);
    let from = instrument_from(entries, ipc_month, instrument, month);
    let mut out = String::from("{");
    let opt = |out: &mut String, key: &str, v: Option<String>| {
        member(out, key);
        json::opt_string(out, v.as_deref());
    };
    let num = |out: &mut String, key: &str, v: f64| {
        member(out, key);
        json::number(out, v);
    };
    let int = |out: &mut String, key: &str, v: f64| {
        member(out, key);
        out.push_str(&format!("{}", v as i64));
    };
    let flag = |out: &mut String, key: &str, v: bool| {
        member(out, key);
        out.push_str(if v { "true" } else { "false" });
    };
    opt(&mut out, "dayPassengersUntil", passengers_until(entries, &Entry::landings));
    opt(&mut out, "nightPassengersUntil", passengers_until(entries, &|e| e.night_landings));
    opt(&mut out, "flightReviewOn", dates.flight_review_on.map(str::to_owned));
    opt(&mut out, "flightReviewUntil", review.map(|r| end_of_month_after(r, FLIGHT_REVIEW_MONTHS)));
    opt(&mut out, "medicalExpiresOn", dates.medical_expires_on.map(str::to_owned));
    num(&mut out, "totalHours", tenth(entries.iter().map(|e| e.total).sum()));
    num(&mut out, "nightHours", tenth(entries.iter().map(|e| e.night).sum()));
    num(&mut out, "crossCountryHours", tenth(entries.iter().map(|e| e.cross_country).sum()));
    int(&mut out, "landings", entries.iter().map(Entry::landings).sum());
    int(&mut out, "flights", entries.len() as f64);
    opt(&mut out, "instrumentCurrentUntil", instrument.map(end_of_month));
    opt(&mut out, "instrumentCurrentFrom", from.map(start_of_month));
    opt(&mut out, "ipcOn", dates.ipc_on.map(str::to_owned));
    opt(&mut out, "ipcNeededAfter", instrument.map(|m| end_of_month(m + INSTRUMENT_MONTHS)));
    int(&mut out, "approachesInWindow", in_window(entries, month).map(|e| e.approaches).sum());
    flag(&mut out, "holdingInWindow", in_window(entries, month).any(|e| e.holding));
    flag(&mut out, "trackingInWindow", in_window(entries, month).any(|e| e.tracking));
    out.push('}');
    Ok(out)
}

/// One of 61.109(a)'s requirements: its key, rule, what it asks for, how
/// much of it the logbook shows of how much, in "h", "landings" or
/// "flights", and whether that is met.
pub struct Item {
    pub key: &'static str,
    pub rule: &'static str,
    pub label: &'static str,
    pub have: f64,
    pub need: f64,
    pub unit: &'static str,
}

/// 14 CFR 61.109(a), for a private pilot certificate with an airplane
/// single-engine class rating, item by item as the logbook shows it on
/// `today`. Hours flown with an instructor and cross-country (or at night)
/// are counted as the smaller of the two on each entry, a logbook keeping
/// them in separate columns: two hours of dual on a flight with one hour
/// cross-country is one hour of dual cross-country. Each figure is the
/// rule's own:
///
/// - (a): 40 hours of flight time, 20 of flight training from an
///   authorized instructor and 10 of solo;
/// - (a)(1): 3 hours of cross-country flight training;
/// - (a)(2): 3 hours of night flight training, with (i) one cross-country
///   of more than 100 nm total distance and (ii) 10 takeoffs and 10
///   landings to a full stop, each in the traffic pattern;
/// - (a)(3): 3 hours of flight training by reference to instruments;
/// - (a)(4): 3 hours of flight training for the practical test "within
///   the preceding 2 calendar months before the test", counted from the
///   first of the month two months before this one;
/// - (a)(5): 10 hours of solo, with (i) 5 hours of solo cross-country,
///   (ii) one solo cross-country of 150 nm total distance with full-stop
///   landings at three points and one segment of more than 50 nm straight
///   line between takeoff and landing, and (iii) three takeoffs and
///   landings to a full stop at an airport with an operating control tower.
///
/// The logbook's columns cannot tell every condition apart (a landing in
/// the pattern, a straight-line segment, the 150 nm counted as flown), so
/// what they show is taken as meeting it; the instructor's endorsement for
/// the practical test (61.39(a)(6)) is the sign-off, not this.
pub fn experience(entries: &[Entry], today: (i64, u32, u32)) -> Vec<Item> {
    let dual = |e: &&Entry| e.dual > 0.0;
    let solo = |e: &&Entry| e.solo > 0.0;
    // The first of the month two months before this one.
    let back = month_index(today.0, today.1) - 2;
    let two_months = days_from_civil(back.div_euclid(12), (back.rem_euclid(12) + 1) as u32, 1);
    let sum = |which: &dyn Fn(&&Entry) -> bool, hours: &dyn Fn(&Entry) -> f64| tenth(entries.iter().filter(|e| which(e)).map(hours).sum());
    let all = |_: &&Entry| true;
    let hours = |key, rule, label, have, need| Item { key, rule, label, have, need, unit: "h" };
    let count = |key, rule, label, have, need, unit| Item { key, rule, label, have, need, unit };
    let any = |f: &dyn Fn(&&Entry) -> bool| if entries.iter().any(|e| f(&e)) { 1.0 } else { 0.0 };
    vec![
        hours("total", "61.109(a)", "Flight time", sum(&all, &|e| e.total), 40.0),
        hours("dual", "61.109(a)", "Flight training from an instructor", sum(&all, &|e| e.dual), 20.0),
        hours("dualCrossCountry", "61.109(a)(1)", "Cross-country flight training", sum(&dual, &|e| e.dual.min(e.cross_country)), 3.0),
        hours("dualNight", "61.109(a)(2)", "Night flight training", sum(&dual, &|e| e.dual.min(e.night)), 3.0),
        count(
            "nightCrossCountry",
            "61.109(a)(2)(i)",
            "A night cross-country of over 100 nm total distance",
            any(&|e| dual(e) && e.night > 0.0 && e.distance_nm > 100.0),
            1.0,
            "flights",
        ),
        count(
            "nightLandings",
            "61.109(a)(2)(ii)",
            "Night takeoffs and landings to a full stop, in the pattern",
            entries.iter().filter(dual).map(|e| e.night_landings).sum(),
            10.0,
            "landings",
        ),
        hours("instrument", "61.109(a)(3)", "Flight training by reference to instruments", sum(&all, &|e| e.instrument), 3.0),
        hours(
            "checkridePrep",
            "61.109(a)(4)",
            "Training for the practical test in the preceding 2 calendar months",
            sum(&|e| dual(e) && e.day >= two_months, &|e| e.dual),
            3.0,
        ),
        hours("solo", "61.109(a)(5)", "Solo flight time", sum(&all, &|e| e.solo), 10.0),
        hours("soloCrossCountry", "61.109(a)(5)(i)", "Solo cross-country", sum(&solo, &|e| e.solo.min(e.cross_country)), 5.0),
        count(
            "longSoloCrossCountry",
            "61.109(a)(5)(ii)",
            "A solo cross-country of 150 nm, full-stop landings at three points, one leg over 50 nm",
            any(&|e| solo(e) && e.distance_nm >= 150.0 && e.longest_leg_nm > CROSS_COUNTRY_NM && e.landings() >= 3.0),
            1.0,
            "flights",
        ),
        count(
            "toweredLandings",
            "61.109(a)(5)(iii)",
            "Solo full-stop landings at a towered airport",
            entries.iter().filter(solo).map(|e| e.towered).sum(),
            3.0,
            "landings",
        ),
    ]
}

/// `experience` as JSON, the gateway's ExperienceItemDto each: `[{"key",
/// "rule", "label", "have", "need", "unit", "met"}]`.
pub fn experience_json(name: &str, entries: &[Entry], today: &str) -> Result<String, String> {
    let items = experience(entries, day(name, today)?);
    let mut out = String::from("[");
    for (i, item) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"key\":");
        json::string(&mut out, item.key);
        out.push_str(",\"rule\":");
        json::string(&mut out, item.rule);
        out.push_str(",\"label\":");
        json::string(&mut out, item.label);
        out.push_str(",\"have\":");
        json::number(&mut out, item.have);
        out.push_str(",\"need\":");
        json::number(&mut out, item.need);
        out.push_str(",\"unit\":");
        json::string(&mut out, item.unit);
        out.push_str(&format!(",\"met\":{}}}", item.have >= item.need));
    }
    out.push(']');
    Ok(out)
}
