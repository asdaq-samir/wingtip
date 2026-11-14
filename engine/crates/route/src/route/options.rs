//! Ways to fly a route, for the pilot to pick from (was the planner's
//! wingtip.route_options): the fastest, the one in the best weather, the
//! one with the fewest stops and the one that keeps over land, each kept
//! clear of what an airplane under VFR must keep clear of, at the owner's
//! ask ("smart to reroute for fastest time along safe weather, over
//! terrain, best tailwinds, refueling and giving pilot flexibility to make
//! changes as they please", 2026-10-23).
//!
//! A grid of cells round the route (`grid`) is read once from what the
//! planner fetched (`ask`, `read`):
//!
//! - the ground: a cell closed where its highest ground with the
//!   planner's 1,000 ft (at or above 14 CFR 91.119's) and the coarse
//!   read's margin is over the highest VFR cruising altitude the airplane
//!   reaches (91.159, under its ceiling and Class A's 18,000 ft);
//! - the weather over the flight's time: a TAF's worst in the window, and
//!   a METAR for a flight leaving soon, under the pilot's minimums -- never
//!   under 91.155's basic ones -- closes the cells round its field, and one
//!   in MVFR marks them marginal;
//! - the G-AIRMETs between the fields: IFR and mountains obscured closed,
//!   low-level turbulence, icing and wind shear marginal;
//! - thunderstorms, by AIM 7-1-27's "avoid by at least 20 miles": a TAF or
//!   a METAR with TS or VCTS, and a convective SIGMET's area, close the
//!   cells within 20 nm; any other SIGMET under 18,000 ft closes its own
//!   area;
//! - prohibited areas (91.133) and the TFRs in force (91.137 to 91.145)
//!   close their cells; restricted areas, MOAs, warning and alert areas,
//!   whose times of use are not read, cost more;
//! - large water: each cell's share out of a glide's reach of dry land,
//!   dearer for the way that keeps over land;
//! - the winds aloft: the best groundspeed in each direction at the legal
//!   cruising altitudes (91.159) over the cell's ground.
//!
//! The quickest way over open cells (`ways`, in minutes) is the fastest;
//! the same with marginal cells costing more is the best weather's. Each
//! is straightened where a straight line keeps to open cells and loses no
//! more than a minute, and its turns named (`naming`). The fuel stops
//! along it (`stops`) land with the reserve (91.151) each time.
//!
//! It only suggests. A way picked is planned as any route is, its
//! altitudes, cloud clearance, airspace and fuel checked leg by leg at
//! full resolution; the coarse read here can be wrong, and the plan says
//! so where it is.
//!
//! Its frame -- where the cells and their samples are, the flight's time
//! and the cruising altitudes the winds are wanted at -- comes first
//! (`route_options_frame`), for the planner to read the ground, the shores
//! and the winds there; then the ways (`route_options`). The way round
//! high ground for a plan with no legal altitude is `terrain`'s; the fuel
//! stops a planned flight too long for its tanks needs, and the fields
//! along a route for the map's Stops, `fuel`'s; whether a leg enters
//! Class B and the fixes that take it round, `classb`'s.

mod answer;
pub mod ask;
pub mod classb;
pub mod fuel;
pub mod grid;
pub mod naming;
pub mod read;
pub mod special_use;
pub mod stops;
pub mod terrain;
pub mod ways;
pub mod words;

use self::answer::{along_json, ints, path_json, strings, way_json};
use self::ask::{Ask, Field, Reader};
use self::grid::{Grid, CELL_DEG, PER_CELL};
use self::read::{highest_cruise_ft, LEGAL_CEILING_FT, LEGAL_VISIBILITY_SM, LOWEST_CRUISE_FT, METAR_AHEAD_S};
use self::stops::{Fuel, Stop, MARGINAL_STOP_MIN, STOP_FIELD_NM, TURNAROUND_MIN};
use self::ways::{along, crossed, line_minutes, minutes_along, straightened, way, Along};
use self::words::r1;
use crate::json::{self, Value};
use crate::{geo, sort::StableSort};
use std::cell::RefCell;
use wingtip_core::grid::Point;
use wingtip_core::wmm;
use wingtip_flight::flight;

