//! Where a flight too long for its tanks can land for fuel, as an
//! electric car's planner offers its chargers on the way (was the
//! planner's wingtip.fuelstops): the fields that sell the airplane's fuel
//! near the course, the one that makes the trip quickest put in for the
//! pilot, and others to choose from (`fuel_stops`); and the public fields
//! along a route for the map's Stops (`fields_along`).
//!
//! A flight reaches a field when the fuel to it -- the start, taxi and
//! takeoff allowance and the course's own burn per mile -- leaves at least
//! the reserve the flight is held to: 30 minutes by day and 45 at night
//! under VFR (14 CFR 91.151(a)), 45 under IFR (91.167(a)(3)), which the
//! planner's nav log works out and sends. The burn and the minutes per
//! mile are the flight's own, from its legs as planned, so a field off
//! the line costs what its extra miles cost there. The plan made with the
//! stop put in is the real check: this only chooses where.

use super::ask::Reader;
use super::stops::MIN_RUNWAY_FT;
use super::words::r1;
use crate::geo;
use crate::json::{self, Value};
use wingtip_core::{grid::Point, sort::StableSort};

/// How far off the straight line a stop may take the flight, the miles it
/// adds: beyond that, a field nearer the line is always the better stop.
pub const MAX_ADDED_NM: f64 = 30.0;
/// Stops put in for one flight at most: eight, half the planner's own
/// most for a route (app.router_basics.MAX_STOPS), so a long trip is
/// planned whole at once (the owner's "After it added 3 stops, it asked
/// for another fuel stop").
pub const MAX_STOPS: usize = 8;
/// Fields offered beside the one put in.
pub const CHOICES: usize = 4;
/// The minutes that count as the same trip when choosing between fields:
/// a few minutes are not worth landing with less fuel.
pub const SAME_MINUTES: f64 = 5.0;
/// The most fields listed along a route: the nearest the line first, so a
/// long flight's list stays one a pilot reads.
pub const ALONG_MOST: usize = 40;

/// A field as the planner reads it from NASR's APT_BASE, with its longest
/// open paved runway.
#[derive(Clone)]
pub struct Field {
    pub ident: String,
    pub faa_ident: String,
    pub name: String,
    pub city: String,
    pub lat: f64,
    pub lon: f64,
    pub elevation_ft: Option<f64>,
    pub fuel_types: String,
    pub runway_ft: f64,
}

/// The fields no more than MAX_ADDED_NM off the straight line from
/// `start` to `end`, on a paved runway of MIN_RUNWAY_FT, not the route's
/// own (`skip`, by either ident), in the table's order.
fn corridor<'a>(start: Point, end: Point, fields: &'a [Field], skip: &[String]) -> Vec<&'a Field> {
    let direct = geo::distance_nm(start.0, start.1, end.0, end.1);
    fields
        .iter()
        .filter(|f| {
            geo::distance_nm(start.0, start.1, f.lat, f.lon) + geo::distance_nm(f.lat, f.lon, end.0, end.1) - direct <= MAX_ADDED_NM
        })
        .filter(|f| !skip.contains(&f.ident) && !skip.contains(&f.faa_ident))
        .filter(|f| f.runway_ft >= MIN_RUNWAY_FT)
        .collect()
}

pub struct Figures {
    pub fuel_per_nm: f64,
    pub min_per_nm: f64,
    pub usable_gal: f64,
    pub taxi_gal: f64,
    pub reserve_gal: f64,
    pub ground_min: f64,
}

pub struct FuelStop {
    pub field: Field,
    /// Miles from the flight's departure to it, and the miles it adds to
    /// the flight's straight line.
    pub from_nm: f64,
    pub added_nm: f64,
    /// The fuel left on landing there, gallons, and the minutes flown to
    /// it from the flight's departure.
    pub lands_with_gal: f64,
    pub minutes: f64,
}

