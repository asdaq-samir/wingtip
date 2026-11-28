use super::*;

pub(super) fn departure(cs: &str, fields: &[Field], legs: &[Leg], i: usize) -> Phase {
    let here = &fields[i];
    let next = &fields[i + 1];
    let first = hop_legs(legs, &here.ident, &next.ident).first();
    let field = place_name(here.name.as_deref(), &here.ident);
    let to = place_name(next.name.as_deref(), &next.ident);
    let runway = runway_words(here.takeoff.as_ref());
    let heading = first.map_or("[direction]", |l| compass_word(l.true_course_deg));
    let altitude = first.map_or_else(|| "[altitude]".to_owned(), |l| spoken_altitude(l.altitude_ft));
    let f = &here.frequencies;
    let mut calls = listen_first(f, &field);
    if let Some(tower) = of(f, &["TWR"]) {
        let atis = if of(f, &["ATIS"]).is_some() { ", with information [letter]" } else { "" };
        let class = here.airspace_class.as_deref();
        if let Some(clearance) = of(f, &["CLD"]).filter(|_| busy(class)) {
            let name = facility_name(clearance, &field);
            let mut c = call(
                format!("{name} Clearance"),
                clearance.mhz,
                format!("{name} Clearance, {cs}, VFR to {to}, {heading}bound, {altitude}{atis}."),
            );
            c.note = Some(format!(
                "Class {}: where the Chart Supplement sends VFR departures to clearance delivery first.",
                class.unwrap_or("")
            ));
            calls.push(c);
        }
        if let Some(ground) = of(f, &["GND"]) {
            let name = facility_name(ground, &field);
            calls.push(call(
                format!("{name} Ground"),
                ground.mhz,
                format!("{name} Ground, {cs}, at [where you are]{atis}, VFR to {to}, {heading}bound, ready to taxi."),
            ));
        }
        let name = facility_name(tower, &field);
        let mut c = call(
            format!("{name} Tower"),
            tower.mhz,
            format!("{name} Tower, {cs}, holding short {runway}, ready for departure, {heading}bound."),
        );
        c.note =
            Some(format!("The tower may give another runway and a way out: read back the runway and the clearance.{}", when_closed(f)));
        calls.push(c);
    } else {
        let mhz = ctaf_mhz(f);
        calls.push(ctaf_call(&field, mhz, format!("{field} traffic, {cs}, taxiing to {runway}, {field}.")));
        let mut c = ctaf_call(
            &field,
            mhz,
            format!("{field} traffic, {cs}, departing {runway}, departing the pattern to the {heading}, climbing to {altitude}, {field}."),
        );
        // How to leave the pattern (AC 90-66C 11.8), left traffic unless
        // the FAA says right (91.126(b)(1)).
        c.note = here.takeoff.as_ref().map(|e| exit_for(e.traffic.as_deref().unwrap_or("left")));
        calls.push(c);
    }
    let radar = of(f, &["DEP", "A/D", "APP"]);
    let facility = radar.map_or_else(
        || "Approach or Center".to_owned(),
        |r| {
            let what = if r.kind.as_deref().unwrap_or("").to_uppercase() == "APP" { "Approach" } else { "Departure" };
            format!("{} {what}", facility_name(r, &field))
        },
    );
    let mhz = radar.and_then(|r| r.mhz);
    let mut request = call(facility.clone(), mhz, format!("{facility}, {cs}, VFR request."));
    request.note = Some(
        if radar.is_some() {
            "Flight following, once clear of the field."
        } else {
            "Flight following, once clear: the frequency is on the sectional or in the Chart Supplement."
        }
        .to_owned(),
    );
    let mut follow = call(facility, mhz, format!("{cs}, [distance] {heading} of {field}, {altitude}, request flight following to {to}."));
    follow.note = Some("When they answer. Then squawk the code they give and read it back.".to_owned());
    calls.push(request);
    calls.push(follow);
    Phase { title: format!("Leaving {}", here.ident), ident: here.ident.clone(), kind: "departure", calls }
}

