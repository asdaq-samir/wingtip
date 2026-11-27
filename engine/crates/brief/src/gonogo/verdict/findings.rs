use super::*;

/// The reserve as the planner set it: 30 minutes by day, 45 at night
/// (14 CFR 91.151) or under IFR (91.167). Unsaid where it did not send
/// one, rather than a guess at 30, which is short at night.
pub(super) fn reserve_words(minutes: Option<f64>) -> String {
    minutes.map_or_else(|| "reserve".to_owned(), |m| format!("{} min reserve", js_num(m)))
}

pub(super) fn plural(n: f64) -> &'static str {
    if n == 1.0 {
        ""
    } else {
        "s"
    }
}

/// What a section not sent says: nothing was checked.
pub(super) fn not_sent() -> (&'static str, String) {
    ("unknown", "Not worked out".into())
}

pub(super) fn weather(w: &Weather) -> (&'static str, String) {
    if w.missing && !w.pending && !said(&w.failed) {
        not_sent()
    } else if said(&w.failed) {
        ("unknown", format!("Not fetched: {}", w.failed.as_deref().unwrap_or_default()))
    } else if w.pending {
        ("pending", "Fetching METARs, TAFs and hazards…".into())
    } else if let Some(first) = w.vfr_not_recommended.first() {
        ("stop", format!("VFR not recommended: {first}"))
    } else if let Some(first) = w.under_minimums.first() {
        ("stop", format!("Under your minimums: {first}"))
    } else if let Some(first) = w.terminal_alerts.first() {
        // A caution, not a stop: an alert lasts while the cell does,
        // minutes (ITWS's products expire three minutes on), so it says
        // what is there now and the pilot asks again nearer the time. Its
        // source is said, as the alert is the tower's system's, not a forecast.
        ("caution", format!("{first} (FAA ITWS, now)"))
    } else if let (true, Some(first)) = (w.ifr, w.flow_programs.first()) {
        ("caution", format!("{first} (FAA Command Center)"))
    } else if said(&w.icing) {
        ("caution", w.icing.clone().unwrap_or_default())
    } else if !w.hazards.is_empty() {
        ("caution", format!("{} along the route", w.hazards.join(", ")))
    } else if !w.unchecked.is_empty() {
        ("caution", format!("Not checked: {}", w.unchecked.join(", ")))
    } else if said(&w.worst) {
        ("ok", format!("No hazards; at worst {}", w.worst.as_deref().unwrap_or_default()))
    } else {
        ("ok", "No hazards along the route".into())
    }
}

pub(super) fn airspace(a: &Airspace) -> (&'static str, String) {
    // An area SFDPS says is active now ("active-now") or cold now
    // ("cold-now") is said so, its status the FAA's own and newer than
    // the chart's times of use; one active now comes before one only
    // scheduled.
    let live = a.special_use.iter().find(|(_, when)| when == "active-now");
    let active = a.special_use.iter().find(|(_, when)| when == "active");
    let maybe = a.special_use.iter().find(|(_, when)| when == "by-notam" || when == "unknown");
    if a.pending {
        ("pending", "Checking TFRs along the route…".into())
    } else if a.missing {
        not_sent()
    } else if let Some(first) = a.in_force.first() {
        ("stop", format!("TFR {first} in force when you get there"))
    } else if a.unchecked {
        ("caution", "Not checked: see tfr.faa.gov".into())
    } else if let Some((name, _)) = live {
        ("caution", format!("{name} active now (FAA SFDPS)"))
    } else if let Some((name, _)) = active {
        ("caution", format!("{name} scheduled in use when you pass"))
    } else if let Some((name, _)) = maybe {
        ("caution", format!("{name} may be active"))
    } else if a.near != 0.0 || !a.special_use.is_empty() {
        let mut parts = Vec::new();
        if a.near != 0.0 {
            parts.push(format!("{} TFR{} near, none in force on the route", js_num(a.near), plural(a.near)));
        }
        let cold = a.special_use.iter().filter(|(_, when)| when == "cold-now").count() as f64;
        let areas = a.special_use.len() as f64 - cold;
        if areas > 0.0 {
            parts.push(format!("{} special-use area{} not scheduled then", js_num(areas), plural(areas)));
        }
        if cold > 0.0 {
            parts.push(format!("{} special-use area{} cold now (FAA SFDPS)", js_num(cold), plural(cold)));
        }
        ("ok", parts.join("; "))
    } else {
        ("ok", "None on the route".into())
    }
}

pub(super) fn altitude(a: &Altitude) -> (&'static str, String) {
    if said(&a.problem) {
        ("stop", a.problem.clone().unwrap_or_default())
    } else if a.pending {
        ("pending", "Planning altitudes…".into())
    } else if a.missing {
        not_sent()
    } else if let Some(first) = a.cautions.first() {
        ("caution", first.clone())
    } else {
        // `flown ?? "Planned"`: an empty line stays empty.
        ("ok", a.flown.clone().unwrap_or_else(|| "Planned".into()))
    }
}

