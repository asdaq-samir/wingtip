//! A route from a file another app wrote, read before the pilot uses it:
//! a flight plan's .fpl (Garmin's FlightPlan v1 XML,
//! http://www8.garmin.com/xmlschemas/FlightPlan/v1, which Garmin Pilot,
//! ForeFlight, the G1000 and GTN's Flight Stream write and read) or a GPX
//! route (GPX 1.1, https://www.topografix.com/GPX/1/1/: its first `rte`'s
//! `rtept`s, or its `wpt`s in order where it has no route).
//!
//! Each point keeps the ident the file names it by where that is one the
//! route takes -- an airport's or a named fix's, two to five letters and
//! figures (points::kind) -- and its place either way; a user waypoint, or a
//! GPX point named in words, keeps only its place, which the host names off
//! the nearest fix as the pilot's own point ("VPBNG/095/14.2", frd_near),
//! as a point dropped on the map is. What a file says a point is (an .fpl's
//! waypoint-type, a GPX point's `type` or `sym`) is kept as its kind; the
//! host asks whether a field is open (field_status), never this.

use super::normal;
use super::points::{self, Kind};
use crate::json::{self, Value};
use crate::motion::track::js_number;
use crate::xml::{self, Element};

pub const NOT_A_ROUTE_FILE: &str = "This file is not a flight plan (.fpl) or a GPX route.";
pub const TOO_FEW: &str = "There is no route in this file: it needs two points at the least.";
pub const NO_PLACE: &str = "A point in this file has no place on the earth that can be read.";
pub const NOT_IN_TABLE: &str = "The flight plan's route names a waypoint its table does not have.";
pub const ENDS_UNNAMED: &str = "This route starts or ends at a point with no ident: a route here runs from a field to a field.";

/// What a file says one of its points is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PointKind {
    Airport,
    Navaid,
    /// An intersection, a VFR reporting point, or a GPX point named by an
    /// ident with no type.
    Fix,
    /// The pilot's own point: a user waypoint, or one named in words.
    User,
}

impl PointKind {
    fn key(self) -> &'static str {
        match self {
            PointKind::Airport => "airport",
            PointKind::Navaid => "navaid",
            PointKind::Fix => "fix",
            PointKind::User => "user",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct FilePoint {
    /// The ident the route takes it by, uppercase; None for a user point.
    pub ident: Option<String>,
    /// The file's own name for it where that is not the ident.
    pub name: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub kind: PointKind,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RouteFile {
    /// The route's name in the file, where it has one.
    pub name: Option<String>,
    pub points: Vec<FilePoint>,
}

fn place(lat: f64, lon: f64) -> Result<(f64, f64), &'static str> {
    let ok = lat.is_finite() && lon.is_finite() && lat.abs() <= 90.0 && lon.abs() <= 180.0;
    if ok {
        Ok((lat, lon))
    } else {
        Err(NO_PLACE)
    }
}

fn trimmed(text: Option<String>) -> Option<String> {
    text.map(|t| t.trim().to_owned()).filter(|t| !t.is_empty())
}

/// The ident a name is, where it is one the route takes as a fix's or a
/// field's: "kmsn" is KMSN, "Madison" (seven letters) is none.
fn ident_of(name: Option<&str>) -> Option<String> {
    let ident = normal(name?);
    (points::kind(&ident) == Some(Kind::Fix)).then_some(ident)
}

fn point(ident: Option<String>, name: Option<String>, lat: f64, lon: f64, kind: PointKind) -> FilePoint {
    // A user point keeps no ident: its identifier is the pilot's own word
    // ("USR001"), which no fix the planner knows answers to.
    let ident = if kind == PointKind::User { None } else { ident };
    let name = name.filter(|n| ident.as_deref() != Some(normal(n).as_str()));
    FilePoint { ident, name, lat, lon, kind }
}

/// FlightPlan v1's waypoint-type: AIRPORT, VOR, NDB, INT, INT-VRP, USER
/// WAYPOINT (the schema's WaypointType enumeration).
fn fpl_kind(text: &str) -> PointKind {
    match text.trim().to_ascii_uppercase().as_str() {
        "AIRPORT" => PointKind::Airport,
        "VOR" | "NDB" => PointKind::Navaid,
        "INT" | "INT-VRP" => PointKind::Fix,
        _ => PointKind::User,
    }
}

fn child_text(e: &Element, name: &str) -> Option<String> {
    trimmed(e.child(name).map(Element::all_text))
}

/// An .fpl: its route's points in order, each looked up in its
/// waypoint-table by identifier and type, as the schema keys them.
fn fpl(root: &Element) -> Result<RouteFile, &'static str> {
    let table: Vec<&Element> = root.child("waypoint-table").map(|t| t.all("waypoint").collect()).unwrap_or_default();
    let route = root.child("route").ok_or(TOO_FEW)?;
    let mut out = Vec::new();
    for rp in route.all("route-point") {
        let id = child_text(rp, "waypoint-identifier").unwrap_or_default();
        let kind = child_text(rp, "waypoint-type").unwrap_or_default();
        let wp = table
            .iter()
            .find(|w| child_text(w, "identifier").unwrap_or_default() == id && child_text(w, "type").unwrap_or_default() == kind)
            .ok_or(NOT_IN_TABLE)?;
        let at = |name| child_text(wp, name).map_or(f64::NAN, |t| js_number(&t));
        let (lat, lon) = place(at("lat"), at("lon"))?;
        let comment = child_text(wp, "comment");
        out.push(point(ident_of(Some(&id)), comment.or(Some(id.clone())), lat, lon, fpl_kind(&kind)));
    }
    Ok(RouteFile { name: child_text(route, "route-name"), points: out })
}

/// A GPX point's kind: an airport where its `type` or `sym` says so
/// (Garmin's symbol "Airport"), else a fix where its name is an ident.
fn gpx_point(e: &Element) -> Result<FilePoint, &'static str> {
    let at = |name| e.attribute(name).map_or(f64::NAN, js_number);
    let (lat, lon) = place(at("lat"), at("lon"))?;
    let name = child_text(e, "name");
    let ident = ident_of(name.as_deref());
    let said = [child_text(e, "type"), child_text(e, "sym")].into_iter().flatten().any(|t| t.to_ascii_lowercase().contains("airport"));
    let kind = match (&ident, said) {
        (None, _) => PointKind::User,
        (Some(_), true) => PointKind::Airport,
        (Some(_), false) => PointKind::Fix,
    };
    Ok(point(ident, name, lat, lon, kind))
}