/// The kinds of way, in the order they are offered, and their titles.
pub const KINDS: [&str; 4] = ["fastest", "weather", "stops", "land"];
fn title(kind: &str) -> &'static str {
    match kind {
        "fastest" => "Fastest",
        "weather" => "Best weather",
        "stops" => "Fewest stops",
        _ => "Over land",
    }
}
/// What a marginal cell costs more, a share of its minutes, for the best
/// weather's way.
pub const MARGINAL_COST: f64 = 1.0;
/// A straight line taken over the grid's way when it is no more than this
/// many minutes slower; more, a step at a time, for a way of more than
/// MAX_TURNS turns, which a pilot would not fly.
pub const STRAIGHTEN_STEPS_MIN: [f64; 5] = [1.0, 3.0, 6.0, 12.0, 24.0];
pub const MAX_TURNS: usize = 8;
/// Where no way keeps clear of everything -- the Rockies in an airplane
/// that cannot top them, a field under a G-AIRMET -- the way that crosses
/// least of it, a closed cell costing this many times its minutes more:
/// offered with what it crosses said, the owner's rule ("I don't want to
/// put hard limits on anything. A warning tick or a label is enough",
/// 2026-10-23).
pub const CLOSED_COST: f64 = 20.0;
/// How much dearer a cell out of glide of dry land is for the way that
/// keeps over land, a share of its own minutes: eleven times as dear, so
/// it goes round Lake Michigan from Milwaukee to Muskegon (an hour and a
/// quarter more; at four times as dear it crossed the 51 nm of water),
/// and only crosses where going round is the longer by hours (the
/// owner's ask, 2026-10-25: "for engine failure emergency, landing is
/// feasible on a dry land").
pub const WATER_COST: f64 = 10.0;

/// One way as the page offers it.
struct Way {
    kind: String,
    /// Every kind of way this one is the best of.
    kinds: Vec<String>,
    title: String,
    stops: Vec<String>,
    fuel: Vec<String>,
    food: Vec<String>,
    path: Vec<Point>,
    distance_nm: f64,
    air_min: f64,
    ground_min: f64,
    fuel_gal: f64,
    landings: usize,
    crosses: Vec<i64>,
    marginal: Vec<i64>,
    along: Along,
}

/// The flight's time: from leaving, the straight line's with an hour's
/// room for stops and a way round.
fn window(a: &Ask) -> (f64, f64) {
    let tas = a.profile.tas_kt.max(1.0);
    let direct = geo::distance_nm(a.dep.at.0, a.dep.at.1, a.dest.at.0, a.dest.at.1);
    (a.depart_s, a.depart_s + (direct / tas * 1.3 + 1.0) * 3600.0)
}

fn via(a: &Ask) -> Vec<Point> {
    let mut out: Vec<Point> = a.current.clone().unwrap_or_default();
    if let Some((points, _)) = &a.filed {
        out.extend(points.iter().copied());
    }
    out
}

/// The no-fuel hazard's index, said on a way no chain of fields with fuel
/// reaches.
fn no_fuel(grid: &mut Grid) -> i64 {
    grid.hazard("fuel", &format!("No field with fuel within {STOP_FIELD_NM:.0} nm reaches"))
}

fn path_nm(path: &[Point]) -> f64 {
    path.windows(2).map(|w| geo::distance_nm(w[0].0, w[0].1, w[1].0, w[1].1)).sum()
}