/// The stops that take a flight from `start` to `end` with the reserve
/// left on every landing -- the tanks filled at each -- and other fields
/// the first could be: both empty where none is needed or no fields reach.
///
/// The quickest trip: the miles flown at the flight's minutes per mile
/// and `ground_min` on the ground at each stop, the least of them over
/// every chain of fields the tanks reach between (a shortest path from the
/// destination back). Among first stops within SAME_MINUTES of the
/// quickest, the one nearest the line, to the whole mile (the owner's
/// pick, 2026-10-26: Erie 0.7 nm off on Chicago to Bradley, not
/// Greenville 8.4 nm off); of those as near, the one whose landings keep
/// the most fuel, so no leg of it runs close; the others offered after.
pub fn suggest(start: Point, end: Point, fig: &Figures, fields: &[Field], skip: &[String]) -> (Vec<FuelStop>, Vec<FuelStop>) {
    let direct = geo::distance_nm(start.0, start.1, end.0, end.1);
    if fig.usable_gal - fig.taxi_gal - direct * fig.fuel_per_nm >= fig.reserve_gal {
        return (Vec::new(), Vec::new());
    }
    let nodes = corridor(start, end, fields, skip);
    if nodes.is_empty() || fig.fuel_per_nm <= 0.0 {
        return (Vec::new(), Vec::new());
    }
    let reach_nm = (fig.usable_gal - fig.taxi_gal - fig.reserve_gal) / fig.fuel_per_nm;
    // Index 0 the destination, then the fields.
    let at: Vec<Point> = std::iter::once(end).chain(nodes.iter().map(|n| (n.lat, n.lon))).collect();
    let n = at.len();
    let apart: Vec<Vec<f64>> = at.iter().map(|a| at.iter().map(|b| geo::distance_nm(a.0, a.1, b.0, b.1)).collect()).collect();
    // Minutes from each to the destination, the stops on the way counted,
    // and the next place on the quickest way there.
    let mut to_go = vec![f64::INFINITY; n];
    to_go[0] = 0.0;
    let mut then: Vec<i64> = vec![-1; n];
    let mut done = vec![false; n];
    for _ in 0..n {
        let mut here = None;
        for i in 0..n {
            if !done[i] && here.is_none_or(|h: usize| to_go[i] < to_go[h]) {
                here = Some(i);
            }
        }
        let Some(here) = here.filter(|&h| to_go[h].is_finite()) else { break };
        done[here] = true;
        for i in 0..n {
            // Landing at `here` from field i: its leg, and the stop's time
            // on the ground where `here` is a field, not the destination.
            let via = apart[i][here] * fig.min_per_nm + if here > 0 { fig.ground_min } else { 0.0 } + to_go[here];
            if apart[i][here] <= reach_nm && via < to_go[i] && !done[i] {
                to_go[i] = via;
                then[i] = here as i64;
            }
        }
    }
    let from_start: Vec<f64> = at.iter().map(|p| geo::distance_nm(start.0, start.1, p.0, p.1)).collect();
    let chain = |i: usize| -> Vec<usize> {
        let mut out = vec![i];
        while then[*out.last().unwrap()] > 0 {
            out.push(then[*out.last().unwrap()] as usize);
        }
        out
    };
    let trip = |i: usize| from_start[i] * fig.min_per_nm + fig.ground_min + to_go[i];
    let least_landing = |i: usize| {
        let c = chain(i);
        let mut legs = vec![from_start[i]];
        for (k, &a) in c.iter().enumerate() {
            legs.push(apart[a][*c.get(k + 1).unwrap_or(&0)]);
        }
        fig.usable_gal - fig.taxi_gal - legs.iter().copied().fold(f64::NEG_INFINITY, f64::max) * fig.fuel_per_nm
    };
    let first: Vec<usize> = (1..n).filter(|&i| from_start[i] <= reach_nm && to_go[i].is_finite() && chain(i).len() <= MAX_STOPS).collect();
    if first.is_empty() {
        return (Vec::new(), Vec::new());
    }
    let quickest = first.iter().map(|&i| trip(i)).fold(f64::INFINITY, f64::min);
    let off_line: Vec<f64> = at.iter().map(|p| geo::track_nm(p.0, p.1, start, end).0.abs()).collect();
    let mut ranked = first.clone();
    let key = |i: usize| (trip(i) > quickest + SAME_MINUTES, off_line[i].round_ties_even(), -least_landing(i), trip(i));
    ranked.stable_sort_by(|&a, &b| key(a).partial_cmp(&key(b)).unwrap_or(std::cmp::Ordering::Equal));
    let stop = |i: usize, prev: Option<usize>, flown_nm: f64| {
        let f = nodes[i - 1];
        let leg = match prev {
            None => from_start[i],
            Some(p) => apart[p][i],
        };
        let off = geo::distance_nm(start.0, start.1, f.lat, f.lon) + geo::distance_nm(f.lat, f.lon, end.0, end.1) - direct;
        let at_nm = flown_nm + leg;
        FuelStop {
            field: f.clone(),
            from_nm: r1(at_nm),
            added_nm: r1(off),
            lands_with_gal: r1(fig.usable_gal - fig.taxi_gal - leg * fig.fuel_per_nm),
            minutes: r1(at_nm * fig.min_per_nm),
        }
    };
    let mut stops: Vec<FuelStop> = Vec::new();
    let (mut prev, mut flown) = (None, 0.0);
    for i in chain(ranked[0]) {
        let s = stop(i, prev, flown);
        flown = s.from_nm;
        prev = Some(i);
        stops.push(s);
    }
    let choices = ranked[1..].iter().take(CHOICES).map(|&i| stop(i, None, 0.0)).collect();
    (stops, choices)
}