pub(super) fn arrival(cs: &str, fields: &[Field], legs: &[Leg], i: usize) -> Phase {
    let here = &fields[i];
    let prev = &fields[i - 1];
    let last = hop_legs(legs, &prev.ident, &here.ident).last();
    let field = place_name(here.name.as_deref(), &here.ident);
    let runway = runway_words(here.landing.as_ref());
    let from = last.map_or("[direction]", |l| compass_word(l.true_course_deg + 180.0));
    // About where a 3:1 descent to pattern altitude has the airplane ten
    // miles out, no higher than its cruise, as the nav log flies it
    // (motion::profile descent_altitude).
    let altitude = match last {
        Some(l) => {
            let ft = descent_altitude(l.altitude_ft, here.pattern_altitude_ft, 10.0);
            format!("{}{}", spoken_altitude(ft), if ft < l.altitude_ft { ", descending" } else { "" })
        }
        None => "[altitude]".to_owned(),
    };
    let f = &here.frequencies;
    let mut calls = listen_first(f, &field);
    if let Some(first) = calls.first_mut() {
        first.note = Some("About 25 miles out, before the first call.".to_owned());
    }
    let atis = if of(f, &["ATIS"]).is_some() { ", with information [letter]" } else { "" };
    if let Some(tower) = of(f, &["TWR"]) {
        let class = here.airspace_class.as_deref();
        let radar = of(f, &["APP", "A/D"]).filter(|_| busy(class));
        if let Some(radar) = radar {
            let approach = format!("{} Approach", facility_name(radar, &field));
            let cruise = last.map_or_else(|| "[altitude]".to_owned(), |l| spoken_altitude(l.altitude_ft));
            let mut c = call(
                approach.clone(),
                radar.mhz,
                format!("{approach}, {cs}, [distance] {from} of {field}, {cruise}{atis}, landing {field}."),
            );
            c.note = Some(
                if class == Some("B") {
                    "Well outside the Class B: stay out until you hear \"cleared into the Class Bravo\" (91.131)."
                } else {
                    "Before the Class C: two-way communication is the controller answering with your call sign (91.130)."
                }
                .to_owned(),
            );
            calls.push(c);
        }
        let name = facility_name(tower, &field);
        let handed = radar.is_some();
        let mut c = call(
            format!("{name} Tower"),
            tower.mhz,
            if handed {
                format!("{name} Tower, {cs}, [position], {altitude}, landing.")
            } else {
                format!("{name} Tower, {cs}, ten miles {from}, {altitude}{atis}, landing.")
            },
        );
        c.note = Some(if handed {
            "When approach hands you over.".to_owned()
        } else {
            format!(
                "Well before the Class D's boundary on the chart, each drawn to its field (AIM 3-2-5): the tower answering with your call sign is two-way communication (91.129(c)). Fly the entry it gives.{}",
                when_closed(f)
            )
        });
        calls.push(c);
        if let Some(ground) = of(f, &["GND"]) {
            let name = facility_name(ground, &field);
            let mut c = call(
                format!("{name} Ground"),
                ground.mhz,
                format!("{name} Ground, {cs}, clear of {runway} at [taxiway], taxi to [where you are going]."),
            );
            c.note = Some("Once clear of the runway, when the tower says to.".to_owned());
            calls.push(c);
        }
    } else {
        let mhz = ctaf_mhz(f);
        let side = here.landing.as_ref().and_then(|e| e.traffic.clone()).unwrap_or_else(|| "[left or right]".to_owned());
        let say = |words: String, note: Option<&str>| {
            let mut c = ctaf_call(&field, mhz, format!("{field} traffic, {cs}, {words}, {field}."));
            c.note = note.map(str::to_owned);
            c
        };
        calls.push(say(format!("ten miles {from}, {altitude}, inbound for landing"), Some("About ten miles out (AC 90-66C 10.4.1).")));
        calls.push(say(format!("entering the forty-five for {side} downwind {runway}"), None));
        calls.push(say(format!("{side} downwind {runway}"), None));
        calls.push(say(format!("{side} base {runway}"), None));
        calls.push(say(format!("final {runway}, full stop"), None));
        calls.push(say(format!("clear of {runway}"), None));
    }
    Phase { title: format!("Into {}", here.ident), ident: here.ident.clone(), kind: "arrival", calls }
}

/// The route's calls, airport by airport: leaving the departure, into and
/// out of each stop, and into the destination.
pub fn radio_script(call_sign: &str, fields: &[Field], legs: &[Leg]) -> Vec<Phase> {
    let mut phases = Vec::new();
    for i in 0..fields.len() {
        if i > 0 {
            phases.push(arrival(call_sign, fields, legs, i));
        }
        if i + 1 < fields.len() {
            phases.push(departure(call_sign, fields, legs, i));
        }
    }
    phases
}
