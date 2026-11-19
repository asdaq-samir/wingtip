use super::*;

/// One way as the page offers it.
pub(super) struct Way {
    pub(super) kind: String,
    /// Every kind of way this one is the best of.
    pub(super) kinds: Vec<String>,
    pub(super) title: String,
    pub(super) stops: Vec<String>,
    pub(super) fuel: Vec<String>,
    pub(super) food: Vec<String>,
    pub(super) path: Vec<Point>,
    pub(super) distance_nm: f64,
    pub(super) air_min: f64,
    pub(super) ground_min: f64,
    pub(super) fuel_gal: f64,
    pub(super) landings: usize,
    pub(super) crosses: Vec<i64>,
    pub(super) marginal: Vec<i64>,
    pub(super) along: Along,
}

/// The flight's time: from leaving, the straight line's with an hour's
/// room for stops and a way round.
pub(super) fn window(a: &Ask) -> (f64, f64) {
    let tas = a.profile.tas_kt.max(1.0);
    let direct = geo::distance_nm(a.dep.at.0, a.dep.at.1, a.dest.at.0, a.dest.at.1);
    (a.depart_s, a.depart_s + (direct / tas * 1.3 + 1.0) * 3600.0)
}

pub(super) fn via(a: &Ask) -> Vec<Point> {
    let mut out: Vec<Point> = a.current.clone().unwrap_or_default();
    if let Some((points, _)) = &a.filed {
        out.extend(points.iter().copied());
    }
    out
}

/// The no-fuel hazard's index, said on a way no chain of fields with fuel
/// reaches.
pub(super) fn no_fuel(grid: &mut Grid) -> i64 {
    grid.hazard("fuel", &format!("No field with fuel within {STOP_FIELD_NM:.0} nm reaches"))
}

pub(super) fn path_nm(path: &[Point]) -> f64 {
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
pub(super) fn make_way(
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
pub(super) fn own(
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
pub(super) fn named(grid: &Grid, mut found: Vec<Way>) -> Vec<Way> {
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
