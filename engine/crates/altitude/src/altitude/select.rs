//! The band of each leg and the altitude recommended: the planner's
//! select_cruise_altitude once its data is read (#482 phase 3). The
//! planner reads the floors, the Class B shelves, the service ceilings in
//! the forecast air, the TAFs, the special-use airspace, the freezing
//! level and the hazards, all in parallel, and asks this with them.

use super::clouds::{self, Station};
use super::cruising::{self, HEMISPHERIC_RULE_AGL_FT};
use super::floor::{self, IFR_CLEARANCE_FT, IFR_MOUNTAINOUS_CLEARANCE_FT};
use super::tenth;
use super::track::Point;
use crate::flight::is_eastbound;
use crate::geo::{bearing_deg, py_mod};
use crate::json::Value;

type R<T> = Result<T, String>;

/// A special-use area the route crosses, as wingtip.sua finds it.
pub struct Area {
    pub kind: String,
    pub floor_ft: Option<f64>,
    pub ceiling_ft: Option<f64>,
    pub ceiling_agl: bool,
    /// The legs (by index) it is over.
    pub legs: Vec<usize>,
}

/// Whether a cruising altitude would enter a prohibited area the route
/// crosses, between its floor and ceiling: nobody flies in one without
/// its using agency's authorization (14 CFR 73.83), which an ATC clearance
/// is not. Cautious where the numbers are not MSL: an AGL floor is taken
/// as that many feet MSL (lower than it is), and an AGL or missing ceiling
/// as unlimited.
pub fn blocked(altitude_ft: f64, areas: &[&Area]) -> bool {
    areas.iter().any(|a| {
        let ceiling = if a.ceiling_agl { None } else { a.ceiling_ft };
        a.kind == "P" && a.floor_ft.unwrap_or(0.0) <= altitude_ft && ceiling.is_none_or(|c| altitude_ft <= c)
    })
}

/// A leg's band: its ceiling, its legal altitudes, whether the clouds
/// were kept, and whether its one altitude is tight.
struct Band {
    ceiling: Option<f64>,
    altitudes: Vec<f64>,
    cloud_kept: bool,
    tight: bool,
}

struct Rules {
    ifr: bool,
    /// Under IFR along an airway, its MAA: none of it above that.
    maa_ft: Option<f64>,
}

fn lowest(values: impl IntoIterator<Item = Option<f64>>) -> Option<f64> {
    values.into_iter().flatten().reduce(f64::min)
}

/// The legal altitudes from the floor to the lowest ceiling, the clouds'
/// included, none through a prohibited area -- or, where no 500 ft step
/// fits, the one tight altitude under the ceiling -- or, where the clouds
/// leave none, the band without them, said so (the owner's "warn, never
/// limit": a forecast is a reason to warn, and a nav log refused for it
/// could not be looked at for a later departure either). Under IFR the
/// IFR altitudes from the floor to the service ceiling alone: an IFR
/// clearance takes the flight into Class B, the clouds and Class A.
#[allow(clippy::too_many_arguments)]
fn band(
    rules: &Rules, floor: f64, airspace: Option<f64>, service: Option<f64>, cloud_base: Option<f64>, course: f64, areas: &[&Area],
    rule_from: f64,
) -> Band {
    if rules.ifr {
        let top = lowest([service, rules.maa_ft]);
        let altitudes = cruising::legal_ifr(floor, top, course).into_iter().filter(|&a| !blocked(a, areas)).collect();
        return Band { ceiling: top, altitudes, cloud_kept: true, tight: false };
    }
    // The airspace ceiling is a Class B shelf's floor, and the floor is
    // inside Class B ("from 3,000 feet MSL" upward), which 14 CFR
    // 91.131(a)(1) takes no flight into without a clearance: an altitude
    // equal to it is not under it, so the band keeps strictly below, as
    // `cruising::tight` does and as cautions.rs's "Into Class B" reads
    // (alt >= shelf). The service ceiling and the clouds' highest stay
    // inclusive: an airplane may cruise at its ceiling, and
    // clouds::highest_under_ft already keeps 91.155's distance below.
    let under_airspace = |a: f64| airspace.is_none_or(|shelf| a < shelf);
    let legal = |ceiling: Option<f64>| -> (Vec<f64>, bool) {
        let found: Vec<f64> = cruising::legal_vfr(floor, ceiling, course, Some(rule_from))
            .into_iter()
            .filter(|&a| !blocked(a, areas) && under_airspace(a))
            .collect();
        if !found.is_empty() {
            return (found, false);
        }
        match cruising::tight(floor, ceiling, Some(rule_from)) {
            Some(t) if !blocked(t, areas) => (vec![t], true),
            _ => (Vec::new(), false),
        }
    };
    let ceiling = lowest([airspace, service, cloud_base.map(clouds::highest_under_ft)]);
    let (altitudes, tight) = legal(ceiling);
    if !altitudes.is_empty() || cloud_base.is_none() {
        return Band { ceiling, altitudes, cloud_kept: true, tight };
    }
    let ceiling = lowest([airspace, service]);
    let (altitudes, tight) = legal(ceiling);
    Band { ceiling, altitudes, cloud_kept: false, tight }
}

