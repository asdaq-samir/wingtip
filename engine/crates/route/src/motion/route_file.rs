//! A route as another app's flight-plan file carries it, read: Garmin's
//! FlightPlan XML (`.fpl`, which Garmin Pilot, the GTN and G1000 units
//! and ForeFlight export, schema http://www8.garmin.com/xmlschemas/
//! FlightPlan/v1) and a GPX route (`.gpx`, GPX 1.1's `rte` of `rtept`s,
//! or its `wpt`s in order where it has no route). The points the planner
//! can plan by are those with an identifier: an airport, a navaid, a fix.
//! A user waypoint (Garmin's "USER WAYPOINT", a GPX point named in words)
//! has none and is left out, counted, so the app can say so. The route
//! read is a route for the pilot to look at first: the apps preview it as
//! they preview a shared flight (the security review of 2026-11-21, N3),
//! never planning it by themselves.

use crate::json::{self, Value};
use crate::xml::{self, Element};

pub const NOT_A_ROUTE: &str = "This file is not a Garmin flight plan (.fpl) or a GPX route.";
pub const TOO_FEW: &str = "This file's route has fewer than two airports or fixes the planner knows by name.";

/// A route read from a file: its ends, the points between, its name where
/// the file gives one, and how many points were left out.
#[derive(Debug, Clone, PartialEq)]
pub struct RouteFile {
    pub dep: String,
    pub dest: String,
    pub stops: Vec<String>,
    pub name: Option<String>,
    pub dropped: usize,
}

/// An identifier as the FAA's and ICAO's are written: two to five letters
/// and figures (a navaid's two or three, an airport's three or four, a
/// fix's five; FAA JO 7350.9's location identifiers), upper case.
fn ident(raw: &str) -> Option<String> {
    let t = raw.trim().to_uppercase();
    ((2..=5).contains(&t.len()) && t.bytes().all(|c| c.is_ascii_alphanumeric())).then_some(t)
}

fn text_of(e: &Element, name: &str) -> Option<String> {
    e.child(name).map(Element::all_text)
}

/// Garmin's route: each route-point's waypoint-identifier, a user
/// waypoint (no published identifier) left out.
fn garmin(root: &Element) -> (Vec<Option<String>>, Option<String>) {
    let Some(route) = root.child("route") else { return (Vec::new(), None) };
    let points = route
        .all("route-point")
        .map(|p| {
            let user = text_of(p, "waypoint-type").is_some_and(|t| t.trim().eq_ignore_ascii_case("USER WAYPOINT"));
            if user {
                None
            } else {
                text_of(p, "waypoint-identifier").and_then(|i| ident(&i))
            }
        })
        .collect();
    (points, text_of(route, "route-name").filter(|n| !n.trim().is_empty()))
}

/// GPX's first route, or its waypoints in order where it has none.
fn gpx(root: &Element) -> (Vec<Option<String>>, Option<String>) {
    let name_of = |p: &Element| text_of(p, "name").and_then(|n| ident(&n));
    if let Some(route) = root.child("rte") {
        let points = route.all("rtept").map(name_of).collect();
        return (points, text_of(route, "name").filter(|n| !n.trim().is_empty()));
    }
    (root.all("wpt").map(name_of).collect(), None)
}

/// A flight-plan file's route; Err with the words for the pilot where it
/// is not one or names fewer than two points.
pub fn read_route_file(text: &str) -> Result<RouteFile, &'static str> {
    let root = xml::parse(text).map_err(|_| NOT_A_ROUTE)?;
    let (points, name) = match root.name.as_str() {
        "flight-plan" => garmin(&root),
        "gpx" => gpx(&root),
        _ => return Err(NOT_A_ROUTE),
    };
    let dropped = points.iter().filter(|p| p.is_none()).count();
    let mut named: Vec<String> = points.into_iter().flatten().collect();
    // The same point twice in a row (a file's start written again) is one.
    named.dedup();
    if named.len() < 2 {
        return Err(TOO_FEW);
    }
    let dest = named.pop().unwrap_or_default();
    let dep = named.remove(0);
    Ok(RouteFile { dep, dest, stops: named, name: name.map(|n| n.trim().to_string()), dropped })
}