/// One way: its turns moved onto a fix a pilot can load where one keeps
/// the way as clear and nearly as quick (the owner's "Isn't there a gps
/// fix nearby pos1, 2, 3 etc that we can use?", 2026-10-25), else named
/// off the nearest fix -- or, with none near enough, as a position
/// (@lat,lon), which the route takes as a point of its own -- and its fuel
/// stops in order along it, with its distance, minutes and fuel.
// Called once, by the options' search, with what it holds for each way;
// a struct to carry them would be built at that one call and taken apart here.
#[allow(clippy::too_many_arguments)]
fn make_way(
    kind: &str, grid: &mut Grid, gs: &Vec<f64>, a: &Ask, mut turns: Vec<Point>, stops: &[Stop], no_fuel_said: bool, year: f64,
) -> Way {
    let mut along_min = vec![0.0];
    for w in turns.windows(2) {
        along_min.push(along_min.last().unwrap() + line_minutes(grid, gs, w[0], w[1], 0.0, 0.0));
    }
    let original = turns.clone();
    let mut points: Vec<(f64, String, Point, bool)> = Vec::new();
    for i in 1..original.len().saturating_sub(1) {
        let (at, turn) = (along_min[i], original[i]);
        if let Some(fix) = naming::fix_for_turn(grid, gs, &a.fixes, turns[i - 1], turn, turns[i + 1]) {
            turns[i] = (fix.lat, fix.lon);
            points.push((at, fix.ident.clone(), (fix.lat, fix.lon), false));
            continue;
        }
        let ident = match naming::frd_near(&a.fixes, turn.0, turn.1, naming::NEAR_NM, year) {
            Some(named) => named.ident,
            None => format!("@{:.4},{:.4}", turn.0, turn.1),
        };
        points.push((at, ident, turn, false));
    }
    for s in stops {
        points.push((s.at, s.ident.clone(), (s.lat, s.lon), true));
    }
    points.stable_sort_by(|x, y| x.0.total_cmp(&y.0));
    let mut path = vec![turns[0]];
    path.extend(points.iter().map(|p| p.2));
    path.push(*turns.last().unwrap());
    let air = minutes_along(grid, gs, &path);
    let mut crosses = crossed(grid, &path, false);
    if no_fuel_said {
        crosses.push(no_fuel(grid));
    }
    Way {
        kind: kind.to_owned(),
        kinds: vec![kind.to_owned()],
        title: title(kind).to_owned(),
        stops: points.iter().map(|p| p.1.clone()).collect(),
        fuel: points.iter().filter(|p| p.3).map(|p| p.1.clone()).collect(),
        // The fuel stops with somewhere to eat, for the map's marks.
        food: stops.iter().filter(|s| s.food).map(|s| s.ident.clone()).collect(),
        distance_nm: r1(path_nm(&path)),
        air_min: r1(air),
        ground_min: TURNAROUND_MIN * stops.len() as f64,
        fuel_gal: r1(air / 60.0 * a.profile.burn_gph),
        landings: stops.len(),
        marginal: crossed(grid, &path, true),
        along: along(grid, gs, &path, a.profile.tas_kt),
        crosses,
        path,
    }
}

