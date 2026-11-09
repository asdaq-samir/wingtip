//! The draft entry: the gateway's LogbookEntry columns (as the
//! logbook's form sends them), what the track showed beside them, and a
//! reason for each figure in words with its source.

use super::{ground, trip};
use super::holds::{self, Hold};
use super::Field;



use wingtip_core::time::civil_from_days;
use wingtip_flight::sun::{is_night, passenger_night};
use wingtip_procedures::figures::debrief::Point;
use wingtip_route::approach::debrief::{find_approaches, Outcome};
use wingtip_route::approach::Drawing;

/// What the host gives besides the track.
pub struct Ask {
    pub fields: Vec<Field>,
    pub drawings: Vec<Drawing>,
    pub aircraft: Option<String>,
    pub aircraft_type: Option<String>,
    /// The pilot's clock against UTC, minutes (the date is the local one:
    /// 1.1's night is "converted to local time", and a logbook's day is
    /// the pilot's).
    pub utc_offset_min: f64,
    /// The approach the pilot picked for the flight (its CIFP id): of
    /// finals the track fitted as well (an ILS and an RNAV to one runway),
    /// the one logged.
    pub picked: Option<String>,
}

/// A takeoff or landing as the draft gives it.
#[derive(Clone, Debug, PartialEq)]
pub struct Event {
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
    pub field: Option<String>,
    pub towered: bool,
    /// For a landing: "full_stop" or "touch_and_go"; a takeoff's is "".
    pub kind: &'static str,
    /// 1.1's night, and 61.57(b)'s period (1 hour after sunset to 1 hour
    /// before sunrise), there and then.
    pub night: bool,
    pub passenger_night: bool,
    /// Counted for 61.57(b): to a full stop in its period.
    pub counts_night: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Approach {
    pub airport: String,
    pub id: String,
    pub name: String,
    pub faf_at: f64,
    pub outcome: Outcome,
    pub also_fits: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Reason {
    pub item: &'static str,
    pub says: String,
    pub source: &'static str,
}

/// The gateway's LogbookEntry columns the track fills.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Entry {
    pub flown_on: String,
    pub aircraft: Option<String>,
    pub aircraft_type: Option<String>,
    pub route: String,
    pub total_hours: f64,
    pub air_hours: f64,
    pub night_hours: f64,
    pub cross_country_hours: f64,
    pub day_landings: i64,
    pub night_landings: i64,
    /// Of the day landings, the touch-and-goes.
    pub touch_and_goes: i64,
    pub towered_landings: i64,
    pub distance_nm: f64,
    pub longest_leg_nm: f64,
    pub remarks: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Draft {
    pub entry: Entry,
    /// 61.57(c)(1)'s items, for the pilot to add to the entry where the
    /// flight was flown by instruments (61.51(g)(1)).
    pub approaches: Vec<Approach>,
    pub holds: Vec<Hold>,
    pub holds_at: Vec<(f64, f64)>,
    pub tracking: bool,
    pub takeoffs: Vec<Event>,
    pub landings: Vec<Event>,
    pub block_from: Option<f64>,
    pub block_to: Option<f64>,
    pub landed_elsewhere: bool,
    pub over_50_nm: bool,
    pub farthest_nm: f64,
    pub ends_airborne: bool,
    pub reasons: Vec<Reason>,
}

/// A figure to the tenth of an hour, as a logbook and a Hobbs keep it.
fn tenth(h: f64) -> f64 {
    (h * 10.0).round() / 10.0
}

/// "23:25Z".
fn zulu(t_ms: f64) -> String {
    let s = (t_ms / 1000.0).rem_euclid(86_400.0) as i64;
    format!("{:02}:{:02}Z", s / 3600, s % 3600 / 60)
}

/// The day an instant is on at an offset from UTC, "YYYY-MM-DD".
fn local_day(t_ms: f64, offset_min: f64) -> String {
    let days = ((t_ms + offset_min * 60_000.0) / 86_400_000.0).floor() as i64;
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

fn hours(points: &[Point], from: usize, to: usize) -> f64 {
    (points[to].t - points[from].t) / 3_600_000.0
}

/// The hours of the spans in 1.1's night, judged at each step's middle.
fn night_hours(points: &[Point], spans: &[(usize, usize)]) -> f64 {
    let mut ms = 0.0;
    for &(a, b) in spans {
        for i in a..b {
            let (p, q) = (&points[i], &points[i + 1]);
            if is_night((p.lat + q.lat) / 2.0, (p.lon + q.lon) / 2.0, (p.t + q.t) / 2000.0) {
                ms += q.t - p.t;
            }
        }
    }
    ms / 3_600_000.0
}

/// The track drawn into a draft entry. `points` in time order.
pub fn draft(points: &[Point], ask: &Ask) -> Draft {
    let fields = &ask.fields;
    let g = ground::read(points, fields);
    let mut reasons = Vec::new();
    let event = |i: usize, field: Option<usize>, kind: &'static str| {
        let p = &points[i];
        let (night, pn) = (is_night(p.lat, p.lon, p.t / 1000.0), passenger_night(p.lat, p.lon, p.t / 1000.0));
        Event {
            t: p.t,
            lat: p.lat,
            lon: p.lon,
            field: field.map(|f| fields[f].ident.clone()),
            towered: field.is_some_and(|f| fields[f].towered),
            kind,
            night,
            passenger_night: pn,
            counts_night: kind == "full_stop" && pn,
        }
    };
    let takeoffs: Vec<Event> = g.takeoffs.iter().map(|t| event(t.i, t.field, "")).collect();
    let landings: Vec<Event> = g.landings.iter().map(|l| event(l.i, l.field, l.kind.key())).collect();

    // Flight time (1.1), air time, night (1.1).
    let total: f64 = g.spans.iter().map(|&(a, b)| hours(points, a, b)).sum();
    let air: f64 = g.runs.iter().map(|&(a, b)| hours(points, a, b)).sum();
    let night = night_hours(points, &g.spans).min(total);
    let block_from = g.spans.first().map(|s| points[s.0].t);
    let block_to = g.spans.last().map(|s| points[s.1].t);
    if let (Some(from), Some(to)) = (block_from, block_to) {
        reasons.push(Reason {
            item: "totalHours",
            says: format!(
                "{:.1} h from moving off ({}) to coming to rest after the last landing ({}), the time at rest between flights left out.",
                tenth(total), zulu(from), zulu(to)
            ),
            source: "14 CFR 1.1, flight time; 61.51(b)(1)(ii)",
        });
        reasons.push(Reason { item: "airHours", says: format!("{:.1} h from the first takeoff roll to the last landing roll.", tenth(air)), source: "The track's ground speed over 40 kt" });
        reasons.push(Reason {
            item: "nightHours",
            says: format!("{:.1} h of it between the end of evening and the start of morning civil twilight where the airplane was.", tenth(night)),
            source: "14 CFR 1.1, night; 61.51(b)(3)(i)",
        });
    }
    if g.ends_airborne {
        reasons.push(Reason { item: "landings", says: "The track ends in the air: its last landing is not in it.".to_owned(), source: "The track" });
    }

    // Landings: 61.57(a) counts every one, (b) full stops in its period.
    let night_landings = landings.iter().filter(|l| l.counts_night).count() as i64;
    let day_landings = landings.len() as i64 - night_landings;
    let touch_and_goes = landings.iter().filter(|l| l.kind == "touch_and_go").count() as i64;
    for l in &landings {
        let at = l.field.clone().unwrap_or_else(|| "no field".to_owned());
        let how = if l.kind == "full_stop" { "to a full stop" } else { "a touch-and-go" };
        let when = match (l.night, l.passenger_night) {
            (_, true) if l.kind == "full_stop" => "in 61.57(b)'s night, from 1 hour after sunset: counts for night passengers",
            (_, true) => "in 61.57(b)'s night, but (b) counts only full stops: counted for 61.57(a)",
            (true, false) => "at night (1.1) but before 1 hour after sunset: counted for 61.57(a), not (b)",
            (false, false) => "by day: counted for 61.57(a)",
        };
        reasons.push(Reason { item: "landing", says: format!("{at} {}, {how}, {when}.", zulu(l.t)), source: "14 CFR 61.57(a)(1), (b)(1)" });
    }

    // Towered full stops (61.109(a)(5)(iii)).
    let towered = landings.iter().filter(|l| l.towered && l.kind == "full_stop").count() as i64;
    if towered > 0 {
        reasons.push(Reason {
            item: "toweredLandings",
            says: format!("{towered} to a full stop at a field with a control tower; 61.109(a)(5)(iii) wants it operating then, which the app cannot tell."),
            source: "14 CFR 61.109(a)(5)(iii); NASR APT_BASE TWR_TYPE_CODE",
        });
    }

    // The trip and whether it was cross-country (61.1(b)), logged by
    // (ii): more than 50 nm from the original point of departure.
    let t = trip::trip(points, &g, fields);
    let (distance, longest, landed_elsewhere, farthest, over_50) = (t.distance_nm, t.longest_leg_nm, t.landed_elsewhere, t.farthest_nm, t.over_50_nm);
    let route = t.route;
    let legs_flown = distance > 0.0;
    let cross_country = if over_50 { total } else { 0.0 };
    reasons.push(Reason {
        item: "crossCountryHours",
        says: if over_50 {
            format!("Landed {farthest:.0} nm in a straight line from the departure, more than 50: cross-country for the private, commercial, instrument and ATP experience.")
        } else if landed_elsewhere {
            format!("Landed elsewhere, {farthest:.0} nm from the departure at most: cross-country in 61.1(b)'s general sense, not the more-than-50-nm one the ratings' experience counts, so none logged.")
        } else {
            "No landing away from the departure: not cross-country.".to_owned()
        },
        source: "14 CFR 61.1(b), cross-country time (i), (ii), (vi)",
    });
    if legs_flown {
        reasons.push(Reason {
            item: "distanceNm",
            says: format!("{distance:.0} nm in straight lines between the fields, the longest {longest:.0} nm."),
            source: "14 CFR 61.109(a)(5)(ii)",
        });
    }

    // Instrument: the approaches, matched to the procedures given, and
    // the holds; logged only where flown by instruments.
    let approaches: Vec<Approach> = find_approaches(&ask.drawings, points, ask.picked.as_deref(), None)
        .into_iter()
        .map(|d| Approach { airport: d.airport, id: d.id, name: d.name, faf_at: d.faf_at, outcome: d.outcome, also_fits: d.also_fits })
        .collect();
    let hold_fixes: Vec<(String, f64, f64)> = ask
        .drawings
        .iter()
        .flat_map(|d| d.fixes.iter().filter(|f| f.has("hold")).map(|f| (f.ident.clone(), f.lat, f.lon)))
        .collect();
    let held = holds::holds(points, &g.runs, fields, &hold_fixes);
    for a in &approaches {
        let also = if a.also_fits.is_empty() { String::new() } else { format!(" (the track fits {} as well)", a.also_fits.join(", ")) };
        reasons.push(Reason {
            item: "approaches",
            says: format!(
                "{} at {}{also}: down its final from the final approach fix at {}, then {}. It counts toward 61.57(c) only if flown by reference to instruments, in actual or simulated conditions.",
                a.name, a.airport, zulu(a.faf_at), if a.outcome == Outcome::Landed { "landed" } else if a.outcome == Outcome::Missed { "the missed approach" } else { "the track ends" }
            ),
            source: "14 CFR 61.57(c)(1)(i); 61.51(g)(1), (3); FAA CIFP",
        });
    }
    for h in &held {
        let at = h.fix.clone().map_or_else(|| format!("{:.2}/{:.2}", h.lat, h.lon), |f| format!("at {f}"));
        reasons.push(Reason {
            item: "holding",
            says: format!("A hold {at}, {} racetrack{} from {}, clear of the fields' patterns; it counts toward 61.57(c) only if flown by instruments.",
                (h.turns / 2).max(1), if h.turns / 2 > 1 { "s" } else { "" }, zulu(points[h.from].t)),
            source: "14 CFR 61.57(c)(1)(ii); AIM 5-3-8",
        });
    }
    let tracking = !approaches.is_empty() || !held.is_empty();
    if tracking {
        reasons.push(Reason {
            item: "tracking",
            says: "An approach's final course or a hold's inbound course was flown; the track cannot show it was on the navigation system's needle.".to_owned(),
            source: "14 CFR 61.57(c)(1)(iii)",
        });
    }

    // Remarks: the place and type of each approach (61.51(g)(3)) and the hold.
    let mut remarks = String::from("Logged from the app's track.");
    if !approaches.is_empty() {
        // Each kind once, with how many: "ILS RWY 27 KDLH x2".
        let mut names: Vec<(String, usize)> = Vec::new();
        for a in &approaches {
            let name = format!("{} {}", a.name, a.airport);
            match names.iter_mut().find(|(n, _)| *n == name) {
                Some((_, k)) => *k += 1,
                None => names.push((name, 1)),
            }
        }
        let names: Vec<String> = names.into_iter().map(|(n, k)| if k > 1 { format!("{n} x{k}") } else { n }).collect();
        remarks.push_str(&format!(" Approaches: {}.", names.join("; ")));
    }
    for h in &held {
        remarks.push_str(&h.fix.as_ref().map_or_else(|| " Hold.".to_owned(), |f| format!(" Hold at {f}.")));
    }
    remarks.truncate(500);

    let flown_on = block_from.or_else(|| points.first().map(|p| p.t)).map(|t| local_day(t, ask.utc_offset_min)).unwrap_or_default();
    reasons.push(Reason { item: "flownOn", says: format!("{flown_on}, the day on the pilot's clock (UTC{:+}) the airplane moved off.", ask.utc_offset_min / 60.0), source: "14 CFR 61.51(b)(1)(i)" });

    let entry = Entry {
        flown_on,
        aircraft: ask.aircraft.clone(),
        aircraft_type: ask.aircraft_type.clone(),
        route,
        total_hours: tenth(total),
        air_hours: tenth(air),
        night_hours: tenth(night).min(tenth(total)),
        cross_country_hours: tenth(cross_country),
        day_landings,
        night_landings,
        touch_and_goes,
        towered_landings: towered,
        distance_nm: distance.round(),
        longest_leg_nm: longest.round(),
        remarks,
    };
    let holds_at = held.iter().map(|h| (points[h.from].t, points[h.to].t)).collect();
    Draft {
        entry,
        approaches,
        holds: held,
        holds_at,
        tracking,
        takeoffs,
        landings,
        block_from,
        block_to,
        landed_elsewhere,
        over_50_nm: over_50,
        farthest_nm: farthest,
        ends_airborne: g.ends_airborne,
        reasons,
    }
}