fn num(x: f64) -> Value {
    Value::Number(x)
}

fn opt(x: Option<f64>) -> Value {
    x.map_or(Value::Null, Value::Number)
}

fn nums(xs: &[f64]) -> Value {
    Value::Array(xs.iter().copied().map(Value::Number).collect())
}

fn obj(members: Vec<(&str, Value)>) -> Value {
    Value::Object(members.into_iter().map(|(k, v)| (k.to_owned(), v)).collect())
}

fn point(name: &str, v: Option<&Value>) -> R<Point> {
    match v.and_then(Value::as_array) {
        Some([lat, lon]) => Ok((
            lat.as_f64().ok_or(format!("{name}: a point's lat is not a number"))?,
            lon.as_f64().ok_or(format!("{name}: a point's lon is not a number"))?,
        )),
        _ => Err(format!("{name}: a point is not [lat, lon]")),
    }
}

fn opt_num(name: &str, v: &Value, key: &str) -> R<Option<f64>> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

fn list<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key).and_then(Value::as_array).unwrap_or(&[])
}

/// select_cruise_altitude's answer from the data the planner read (the
/// input is call.rs's `select_cruise_altitude`). The recommendation is
/// the lowest legal altitude at or above the floor, not the highest under
/// the ceiling: the floor already carries the terrain and obstacles'
/// clearance, so the first legal altitude over it is a real cruising
/// altitude, and climbing past it costs time and fuel on a short leg for
/// nothing the pilot asked for (a 100 nm C172 leg across Iowa once came
/// back at 12,500 ft). The four plans offer higher.
pub fn select(name: &str, v: &Value) -> R<Value> {
    let start = point(name, v.get("start"))?;
    let end = point(name, v.get("end"))?;
    let fixes: Vec<Point> = list(v, "fixes").iter().map(|f| point(name, Some(f))).collect::<R<_>>()?;
    let ifr = v.get("rules").and_then(Value::as_str) == Some("ifr");
    let class_b_cleared = matches!(v.get("class_b_cleared"), Some(Value::Bool(true)));
    let legs: Vec<(Point, Point)> = if fixes.len() >= 2 { fixes.windows(2).map(|w| (w[0], w[1])).collect() } else { vec![(start, end)] };
    let count = legs.len();

    // Under IFR along an airway its published altitudes are the floor
    // (14 CFR 91.177(a)(1), the MEA) and a ceiling (the MAA).
    let airway = v.get("airway").filter(|a| !matches!(a, Value::Null));
    let published =
        airway.and_then(|a| floor::published(opt_num(name, a, "mea_ft").ok().flatten(), opt_num(name, a, "gnss_mea_ft").ok().flatten()));
    let on_airway = ifr && published.is_some();
    let floors: Vec<Value> = if on_airway {
        vec![obj(vec![("floor_ft", opt(published)), ("airway", airway.cloned().unwrap_or(Value::Null))]); count]
    } else {
        list(v, "floors").to_vec()
    };
    if floors.len() != count {
        return Err(format!("{name}: {} floors for {count} legs", floors.len()));
    }
    let floor_of = |f: &Value| opt_num(name, f, "floor_ft")?.ok_or(format!("{name}: a floor's \"floor_ft\" is missing"));
    let floors_ft: Vec<f64> = floors.iter().map(floor_of).collect::<R<_>>()?;
    // Where 91.159's rule begins over each leg: 3,000 ft above its lowest
    // ground. Under IFR the direction of flight decides at every altitude
    // (91.179(b)).
    let rules_from: Vec<f64> = floors
        .iter()
        .map(|f| if ifr { Ok(0.0) } else { opt_num(name, f, "lowest_ground_ft").map(|g| g.unwrap_or(0.0) + HEMISPHERIC_RULE_AGL_FT) })
        .collect::<R<_>>()?;

    // Class B is no ceiling under IFR or with a clearance: the route is
    // planned through it, and its transits still say it takes one.
    let airspace: Vec<Option<f64>> = if ifr || class_b_cleared {
        vec![None; count]
    } else {
        let given = list(v, "airspace_ceilings_ft");
        (0..count).map(|i| given.get(i).and_then(Value::as_f64)).collect()
    };
    // A leg's service ceiling null is no airplane: no ceiling of its own,
    // the band then the rules' and the airspace's alone (the owner,
    // 2026-11-09: "don't assume").
    let service: Vec<Option<f64>> = list(v, "service_ceilings_ft").iter().map(Value::as_f64).collect();
    if service.len() != count {
        return Err(format!("{name}: {} service ceilings for {count} legs", service.len()));
    }
    let variation = opt_num(name, v, "variation_deg")?.unwrap_or(0.0);
    let leg_variations: Vec<f64> = list(v, "leg_variations_deg").iter().filter_map(Value::as_f64).collect();

    let stations: Vec<Station> = list(v, "stations")
        .iter()
        .map(|s| {
            Ok(Station {
                ident: s.get("icaoId").and_then(Value::as_str).unwrap_or("").to_owned(),
                at: (opt_num(name, s, "lat")?.unwrap_or(f64::NAN), opt_num(name, s, "lon")?.unwrap_or(f64::NAN)),
                ceiling_ft: opt_num(name, s, "ceiling_ft")?,
                elevation_ft: opt_num(name, s, "elevation_ft")?,
            })
        })
        .collect::<R<_>>()?;
    let cloud_bases = clouds::leg_bases(&legs, &stations);
    let cloud = cloud_bases.iter().flatten().min_by(|a, b| a.0.total_cmp(&b.0).then_with(|| a.1.cmp(&b.1))).cloned();

    let areas: Vec<Area> = list(v, "special_use")
        .iter()
        .map(|a| Area {
            kind: a.get("type").and_then(Value::as_str).unwrap_or("").to_owned(),
            floor_ft: a.get("floor_ft").and_then(Value::as_f64),
            ceiling_ft: a.get("ceiling_ft").and_then(Value::as_f64),
            ceiling_agl: a.get("ceiling_ref").and_then(Value::as_str) == Some("AGL"),
            legs: list(a, "legs").iter().filter_map(Value::as_f64).map(|i| i as usize).collect(),
        })
        .collect();
    let all_areas: Vec<&Area> = areas.iter().collect();

    let rules = Rules { ifr, maa_ft: if on_airway { airway.and_then(|a| a.get("maa_ft")).and_then(Value::as_f64) } else { None } };
    let course = py_mod(bearing_deg(start.0, start.1, end.0, end.1) - variation, 360.0);

    // The whole route's own band: the highest floor and the lowest shelf,
    // cloud and service ceiling anywhere along it -- the altitude that
    // works everywhere.
    let floor_ft = floors_ft.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let rule_from = rules_from.iter().copied().fold(f64::INFINITY, f64::min);
    let airspace_ceiling = lowest(airspace.iter().copied());
    let service_ceiling = lowest(service.iter().copied());
    let route = band(&rules, floor_ft, airspace_ceiling, service_ceiling, cloud.as_ref().map(|c| c.0), course, &all_areas, rule_from);

    // Leg by leg, for the stepped plans, each against its own magnetic
    // course: 91.159 goes by the course flown, and near north or south a
    // dogleg can put one leg in the other half of the rule.
    let breaks: Vec<f64> = list(v, "breaks_nm").iter().filter_map(Value::as_f64).collect();
    let mut segments = Vec::new();
    let mut all_kept = route.cloud_kept;
    let mut legal: Vec<f64> = route.altitudes.clone();
    if fixes.len() >= 2 {
        if breaks.len() != count + 1 {
            return Err(format!("{name}: {} breaks for {count} legs", breaks.len()));
        }
        for i in 0..count {
            let (a, b) = legs[i];
            let leg_course = py_mod(bearing_deg(a.0, a.1, b.0, b.1) - leg_variations.get(i).copied().unwrap_or(variation), 360.0);
            let here: Vec<&Area> = areas.iter().filter(|area| area.legs.contains(&i)).collect();
            let base = cloud_bases[i].as_ref();
            let leg = band(&rules, floors_ft[i], airspace[i], service[i], base.map(|c| c.0), leg_course, &here, rules_from[i]);
            all_kept &= leg.cloud_kept;
            legal.extend(&leg.altitudes);
            let f = &floors[i];
            let mut members = vec![
                ("from_nm", num(tenth(breaks[i]))),
                ("to_nm", num(tenth(breaks[i + 1]))),
                ("floor_ft", num(floors_ft[i])),
                ("airspace_ceiling_ft", opt(airspace[i])),
                ("service_ceiling_ft", opt(service[i])),
                ("cloud_base_ft", opt(base.map(|c| c.0))),
                ("cloud_station", base.map_or(Value::Null, |c| Value::String(c.1.clone()))),
                ("cloud_ceiling_ft", opt(base.map(|c| clouds::highest_under_ft(c.0)))),
                ("cloud_clearance_kept", Value::Bool(leg.cloud_kept)),
                ("band_ceiling_ft", opt(leg.ceiling)),
                ("course_magnetic_deg", num(tenth(leg_course))),
                ("eastbound", Value::Bool(is_eastbound(leg_course))),
                ("hemispheric_rule_from_ft", num(rules_from[i].round_ties_even())),
                ("candidates_ft", nums(&leg.altitudes)),
                ("tight", Value::Bool(leg.tight)),
            ];
            let field = |k: &str| f.get(k).cloned().unwrap_or(Value::Null);
            if ifr {
                if on_airway {
                    members.push(("airway", field("airway")));
                } else {
                    let over = matches!(f.get("mountainous"), Some(Value::Bool(true)));
                    members.push(("highest_ft", field("highest_ft")));
                    members.push(("highest_is_obstacle", field("highest_is_obstacle")));
                    members.push(("mountainous", Value::Bool(over)));
                    members.push(("obstacle_clearance_ft", num(if over { IFR_MOUNTAINOUS_CLEARANCE_FT } else { IFR_CLEARANCE_FT })));
                }
            } else {
                // 91.119's own minimum over the leg, for a caution to
                // measure a pilot's own altitude against.
                members.push(("highest_ft", field("highest_ft")));
                members.push(("highest_is_obstacle", field("highest_is_obstacle")));
                members.push(("obstacle_type", field("obstacle_type")));
                members.push(("obstacle_clearance_ft", field("clearance_ft")));
                members.push(("congested", field("congested")));
            }
            segments.push(obj(members));
        }
    }

    // Icing: an altitude this could recommend reaching the freezing level
    // (any, where the level is at or below the lowest reported one), with
    // the moisture icing needs -- a broken, overcast or obscured layer
    // forecast along the route, or an icing AIRMET or SIGMET over it. Icing
    // needs visible moisture as well as cold, so the freezing level is a
    // warning, not a ceiling. None where it could not be checked.
    let unavailable: Vec<&str> = list(v, "weather_unavailable").iter().filter_map(Value::as_str).collect();
    let freezing = v.get("freezing").filter(|f| !matches!(f, Value::Null));
    let freezing_ft = freezing.and_then(|f| f.get("ft")).and_then(Value::as_f64);
    let at_or_below = freezing.is_some_and(|f| matches!(f.get("at_or_below"), Some(Value::Bool(true))));
    let reaches = freezing_ft.is_some_and(|ft| at_or_below || legal.iter().any(|&a| a >= ft));
    let moisture = opt_num(name, v, "min_ceiling_ft")?.is_some()
        || list(v, "hazards").iter().any(|h| h.get("hazard").and_then(Value::as_str).unwrap_or("").to_uppercase().starts_with("ICE"));
    let icing = if unavailable.contains(&"freezing_level") { Value::Null } else { Value::Bool(reaches && moisture) };
    let mountainous = ifr && floors.iter().any(|f| matches!(f.get("mountainous"), Some(Value::Bool(true))));

    Ok(obj(vec![
        ("rules", Value::String(if ifr { "ifr" } else { "vfr" }.to_owned())),
        ("recommended_ft", opt(route.altitudes.first().copied())),
        ("candidates_ft", nums(&route.altitudes)),
        ("course_magnetic_deg", num(tenth(course))),
        ("eastbound", Value::Bool(is_eastbound(course))),
        // The rule applies above this: 3,000 ft over the lowest ground on
        // the route. Below it, any altitude.
        ("hemispheric_rule_from_ft", num(rule_from.round_ties_even())),
        ("floor_ft", num(floor_ft)),
        ("airspace_ceiling_ft", opt(airspace_ceiling)),
        ("class_b_cleared", Value::Bool(class_b_cleared)),
        ("service_ceiling_ft", opt(service_ceiling)),
        ("cloud_base_ft", opt(cloud.as_ref().map(|c| c.0))),
        ("cloud_station", cloud.as_ref().map_or(Value::Null, |c| Value::String(c.1.clone()))),
        ("cloud_ceiling_ft", opt(cloud.as_ref().map(|c| clouds::highest_under_ft(c.0)))),
        // False where the clouds leave the route, or a leg of it, no
        // altitude: those altitudes are the band's without them.
        ("cloud_clearance_kept", Value::Bool(all_kept)),
        ("freezing_level_ft", opt(freezing_ft)),
        ("freezing_level_at_or_below", Value::Bool(at_or_below)),
        ("icing_possible", icing),
        ("band_ceiling_ft", opt(route.ceiling)),
        ("segments", Value::Array(segments)),
        // Under IFR: whether any leg is over a designated mountainous area
        // (14 CFR Part 95), its floor 2,000 ft over the obstacles.
        ("mountainous", Value::Bool(mountainous)),
    ]))
}