/// The pilot's own route with the fuel stops it needs put in where they
/// fall along it -- its own points kept, in order -- for FPL's card of it
/// before anything is planned (the owner's "Don't plan anything unless a
/// route is picked", 2026-10-24). Each hop between the fields the pilot
/// lands at (`landed`) is a flight of its own, refuelled there: a landing
/// already made was taken as flown over, and its own field offered as the
/// stop to add (the audit of 2026-10-24). Where no chain of fields
/// reaches a hop, the route is offered as it is with that said.
#[allow(clippy::too_many_arguments)]
fn own(
    grid: &mut Grid, gs: &Vec<f64>, a: &Ask, fuel: &Fuel, path: &[Point], idents: &[String], landed: &[bool], kind: &str, title: &str,
) -> Way {
    let inner_n = idents.len().min(path.len().saturating_sub(2));
    let inner: Vec<(&String, Point, bool)> =
        (0..inner_n).map(|i| (&idents[i], path[i + 1], if landed.len() == idents.len() { landed[i] } else { false })).collect();
    let mut hops: Vec<Vec<Point>> = vec![vec![path[0]]];
    for &(_, p, lands) in &inner {
        hops.last_mut().unwrap().push(p);
        if lands {
            hops.push(vec![p]);
        }
    }
    hops.last_mut().unwrap().push(*path.last().unwrap());
    let mut found: Vec<Stop> = Vec::new();
    let mut short = false;
    let mut at = 0.0;
    for hop in &hops {
        match stops::stops(grid, gs, hop, fuel, false, MARGINAL_STOP_MIN) {
            None => short = true,
            Some(s) => found.extend(s.into_iter().map(|s| Stop { at: at + s.at, ..s })),
        }
        at += minutes_along(grid, gs, hop);
    }
    let mut along_min = vec![0.0];
    for w in path.windows(2) {
        along_min.push(along_min.last().unwrap() + line_minutes(grid, gs, w[0], w[1], 0.0, 0.0));
    }
    let mut points: Vec<(f64, String, Point, bool)> =
        inner.iter().enumerate().map(|(i, (ident, p, _))| (along_min[i + 1], (*ident).clone(), *p, false)).collect();
    points.extend(found.iter().map(|s| (s.at, s.ident.clone(), (s.lat, s.lon), true)));
    points.stable_sort_by(|x, y| x.0.total_cmp(&y.0));
    let mut way = vec![path[0]];
    way.extend(points.iter().map(|p| p.2));
    way.push(*path.last().unwrap());
    let air = minutes_along(grid, gs, &way);
    let landings = found.len() + inner.iter().filter(|i| i.2).count();
    let mut crosses = crossed(grid, &way, false);
    if short {
        crosses.push(no_fuel(grid));
    }
    Way {
        kind: kind.to_owned(),
        kinds: vec![kind.to_owned()],
        title: title.to_owned(),
        stops: points.iter().map(|p| p.1.clone()).collect(),
        fuel: points.iter().filter(|p| p.3).map(|p| p.1.clone()).collect(),
        food: found.iter().filter(|s| s.food).map(|s| s.ident.clone()).collect(),
        distance_nm: r1(path_nm(&way)),
        air_min: r1(air),
        ground_min: TURNAROUND_MIN * landings as f64,
        fuel_gal: r1(air / 60.0 * a.profile.burn_gph),
        landings,
        marginal: crossed(grid, &way, true),
        along: along(grid, gs, &way, a.profile.tas_kt),
        crosses,
        path: way,
    }
}

