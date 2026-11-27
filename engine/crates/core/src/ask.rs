//! A rule's input as each crate's `call` reads it: a JSON object asked by
//! its rule's name, each complaint naming the rule and the member, so a
//! host is told "holding: \"heading\" is missing" rather than a panic. One
//! copy for every crate's dispatch (engine/facade/src/call.rs looks the
//! name up; the crate's own function reads the input with this).

use crate::json::{self, Value};

/// The input of one call, read with the rule's name in each complaint.
pub struct Ask<'a> {
    pub name: &'a str,
    pub v: &'a Value,
}

impl<'a> Ask<'a> {
    pub fn new(name: &'a str, v: &'a Value) -> Self {
        Ask { name, v }
    }

    /// A number, or None where it is missing or null.
    pub fn opt_num(&self, key: &str) -> Result<Option<f64>, String> {
        opt_num_in(self.name, self.v, key)
    }

    /// A number that must be there.
    pub fn num(&self, key: &str) -> Result<f64, String> {
        num_in(self.name, self.v, key)
    }

    /// A string that must be there.
    pub fn str(&self, key: &str) -> Result<&'a str, String> {
        self.v.get(key).and_then(Value::as_str).ok_or_else(|| format!("{}: \"{key}\" is missing or not a string", self.name))
    }

    /// A string, "" where it is missing or null.
    pub fn opt_str(&self, key: &str) -> Result<&'a str, String> {
        match self.v.get(key) {
            None | Some(Value::Null) => Ok(""),
            Some(Value::String(s)) => Ok(s),
            Some(_) => Err(format!("{}: \"{key}\" is not a string", self.name)),
        }
    }

    /// True or false, false where it is missing or null.
    pub fn opt_bool(&self, key: &str) -> Result<bool, String> {
        match self.v.get(key) {
            None | Some(Value::Null) => Ok(false),
            Some(Value::Bool(b)) => Ok(*b),
            Some(_) => Err(format!("{}: \"{key}\" is not true or false", self.name)),
        }
    }

    /// A list that must be there.
    pub fn list(&self, key: &str) -> Result<&'a [Value], String> {
        list_in(self.name, self.v, key)
    }
}

/// Member `key` of `v` as a list that must be there.
pub fn list_in<'a>(name: &str, v: &'a Value, key: &str) -> Result<&'a [Value], String> {
    v.get(key).and_then(Value::as_array).ok_or_else(|| format!("{name}: \"{key}\" is missing or not a list"))
}

/// Member `key` of `v` as a list, empty where missing or null.
pub fn opt_list_in<'a>(name: &str, v: &'a Value, key: &str) -> Result<&'a [Value], String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(format!("{name}: \"{key}\" is not a list")),
    }
}

/// Member `key` of `v` as a number, None where missing or null.
pub fn opt_num_in(name: &str, v: &Value, key: &str) -> Result<Option<f64>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

/// Member `key` of `v` as a number that must be there.
pub fn num_in(name: &str, v: &Value, key: &str) -> Result<f64, String> {
    opt_num_in(name, v, key)?.ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

/// Member `key` of `v` as a string, None where missing or null.
pub fn opt_str_in<'a>(name: &str, v: &'a Value, key: &str) -> Result<Option<&'a str>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a string")),
    }
}

/// Polygons, each its outer ring then its holes, each ring [(lon, lat), ...].
pub type Polygons = Vec<Vec<Vec<(f64, f64)>>>;

/// `v` read as polygons, `[[[[lon, lat], ...], ...], ...]` (GeoJSON's
/// MultiPolygon coordinates), `bad`'s complaint where it is not: the one
/// reader for airspace's TFR shapes and altitude's congested areas.
pub fn polygons(v: &Value, bad: &dyn Fn() -> String) -> Result<Polygons, String> {
    let ring = |ring: &Value| -> Result<Vec<(f64, f64)>, String> {
        ring.as_array()
            .ok_or_else(bad)?
            .iter()
            .map(|p| match p.as_array() {
                Some([x, y]) => Ok((x.as_f64().ok_or_else(bad)?, y.as_f64().ok_or_else(bad)?)),
                _ => Err(bad()),
            })
            .collect()
    };
    v.as_array().ok_or_else(bad)?.iter().map(|rings| rings.as_array().ok_or_else(bad)?.iter().map(ring).collect()).collect()
}

/// A list of strings as a JSON array.
pub fn strings(out: &mut String, items: &[String]) {
    out.push('[');
    for (i, s) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(out, s);
    }
    out.push(']');
}