/// A field along a route (fields_along).
pub struct Along {
    pub field: Field,
    pub flight: usize,
    pub departure: String,
    pub from_nm: f64,
    pub added_nm: f64,
}

/// The public fields on a long enough paved runway no more than
/// MAX_ADDED_NM off each flight's straight line ((departure ident, start,
/// end) for each), at the owner's ask for the food, fuel and rest stops
/// along the route (2026-10-23, the map's Stops): each with the flight it
/// is on, its miles from that flight's departure and the miles it adds, in
/// route order. A field near two flights is listed on the first; the
/// ALONG_MOST nearest the line kept.
pub fn along(flights: &[(String, Point, Point)], skip: &[String], fields: &[Field]) -> Vec<Along> {
    let mut seen: Vec<String> = skip.to_vec();
    let mut out: Vec<Along> = Vec::new();
    for (k, (departure, start, end)) in flights.iter().enumerate() {
        let direct = geo::distance_nm(start.0, start.1, end.0, end.1);
        for f in corridor(*start, *end, fields, &seen.clone()) {
            if seen.contains(&f.ident) {
                continue;
            }
            seen.push(f.ident.clone());
            let to_it = geo::distance_nm(start.0, start.1, f.lat, f.lon);
            let then = geo::distance_nm(f.lat, f.lon, end.0, end.1);
            out.push(Along {
                field: f.clone(),
                flight: k,
                departure: departure.clone(),
                from_nm: r1(to_it),
                added_nm: r1(to_it + then - direct),
            });
        }
    }
    out.stable_sort_by(|a, b| a.added_nm.total_cmp(&b.added_nm));
    out.truncate(ALONG_MOST);
    out.stable_sort_by(|a, b| a.flight.cmp(&b.flight).then(a.from_nm.total_cmp(&b.from_nm)));
    out
}

fn field_json(out: &mut String, f: &Field) {
    out.push_str("\"ident\":");
    json::string(out, &f.ident);
    out.push_str(",\"name\":");
    json::string(out, &f.name);
    out.push_str(",\"city\":");
    json::string(out, &f.city);
    out.push_str(",\"lat\":");
    json::number(out, f.lat);
    out.push_str(",\"lon\":");
    json::number(out, f.lon);
    out.push_str(&format!(",\"runway_ft\":{}", f.runway_ft as i64));
    out.push_str(",\"elevation_ft\":");
    json::opt_number(out, f.elevation_ft);
}

fn stop_json(out: &mut String, s: &FuelStop) {
    out.push('{');
    field_json(out, &s.field);
    out.push_str(",\"fuel_types\":");
    json::string(out, &s.field.fuel_types);
    for (key, v) in [("from_nm", s.from_nm), ("added_nm", s.added_nm), ("lands_with_gal", s.lands_with_gal), ("minutes", s.minutes)] {
        out.push_str(&format!(",\"{key}\":"));
        json::number(out, v);
    }
    out.push('}');
}