/// `read_route_file`: {"dep", "dest", "stops", "name", "dropped"} or
/// {"error": words}, from `{"text"}`, the file's text.
pub(super) fn read_rule(v: &Value) -> Result<String, String> {
    let text = v.get("text").and_then(Value::as_str).ok_or("read_route_file: \"text\" is missing or not a string")?;
    let mut out = String::new();
    match read_route_file(text) {
        Err(words) => {
            out.push_str("{\"error\":");
            json::string(&mut out, words);
            out.push('}');
        }
        Ok(route) => {
            out.push_str("{\"dep\":");
            json::string(&mut out, &route.dep);
            out.push_str(",\"dest\":");
            json::string(&mut out, &route.dest);
            out.push_str(",\"stops\":[");
            for (i, stop) in route.stops.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::string(&mut out, stop);
            }
            out.push_str("],\"name\":");
            match &route.name {
                Some(n) => json::string(&mut out, n),
                None => out.push_str("null"),
            }
            out.push_str(&format!(",\"dropped\":{}}}", route.dropped));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FPL: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<flight-plan xmlns="http://www8.garmin.com/xmlschemas/FlightPlan/v1">
  <route>
    <route-name>KMSN TO KOSH</route-name>
    <route-point><waypoint-identifier>KMSN</waypoint-identifier><waypoint-type>AIRPORT</waypoint-type></route-point>
    <route-point><waypoint-identifier>DLL</waypoint-identifier><waypoint-type>VOR</waypoint-type></route-point>
    <route-point><waypoint-identifier>USR001</waypoint-identifier><waypoint-type>USER WAYPOINT</waypoint-type></route-point>
    <route-point><waypoint-identifier>KOSH</waypoint-identifier><waypoint-type>AIRPORT</waypoint-type></route-point>
  </route>
</flight-plan>"#;

    #[test]
    fn a_garmin_plan_reads_its_named_points_and_counts_a_user_waypoint() {
        let r = read_route_file(FPL).unwrap();
        assert_eq!((r.dep.as_str(), r.dest.as_str()), ("KMSN", "KOSH"));
        assert_eq!(r.stops, vec!["DLL"]);
        assert_eq!(r.name.as_deref(), Some("KMSN TO KOSH"));
        assert_eq!(r.dropped, 1);
    }

    #[test]
    fn a_gpx_route_and_a_gpx_of_waypoints_read_in_order() {
        let rte = r#"<gpx version="1.1"><rte><name>Trip</name><rtept lat="43" lon="-89"><name>kmsn</name></rtept><rtept lat="44" lon="-88"><name>Lake House</name></rtept><rtept lat="44" lon="-88.5"><name>KOSH</name></rtept></rte></gpx>"#;
        let r = read_route_file(rte).unwrap();
        assert_eq!((r.dep.as_str(), r.dest.as_str(), r.dropped), ("KMSN", "KOSH", 1));
        let wpts = r#"<gpx><wpt lat="1" lon="1"><name>C81</name></wpt><wpt lat="2" lon="2"><name>KDLH</name></wpt></gpx>"#;
        assert_eq!(read_route_file(wpts).unwrap().dest, "KDLH");
    }

    #[test]
    fn what_is_not_a_route_says_so() {
        assert_eq!(read_route_file("not xml"), Err(NOT_A_ROUTE));
        assert_eq!(read_route_file("<kml></kml>"), Err(NOT_A_ROUTE));
        assert_eq!(read_route_file("<gpx><rte><rtept><name>KMSN</name></rtept></rte></gpx>"), Err(TOO_FEW));
    }
}