/// Each kind's name given to the way that is it, among those found: the
/// fastest the least time end to end, the best weather the fewest hazards
/// crossed (the want of fuel aside), then the fewest marginal cells, then
/// the time. Each kind's search finds its own way, but where nothing keeps
/// clear (CLOSED_COST) a search crossing least can come out slower than
/// another's -- KSEA to KSFO's "fastest" went 605 nm out over the Pacific
/// round the mountains obscured, 110 minutes slower than the best
/// weather's (2026-10-25). A way left with no name is dropped; each keeps
/// its first name as its key.
fn named(grid: &Grid, mut found: Vec<Way>) -> Vec<Way> {
    if found.is_empty() {
        return found;
    }
    let minutes = |w: &Way| w.air_min + w.ground_min;
    let is_fuel = |h: &i64| grid.hazards[*h as usize].kind == "fuel";
    // A way no fuel field reaches lands nowhere and so looks quickest and
    // clearest: not any kind's best while another way can be flown.
    let mut fuelled: Vec<usize> = (0..found.len()).filter(|&i| !found[i].crosses.iter().any(is_fuel)).collect();
    if fuelled.is_empty() {
        fuelled = (0..found.len()).collect();
    }
    let least = |key: &dyn Fn(&Way) -> (f64, f64, f64)| -> usize {
        let mut best = fuelled[0];
        for &i in &fuelled[1..] {
            if key(&found[i]).partial_cmp(&key(&found[best])) == Some(std::cmp::Ordering::Less) {
                best = i;
            }
        }
        best
    };
    let fastest = least(&|w| (minutes(w), 0.0, 0.0));
    // The best weather's: what it crosses of the weather and the closed
    // cells, not the special-use areas it is told of (special_use.rs).
    let not_weather = |h: &&i64| is_fuel(h) || special_use::is_special_use(&grid.hazards[**h as usize].kind);
    let weather = least(&|w| (w.crosses.iter().filter(|h| !not_weather(h)).count() as f64, w.marginal.len() as f64, minutes(w)));
    let fewest = least(&|w| (w.landings as f64, minutes(w), 0.0));
    let best = [("fastest", fastest), ("weather", weather), ("stops", fewest)];
    for (i, w) in found.iter_mut().enumerate() {
        w.kinds.retain(|k| best.iter().all(|(kind, at)| kind != k || *at == i));
    }
    for (kind, at) in best {
        if !found[at].kinds.iter().any(|k| k == kind) {
            found[at].kinds.push(kind.to_owned());
        }
    }
    found.retain(|w| !w.kinds.is_empty());
    for w in &mut found {
        if !w.kinds.contains(&w.kind) {
            w.kind = w.kinds[0].clone();
            w.title = title(&w.kind).to_owned();
        }
    }
    found
}

/// The grid read from everything the planner sent: the sources it could
/// not read named in `unchecked`, in the order the planner reads them.
fn read_grid(a: &Ask, unchecked: &mut Vec<String>) -> Result<(Grid, Vec<f64>), String> {
    let start = a.dep.at;
    let end = a.dest.at;
    let window = window(a);
    let top = highest_cruise_ft(a.profile.ceiling_ft);
    let ceiling = LEGAL_CEILING_FT.max(a.min_ceiling_ft.unwrap_or(0.0));
    let visibility = LEGAL_VISIBILITY_SM.max(a.min_visibility_sm.unwrap_or(0.0));
    let mut grid = Grid::new(start, end, &via(a));
    // No ceiling known (no airplane, or none in its profile): no ground
    // closed on it, and the pilot told (the owner, 2026-11-09).
    if a.profile.ceiling_ft.is_none() {
        unchecked.push("service ceiling".into());
    }
    match &a.terrain_ft {
        Some(h) => read::ground(&mut grid, h, a.profile.ceiling_ft.map(|_| top))?,
        // The tiles not to be had: the ways offered over level ground, and
        // the pilot told.
        None => unchecked.push("terrain".into()),
    }
    match &a.water_far {
        Some(far) => read::water(&mut grid, far.clone())?,
        None => unchecked.push("water".into()),
    }
    let metars_wanted = a.depart_s - a.now_s <= METAR_AHEAD_S;
    if a.tafs.is_none() || (metars_wanted && a.metars.is_none()) {
        unchecked.push("forecasts and reports".into());
    }
    read::weather(
        &mut grid,
        a.tafs.as_deref().unwrap_or(&[]),
        a.metars.as_deref().unwrap_or(&[]),
        a.depart_s,
        a.now_s,
        ceiling,
        visibility,
    );
    match &a.sigmets {
        Some(s) => read::sigmets(&mut grid, s, window),
        None => unchecked.push("SIGMETs".into()),
    }
    match &a.gairmets {
        Some(g) => read::gairmets(&mut grid, g, window, top),
        None => unchecked.push("G-AIRMETs".into()),
    }
    match &a.sua {
        Some(s) => special_use::special_use(&mut grid, s),
        None => unchecked.push("special-use airspace".into()),
    }
    match &a.tfrs {
        Some(t) => read::tfrs(&mut grid, t),
        None => unchecked.push("TFRs".into()),
    }
    // East is least: magnetic = true - variation east, the grid's middle's
    // (the World Magnetic Model, today's).
    let mid_lat = grid.lats.iter().sum::<f64>() / grid.rows as f64;
    let mid_lon = grid.lons.iter().sum::<f64>() / grid.cols as f64;
    let variation = wmm::declination(mid_lat, mid_lon, naming::decimal_year(a.now_s));
    // With no airplane the ways are the route's own, in still air.
    let winds = if a.profile.airplane { &a.winds[..] } else { &[] };
    let gs = read::groundspeeds(&grid, winds, &read::cruising_altitudes(top), a.profile.tas_kt.max(1.0), variation);
    Ok((grid, gs))
}