fn fields_in(r: &Reader, v: &Value) -> Result<Vec<Field>, String> {
    r.opt_list(v, "fields")?
        .unwrap_or(&[])
        .iter()
        .map(|f| {
            let ident = r.text(f, "ident")?;
            Ok(Field {
                faa_ident: match r.text(f, "faa_ident")? {
                    s if s.is_empty() => ident.clone(),
                    s => s,
                },
                ident,
                name: r.text(f, "name")?,
                city: r.text(f, "city")?,
                lat: r.num(f, "lat")?,
                lon: r.num(f, "lon")?,
                elevation_ft: r.opt_num(f, "elevation_ft")?,
                fuel_types: r.text(f, "fuel_types")?,
                runway_ft: r.opt_num(f, "runway_ft")?.unwrap_or(0.0),
            })
        })
        .collect()
}

pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let r = Reader { name };
    let fields = fields_in(&r, v)?;
    let skip = r.strings(v, "skip")?;
    let point =
        |w: &Value, key: &str| -> Result<Point, String> { r.point(w.get(key).ok_or_else(|| format!("{name}: \"{key}\" is missing"))?) };
    if name == "fields_along" {
        let flights = r
            .opt_list(v, "flights")?
            .unwrap_or(&[])
            .iter()
            .map(|f| Ok((r.text(f, "departure")?, point(f, "start")?, point(f, "end")?)))
            .collect::<Result<Vec<_>, String>>()?;
        let mut out = String::from("[");
        for (i, a) in along(&flights, &skip, &fields).iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            out.push('{');
            field_json(&mut out, &a.field);
            out.push_str(&format!(",\"flight\":{},\"departure\":", a.flight));
            json::string(&mut out, &a.departure);
            out.push_str(",\"from_nm\":");
            json::number(&mut out, a.from_nm);
            out.push_str(",\"added_nm\":");
            json::number(&mut out, a.added_nm);
            let types: Vec<String> = a.field.fuel_types.split(',').map(str::trim).filter(|t| !t.is_empty()).map(str::to_owned).collect();
            out.push_str(",\"fuel_types\":[");
            for (j, t) in types.iter().enumerate() {
                if j > 0 {
                    out.push(',');
                }
                json::string(&mut out, t);
            }
            out.push_str("]}");
        }
        out.push(']');
        return Ok(out);
    }
    let fig = Figures {
        fuel_per_nm: r.num(v, "fuel_per_nm")?,
        min_per_nm: r.num(v, "min_per_nm")?,
        usable_gal: r.num(v, "usable_gal")?,
        taxi_gal: r.num(v, "taxi_gal")?,
        reserve_gal: r.num(v, "reserve_gal")?,
        // The owner's 30-minute turnaround (2026-10-20), the flight crate's.
        ground_min: r.opt_num(v, "ground_min")?.unwrap_or(wingtip_flight::flight::TURNAROUND_MIN),
    };
    let (stops, choices) = suggest(point(v, "start")?, point(v, "end")?, &fig, &fields, &skip);
    let mut out = String::from("{\"stops\":[");
    for (i, s) in stops.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        stop_json(&mut out, s);
    }
    out.push_str("],\"choices\":[");
    for (i, s) in choices.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        stop_json(&mut out, s);
    }
    out.push_str("]}");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    // On the equator a degree of longitude is about 60 nm, so the fields
    // are where their longitudes say along a course due east from 0,0;
    // 10 gal/h at 100 kt, a tenth of a gallon and 0.6 min a mile.
    const START: Point = (0.0, 0.0);
    const END: Point = (0.0, 10.0);
    const FIG: Figures = Figures { fuel_per_nm: 0.1, min_per_nm: 0.6, usable_gal: 40.0, taxi_gal: 1.0, reserve_gal: 5.0, ground_min: 30.0 };

    fn fields(rows: &[(&str, f64, f64)]) -> Vec<Field> {
        rows.iter()
            .map(|&(ident, lat, lon)| Field {
                ident: ident.into(),
                faa_ident: ident.into(),
                name: format!("{ident} FIELD"),
                city: "SOMEWHERE".into(),
                lat,
                lon,
                elevation_ft: Some(500.0),
                fuel_types: "100LL".into(),
                runway_ft: if ident == "SHORT" { 1800.0 } else { 5000.0 },
            })
            .collect()
    }

    fn idents(stops: &[FuelStop]) -> Vec<&str> {
        stops.iter().map(|s| s.field.ident.as_str()).collect()
    }

    #[test]
    fn no_stop_where_the_tanks_hold_the_flight() {
        let (s, c) = suggest(START, (0.0, 3.0), &FIG, &fields(&[("MID", 0.0, 1.5)]), &[]);
        assert!(s.is_empty() && c.is_empty());
    }

    #[test]
    fn one_stop_on_the_line_before_one_off_it() {
        let (s, c) = suggest(START, END, &FIG, &fields(&[("ONLINE", 0.0, 5.0), ("OFFLINE", 0.3, 5.0)]), &[]);
        assert_eq!(idents(&s), vec!["ONLINE"]);
        assert_eq!(idents(&c), vec!["OFFLINE"]);
        assert!(s[0].added_nm.abs() <= 0.1);
        // 300 nm at 0.1 gal a mile and the taxi allowance from 40 gal.
        assert!((s[0].lands_with_gal - 9.0).abs() <= 0.3);
    }

    #[test]
    fn of_two_as_quick_the_nearer_the_line_then_the_one_with_more_fuel() {
        let (s, _) = suggest(START, END, &FIG, &fields(&[("EARLY", 0.0, 4.5), ("MIDDLE", 0.0, 5.0)]), &[]);
        assert_eq!(idents(&s), vec!["MIDDLE"]);
        let (s, c) = suggest(START, END, &FIG, &fields(&[("EARLY", 0.0, 4.5), ("MIDDLE", 0.07, 5.0)]), &[]);
        assert_eq!(idents(&s), vec!["EARLY"]);
        assert_eq!(idents(&c), vec!["MIDDLE"]);
    }

    #[test]
    fn every_landing_keeps_the_reserve_and_a_long_trip_gets_every_stop() {
        // The tanks reach 340 nm (40 - 1 - 5 gal at 0.1 a mile).
        assert!(suggest(START, END, &FIG, &fields(&[("FAR", 0.0, 6.0)]), &[]).0.is_empty());
        let (s, _) = suggest(START, (0.0, 15.0), &FIG, &fields(&[("A", 0.0, 5.0), ("B", 0.0, 10.0)]), &[]);
        assert_eq!(idents(&s), vec!["A", "B"]);
        assert!((s[1].from_nm - 600.0).abs() <= 2.0);
        assert!(s.iter().all(|x| x.lands_with_gal >= FIG.reserve_gal));
        let four: Vec<(String, f64, f64)> = (1..5).map(|k| (format!("S{k}"), 0.0, 5.0 * k as f64)).collect();
        let rows: Vec<(&str, f64, f64)> = four.iter().map(|(i, a, b)| (i.as_str(), *a, *b)).collect();
        let (s, _) = suggest(START, (0.0, 25.0), &FIG, &fields(&rows), &[]);
        assert_eq!(idents(&s), vec!["S1", "S2", "S3", "S4"]);
    }

    #[test]
    fn a_short_runway_and_the_routes_own_fields_are_never_offered() {
        let (s, c) = suggest(START, END, &FIG, &fields(&[("SHORT", 0.0, 5.0), ("MINE", 0.0, 4.5), ("OK", 0.0, 5.5)]), &["MINE".into()]);
        let all: Vec<&str> = idents(&s).into_iter().chain(idents(&c)).collect();
        assert_eq!(all, vec!["OK"]);
    }

    #[test]
    fn the_fields_along_each_flight_in_route_order() {
        let flights = vec![("A".to_owned(), START, (0.0, 5.0)), ("MID".to_owned(), (0.0, 5.0), END)];
        let found = along(
            &flights,
            &["A".into(), "MID".into(), "B".into()],
            &fields(&[
                ("LATE", 0.0, 4.0),
                ("EARLY", 0.0, 1.0),
                ("SECOND", 0.1, 7.0),
                ("OFF", 3.0, 2.0),
                ("MID", 0.0, 5.0),
                ("SHORT", 0.0, 3.0),
            ]),
        );
        let got: Vec<(&str, usize, &str)> = found.iter().map(|a| (a.field.ident.as_str(), a.flight, a.departure.as_str())).collect();
        assert_eq!(got, vec![("EARLY", 0, "A"), ("LATE", 0, "A"), ("SECOND", 1, "MID")]);
        assert!((found[0].from_nm - 60.0).abs() <= 1.0);
    }
}