pub(super) fn fuel(f: &Fuel) -> (&'static str, String) {
    if f.pending {
        return ("pending", "Working out the fuel…".into());
    }
    match f.margin_gal {
        Some(margin) if margin < 0.0 => {
            let rule = if f.ifr { "91.167" } else { "91.151" };
            ("stop", format!("{} gal short of the fuel and its {} (14 CFR {rule})", js_num(one(-margin)), reserve_words(f.reserve_min)))
        }
        None => (
            "unknown",
            match f.required_gal {
                Some(required) => format!("{} gal needed; the tanks' usable fuel not known", js_num(one(required))),
                None => "Not worked out".into(),
            },
        ),
        // What is left over is said as beyond the reserve, not "spare":
        // the reserve is itself fuel that may not be planned away (14 CFR
        // 91.151(a) for VFR, 91.167(a)(3) for IFR), so only the rest is
        // the pilot's to spend.
        Some(margin) => (
            "ok",
            format!(
                "Needs {} gal with taxi and a {}; {} gal beyond reserve",
                js_num(one(f.required_gal.unwrap_or(0.0))),
                reserve_words(f.reserve_min),
                js_num(one(margin))
            ),
        ),
    }
}

pub(super) fn runways(r: &Runways) -> (&'static str, String) {
    if !r.worked {
        ("unknown", "Not worked out for this airplane".into())
    } else if r.pending {
        ("pending", "Waiting on the runways and the weather…".into())
    } else if r.missing {
        not_sent()
    } else if !r.short.is_empty() {
        ("stop", format!("Too short at {}", r.short.join(", ")))
    } else if [&r.crosswind, &r.tailwind, &r.close, &r.beyond, &r.standard_day].iter().any(|l| !l.is_empty()) {
        // Past the POH's table the distance is its edge's, not the
        // airplane's (FAA-H-8083-25C, chapter 11: performance charts hold
        // only within their stated conditions), so "within" is not known:
        // a caution naming the field, beside any crosswind's.
        let mut parts = Vec::new();
        if !r.crosswind.is_empty() {
            parts.push(format!("Crosswind past the POH's demonstrated at {}", r.crosswind.join(", ")));
        }
        // The wind behind the end (AIM 4-3-6c: tailwind considerations
        // come first) and SAFO 19001's 15 per cent margin not met: the
        // cautions FPL's runway chips ring (runway::fit).
        if !r.tailwind.is_empty() {
            parts.push(format!("Tailwind at {}", r.tailwind.join(", ")));
        }
        if !r.close.is_empty() {
            parts.push(format!("Less than 15% to spare at {}", r.close.join(", ")));
        }
        if !r.beyond.is_empty() {
            parts.push(format!("Past the POH's tables at {}: its distances will be longer", r.beyond.join(", ")));
        }
        // No temperature reported: the distances are a standard day's
        // (field_air), which on a hot day are short of what the airplane
        // needs (FAA-H-8083-25C ch. 11, density altitude), so "within" is
        // not known for the day (14 CFR 91.103(b)).
        if !r.standard_day.is_empty() {
            parts.push(format!("No temperature reported at {}: distances assume a standard day", r.standard_day.join(", ")));
        }
        ("caution", parts.join("; "))
    } else if !r.unchecked.is_empty() {
        // A runway whose length, or a field whose elevation, is not known
        // cannot be held to the distance needed (14 CFR 91.103(b)): not
        // known, never "within".
        ("unknown", format!("Not checked at {}: runway length or field elevation not known", r.unchecked.join(", ")))
    } else {
        ("ok", "Takeoff and landing within each runway".into())
    }
}

pub(super) fn balance(b: &Balance) -> (&'static str, String) {
    if b.pending {
        ("pending", "Waiting on the airplane's profile…".into())
    } else if b.no_load {
        // The weight and balance is this flight's load against the POH's
        // limits (its section 6; 14 CFR 91.9(a) holds the pilot to them,
        // 91.103 to all the flight's information): with no load given it
        // is not known, and the POH's sample airplane is never said as
        // the flight's (the owner's "no assumed airplane").
        ("unknown", "Not worked out: give your load".into())
    } else if !b.worked {
        ("unknown", "Not worked out for this airplane".into())
    } else if let Some(first) = b.problems.first() {
        ("stop", first.clone())
    } else if said(&b.takeoff) {
        ("ok", format!("{}, within limits", b.takeoff.as_deref().unwrap_or_default()))
    } else {
        ("ok", "Within limits".into())
    }
}