/// The ways to fly from the departure to the destination: the answer
/// route_options gives (the contract's RouteOptionsAnswer).
fn options(a: &Ask) -> Result<String, String> {
    let (start, end) = (a.dep.at, a.dest.at);
    let mut unchecked = Vec::new();
    let (mut grid, gs) = read_grid(a, &mut unchecked)?;
    // 91.151: 30 minutes by day, 45 at night, night judged at both ends
    // of the flight's window (14 CFR 1.1, wingtip_flight::sun) unless the
    // host says.
    let night = a.night.unwrap_or_else(|| {
        let (leave, arrive) = window(a);
        wingtip_flight::sun::night_at_either_end(start, leave, end, arrive)
    });
    let reserve_gal = flight::reserve_min(false, night) / 60.0 * a.profile.burn_gph;
    if a.fields.is_none() {
        unchecked.push("fuel fields".into());
    }
    // An airplane whose usable fuel or start and taxi allowance is not
    // known: its fuel stops are not worked out, nor said to be needed or
    // not, and none is assumed (the owner, 2026-11-09).
    if a.profile.airplane && a.profile.usable_gal.is_none() {
        unchecked.push("fuel".into());
    } else if a.profile.airplane && a.profile.taxi_gal.is_none() {
        unchecked.push("start and taxi fuel".into());
    }
    // Not the route's own fields: a landing the pilot makes is not a stop
    // to add.
    let skip: Vec<&str> =
        [a.dep.ident.as_str(), a.dest.ident.as_str()].into_iter().chain(a.current_idents.iter().map(String::as_str)).collect();
    let table: Option<Vec<Field>> = a.fields.as_ref().map(|f| f.iter().filter(|f| !skip.contains(&f.ident.as_str())).cloned().collect());
    let fuel = Fuel {
        tas_kt: a.profile.tas_kt,
        burn_gph: a.profile.burn_gph,
        usable_gal: a.profile.usable_gal.unwrap_or(0.0),
        taxi_gal: a.profile.taxi_gal.unwrap_or(0.0),
        reserve_gal,
        fields: table.as_deref(),
        food: a.food,
        unread: RefCell::new(Vec::new()),
    };
    let year = naming::decimal_year(a.now_s);
    let mut found: Vec<Way> = Vec::new();
    for kind in KINDS {
        let marginal_cost = if kind == "weather" { MARGINAL_COST } else { 0.0 };
        let water_cost = if kind == "land" { WATER_COST } else { 0.0 };
        // Clear of everything where there is a way, else crossing least.
        let Some(cells) = way(&grid, &gs, start, end, marginal_cost, None, water_cost)
            .or_else(|| way(&grid, &gs, start, end, marginal_cost, Some(CLOSED_COST), water_cost))
        else {
            continue;
        };
        let mut points = vec![start];
        if cells.len() > 2 {
            points.extend(cells[1..cells.len() - 1].iter().map(|&c| grid.centre(c)));
        }
        points.push(end);
        let mut turns = points.clone();
        for slower in STRAIGHTEN_STEPS_MIN {
            turns = straightened(&grid, &gs, &points, marginal_cost, slower, water_cost);
            if turns.len().saturating_sub(2) <= MAX_TURNS {
                break;
            }
        }
        let marginal_stop = MARGINAL_STOP_MIN * if kind == "weather" { 3.0 } else { 1.0 };
        let stops = stops::stops(&grid, &gs, &turns, &fuel, kind == "stops", marginal_stop);
        // No chain of fields reaches: the way offered all the same, with
        // that said (the owner's rule: no hard limits, only warnings).
        let option = make_way(kind, &mut grid, &gs, a, turns, stops.as_deref().unwrap_or(&[]), stops.is_none(), year);
        // A way that is also another's best is one option with both names.
        if let Some(same) = found.iter_mut().find(|o| o.stops == option.stops) {
            same.kinds.push(kind.to_owned());
            continue;
        }
        found.push(option);
    }
    let found = named(&grid, found);
    let current = a.current.clone().unwrap_or_else(|| vec![start, end]);
    let mine = own(&mut grid, &gs, a, &fuel, &current, &a.current_idents, &a.current_landed, "own", "Your Route");
    // The most filed route's fixes are flown over, none landed at.
    let filed = a.filed.as_ref().map(|(points, idents)| {
        let mut path = vec![start];
        path.extend(points.iter().copied());
        path.push(end);
        own(&mut grid, &gs, a, &fuel, &path, idents, &vec![false; idents.len()], "filed", "Most Filed")
    });

    let mut out = String::from("{\"options\":[");
    for (i, w) in found.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        way_json(&mut out, w, a.profile.airplane, &grid.hazards);
    }
    out.push_str("],\"own\":");
    way_json(&mut out, &mine, a.profile.airplane, &grid.hazards);
    out.push_str(",\"filed\":");
    match &filed {
        Some(w) => way_json(&mut out, w, a.profile.airplane, &grid.hazards),
        None => out.push_str("null"),
    }
    // The pilot's own route as it is flown, end to end, for the map to
    // draw beside the ways (the owner's "all routes drawn including mine",
    // 2026-10-25).
    out.push_str(",\"current_path\":");
    path_json(&mut out, &current);
    out.push_str(",\"direct\":");
    ints(&mut out, &crossed(&grid, &[start, end], false));
    // The ends' own weather, which no way round can change: said, as the
    // briefing says it, for the pilot to judge.
    let mut ends: Vec<i64> = Vec::new();
    for c in [grid.cell(start), grid.cell(end)] {
        let h = grid.closed[grid.at(c)];
        if h >= 0 && !ends.contains(&h) {
            ends.push(h);
        }
    }
    out.push_str(",\"ends\":");
    ints(&mut out, &ends);
    let (crossing, marginal) = match &a.current {
        Some(c) => (crossed(&grid, c, false), crossed(&grid, c, true)),
        None => (Vec::new(), Vec::new()),
    };
    out.push_str(",\"current\":");
    ints(&mut out, &crossing);
    // What the pilot's own route meets, as each way's: its weather strip,
    // wind and floor.
    out.push_str(",\"current_along\":{");
    along_json(&mut out, &along(&grid, &gs, &current, a.profile.tas_kt));
    out.push_str("},\"current_marginal\":");
    ints(&mut out, &marginal);
    out.push_str(",\"hazards\":[");
    for (i, h) in grid.hazards.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"kind\":");
        json::string(&mut out, &h.kind);
        out.push_str(",\"name\":");
        json::string(&mut out, &h.name);
        out.push('}');
    }
    out.push_str("],\"unchecked\":");
    strings(&mut out, &unchecked);
    // The fuel fields weighed whose places to eat were not read yet: the
    // planner reads them on the side and asks again sooner.
    out.push_str(",\"food_unread\":[");
    for (i, (ident, lat, lon)) in fuel.unread.borrow().iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"ident\":");
        json::string(&mut out, ident);
        out.push_str(",\"lat\":");
        json::number(&mut out, *lat);
        out.push_str(",\"lon\":");
        json::number(&mut out, *lon);
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}