fn gpx(root: &Element) -> Result<RouteFile, &'static str> {
    if let Some(rte) = root.child("rte") {
        let points = rte.all("rtept").map(gpx_point).collect::<Result<Vec<_>, _>>()?;
        return Ok(RouteFile { name: child_text(rte, "name"), points });
    }
    let points = root.all("wpt").map(gpx_point).collect::<Result<Vec<_>, _>>()?;
    let name = root.child("metadata").and_then(|m| child_text(m, "name"));
    Ok(RouteFile { name, points })
}

/// A route file read: Err with the words for the pilot where it is not
/// one, or has fewer than two points.
pub fn read(text: &str) -> Result<RouteFile, &'static str> {
    let root = xml::parse(text).map_err(|_| NOT_A_ROUTE_FILE)?;
    let file = match root.name.as_str() {
        "flight-plan" => fpl(&root)?,
        "gpx" => gpx(&root)?,
        _ => return Err(NOT_A_ROUTE_FILE),
    };
    if file.points.len() < 2 {
        return Err(TOO_FEW);
    }
    // The plan's ends are fields, named (the planner's dep and dest); a
    // user point between them is named off a fix by the host.
    if file.points.first().is_none_or(|p| p.ident.is_none()) || file.points.last().is_none_or(|p| p.ident.is_none()) {
        return Err(ENDS_UNNAMED);
    }
    Ok(file)
}

fn point_json(out: &mut String, p: &FilePoint) {
    out.push_str("{\"ident\":");
    json::opt_string(out, p.ident.as_deref());
    out.push_str(",\"name\":");
    json::opt_string(out, p.name.as_deref());
    out.push_str(",\"lat\":");
    json::number(out, p.lat);
    out.push_str(",\"lon\":");
    json::number(out, p.lon);
    out.push_str(",\"kind\":");
    json::string(out, p.kind.key());
    out.push('}');
}

/// `route_file_read`: {name, departure, destination, between} or {error},
/// from `{"text"}`, the file's text.
pub fn read_rule(v: &Value) -> Result<String, String> {
    let text = v.get("text").and_then(Value::as_str).ok_or("route_file_read: \"text\" is missing or not a string")?;
    let mut out = String::new();
    match read(text) {
        Err(words) => {
            out.push_str("{\"error\":");
            json::string(&mut out, words);
            out.push('}');
        }
        Ok(file) => {
            let (first, rest) = file.points.split_first().expect("two points at the least");
            let (last, between) = rest.split_last().expect("two points at the least");
            out.push_str("{\"name\":");
            json::opt_string(&mut out, file.name.as_deref());
            out.push_str(",\"departure\":");
            point_json(&mut out, first);
            out.push_str(",\"destination\":");
            point_json(&mut out, last);
            out.push_str(",\"between\":[");
            for (i, p) in between.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                point_json(&mut out, p);
            }
            out.push_str("]}");
        }
    }
    Ok(out)
}

#[cfg(test)]
#[path = "route_file_tests.rs"]
mod tests;