/// route_options_frame's answer: where the cells are and their samples,
/// the flight's time, and what the planner reads for them.
fn frame(a: &Ask) -> String {
    let grid = Grid::new(a.dep.at, a.dest.at, &via(a));
    let (s, w, n, e) = grid.bbox();
    let window = window(a);
    let top = highest_cruise_ft(a.profile.ceiling_ft);
    // The fixes and fields wanted: those within a turn's naming reach of
    // the grid (naming::NEAR_NM), which takes in a fuel stop's too.
    let data_box = geo::corridor_bbox((s, w), (n, e), naming::NEAR_NM);
    let mut out = String::from("{");
    for (key, v) in [("lat0", grid.geom.lat0), ("lon0", grid.geom.lon0)] {
        out.push_str(&format!("\"{key}\":"));
        json::number(&mut out, v);
        out.push(',');
    }
    out.push_str(&format!("\"rows\":{},\"cols\":{},\"cell_deg\":", grid.rows, grid.cols));
    json::number(&mut out, CELL_DEG);
    out.push_str(&format!(",\"per_cell\":{PER_CELL},\"top_ft\":"));
    json::number(&mut out, top);
    out.push_str(",\"window\":[");
    json::number(&mut out, window.0);
    out.push(',');
    json::number(&mut out, window.1);
    out.push_str("],\"altitudes_ft\":[");
    for (i, alt) in read::cruising_altitudes(top).iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::number(&mut out, *alt);
    }
    out.push_str("],\"lowest_cruise_ft\":");
    json::number(&mut out, LOWEST_CRUISE_FT);
    // The speed the ways are costed at: the airplane's, else the still-air
    // reference (ask::REFERENCE_TAS_KT), for the host's glide reach.
    out.push_str(",\"tas_kt\":");
    json::number(&mut out, a.profile.tas_kt);
    out.push_str(",\"metars\":");
    out.push_str(if a.depart_s - a.now_s <= METAR_AHEAD_S { "true" } else { "false" });
    let boxed = |out: &mut String, key: &str, b: [f64; 4]| {
        out.push_str(&format!(",\"{key}\":["));
        for (i, v) in b.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            json::number(out, *v);
        }
        out.push(']');
    };
    boxed(&mut out, "bbox", [s, w, n, e]);
    boxed(&mut out, "data_box", [data_box.0, data_box.1, data_box.2, data_box.3]);
    out.push('}');
    out
}

/// A rule of this module by its name, JSON in and out (crate::call).
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let r = Reader { name };
    match name {
        "route_options_frame" => Ok(frame(&r.ask(v)?)),
        "route_options" => options(&r.ask(v)?),
        "terrain_way_frame" | "terrain_way_round" => terrain::call(name, v),
        "fuel_stops" | "fields_along" => fuel::call(name, v),
        "class_b_entered" | "class_b_detours" => classb::call(name, v),
        "frd_near" => {
            let fixes = r.fixes(v, "fixes")?;
            let year = naming::decimal_year(r.num(v, "now_s")?);
            let max_nm = r.opt_num(v, "max_nm")?.unwrap_or(naming::NEAR_NM);
            Ok(match naming::frd_near(&fixes, r.num(v, "lat")?, r.num(v, "lon")?, max_nm, year) {
                Some(n) => {
                    let mut out = String::from("{\"base\":");
                    json::string(&mut out, &n.base);
                    out.push_str(&format!(",\"course_deg\":{},\"distance_nm\":", n.course_deg));
                    json::number(&mut out, n.distance_nm);
                    out.push_str(&format!(",\"radial\":{},\"ident\":", n.radial));
                    json::string(&mut out, &n.ident);
                    out.push('}');
                    out
                }
                None => "null".to_owned(),
            })
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

#[cfg(test)]
mod tests;
