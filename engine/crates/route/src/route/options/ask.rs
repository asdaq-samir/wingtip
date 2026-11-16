//! Route options' input as the planner sends it (wingtip.route_options):
//! the route, the airplane, and what the planner read for the grid -- the
//! ground and the shores at the cells' samples, the weather, the
//! advisories, the airspace, the winds aloft, the fields with fuel and
//! the fixes round the route. A source the planner could not read comes
//! as null, and the answer says it was not checked.

use super::grid::Area;
use crate::json::Value;
use wingtip_core::grid::Point;

/// The still-air speed the ways are costed at with no airplane (Profile).
pub const REFERENCE_TAS_KT: f64 = 100.0;

pub struct End {
    pub ident: String,
    pub at: Point,
}

/// The airplane, or none picked (`airplane` false): the ways are then the
/// route's own, costed in still air at REFERENCE_TAS_KT (which only orders
/// them and times the weather window), with no minutes, fuel or fuel
/// stops (the owner, 2026-11-09: "If no airplane is entered, only show
/// the distance and the things you can without airplane profile").
pub struct Profile {
    pub airplane: bool,
    pub tas_kt: f64,
    pub burn_gph: f64,
    /// None where not known: no figure is assumed (the owner, 2026-11-09).
    pub usable_gal: Option<f64>,
    pub taxi_gal: Option<f64>,
    pub ceiling_ft: Option<f64>,
}

/// A field's weather: a TAF's worst over the flight with every group's
/// weather in it, or a METAR.
pub struct Report {
    pub ident: String,
    pub lat: f64,
    pub lon: f64,
    pub wx: Vec<String>,
    pub ceiling_ft: Option<f64>,
    pub visibility_sm: Option<f64>,
    pub ceiling_unknown: bool,
}

/// A SIGMET or a G-AIRMET, as the AWC sends it.
pub struct Advisory {
    pub hazard: String,
    pub area: Area,
    pub points: usize,
    pub altitude_low_ft: Option<f64>,
    pub valid_from: Option<f64>,
    pub valid_to: Option<f64>,
    /// A G-AIRMET's snapshot time.
    pub valid: Option<f64>,
    pub raw: String,
}

/// A special-use airspace or a TFR.
pub struct Airspace {
    pub kind: String,
    pub name: String,
    pub area: Area,
}

pub struct Station {
    pub lat: f64,
    pub lon: f64,
    /// (from, kt) at each of the frame's cruising altitudes, None where
    /// the station gives none.
    pub winds: Vec<Option<(f64, f64)>>,
}

#[derive(Clone)]
pub struct Field {
    pub ident: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub runway_ft: f64,
    /// Somewhere to eat there; None where it was not read yet.
    pub food: Option<bool>,
}

#[derive(Clone)]
pub struct Fix {
    pub ident: String,
    pub lat: f64,
    pub lon: f64,
    pub navaid: bool,
    pub vfr: bool,
    pub kind: String,
    pub mag_var: Option<f64>,
}

pub struct Ask {
    pub dep: End,
    pub dest: End,
    pub profile: Profile,
    pub depart_s: f64,
    pub now_s: f64,
    pub min_ceiling_ft: Option<f64>,
    pub min_visibility_sm: Option<f64>,
    pub current: Option<Vec<Point>>,
    pub current_idents: Vec<String>,
    pub current_landed: Vec<bool>,
    pub filed: Option<(Vec<Point>, Vec<String>)>,
    /// Night at either end, where the host has already judged it; None,
    /// the engine judges it (wingtip_flight::sun) over the window.
    pub night: Option<bool>,
    pub terrain_ft: Option<Vec<f64>>,
    pub water_far: Option<Vec<bool>>,
    pub tafs: Option<Vec<Report>>,
    pub metars: Option<Vec<Report>>,
    pub sigmets: Option<Vec<Advisory>>,
    pub gairmets: Option<Vec<Advisory>>,
    pub sua: Option<Vec<Airspace>>,
    pub tfrs: Option<Vec<Airspace>>,
    pub winds: Vec<Station>,
    pub fields: Option<Vec<Field>>,
    pub food: bool,
    pub fixes: Vec<Fix>,
}

pub struct Reader<'a> {
    pub name: &'a str,
}

impl Reader<'_> {
    fn bad(&self, what: &str) -> String {
        format!("{}: {what}", self.name)
    }

    pub fn opt_num(&self, v: &Value, key: &str) -> Result<Option<f64>, String> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::Number(n)) => Ok(Some(*n)),
            Some(_) => Err(self.bad(&format!("\"{key}\" is not a number"))),
        }
    }

    pub fn num(&self, v: &Value, key: &str) -> Result<f64, String> {
        self.opt_num(v, key)?.ok_or_else(|| self.bad(&format!("\"{key}\" is missing")))
    }

    pub fn text(&self, v: &Value, key: &str) -> Result<String, String> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(String::new()),
            Some(Value::String(s)) => Ok(s.clone()),
            Some(_) => Err(self.bad(&format!("\"{key}\" is not a string"))),
        }
    }

    pub fn flag(&self, v: &Value, key: &str) -> Result<bool, String> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(false),
            Some(Value::Bool(b)) => Ok(*b),
            Some(_) => Err(self.bad(&format!("\"{key}\" is not true or false"))),
        }
    }

    /// A list, None where it is missing or null.
    pub fn opt_list<'v>(&self, v: &'v Value, key: &str) -> Result<Option<&'v [Value]>, String> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::Array(items)) => Ok(Some(items)),
            Some(_) => Err(self.bad(&format!("\"{key}\" is not a list"))),
        }
    }

    pub fn point(&self, v: &Value) -> Result<Point, String> {
        match v.as_array() {
            Some([lat, lon, ..]) => match (lat.as_f64(), lon.as_f64()) {
                (Some(lat), Some(lon)) => Ok((lat, lon)),
                _ => Err(self.bad("a point is not [lat, lon]")),
            },
            _ => Err(self.bad("a point is not [lat, lon]")),
        }
    }

    pub fn points(&self, v: &Value, key: &str) -> Result<Option<Vec<Point>>, String> {
        self.opt_list(v, key)?.map(|items| items.iter().map(|p| self.point(p)).collect()).transpose()
    }

    pub fn strings(&self, v: &Value, key: &str) -> Result<Vec<String>, String> {
        self.opt_list(v, key)?
            .unwrap_or(&[])
            .iter()
            .map(|s| s.as_str().map(str::to_owned).ok_or_else(|| self.bad(&format!("\"{key}\" holds a non-string"))))
            .collect::<Result<_, _>>()
    }

    pub fn end(&self, v: &Value, key: &str) -> Result<End, String> {
        let e = v.get(key).ok_or_else(|| self.bad(&format!("\"{key}\" is missing")))?;
        Ok(End { ident: self.text(e, "ident")?.to_uppercase(), at: (self.num(e, "lat")?, self.num(e, "lon")?) })
    }

    pub fn profile(&self, v: &Value) -> Result<Profile, String> {
        let p = match v.get("profile") {
            None | Some(Value::Null) => {
                return Ok(Profile {
                    airplane: false,
                    tas_kt: REFERENCE_TAS_KT,
                    burn_gph: 0.0,
                    usable_gal: None,
                    taxi_gal: None,
                    ceiling_ft: None,
                });
            }
            Some(p) => p,
        };
        Ok(Profile {
            airplane: true,
            tas_kt: self.num(p, "cruise_tas_kt")?,
            burn_gph: self.num(p, "fuel_burn_gph")?,
            usable_gal: self.opt_num(p, "usable_fuel_gal")?.filter(|g| *g > 0.0),
            taxi_gal: self.opt_num(p, "taxi_fuel_gal")?,
            ceiling_ft: self.opt_num(p, "service_ceiling_ft")?.filter(|c| *c > 0.0),
        })
    }

    /// Rings of [lat, lon]: `[[[lat, lon], ...], ...]`.
    pub fn rings(&self, v: &Value, key: &str) -> Result<Area, String> {
        let rings = self.opt_list(v, key)?.unwrap_or(&[]);
        Ok(Area {
            rings: rings
                .iter()
                .map(|ring| {
                    ring.as_array().ok_or_else(|| self.bad("a ring is not a list")).and_then(|r| r.iter().map(|p| self.point(p)).collect())
                })
                .collect::<Result<_, _>>()?,
        })
    }

    fn reports(&self, v: &Value, key: &str) -> Result<Option<Vec<Report>>, String> {
        self.opt_list(v, key)?
            .map(|items| {
                items
                    .iter()
                    .map(|r| {
                        let wx = match r.get("wx") {
                            Some(Value::String(s)) => vec![s.clone()],
                            Some(Value::Array(_)) => self.strings(r, "wx")?,
                            _ => Vec::new(),
                        };
                        Ok(Report {
                            ident: self.text(r, "ident")?,
                            lat: self.num(r, "lat")?,
                            lon: self.num(r, "lon")?,
                            wx,
                            ceiling_ft: self.opt_num(r, "ceiling_ft")?,
                            visibility_sm: self.opt_num(r, "visibility_sm")?,
                            ceiling_unknown: self.flag(r, "ceiling_unknown")?,
                        })
                    })
                    .collect()
            })
            .transpose()
    }

    fn advisories(&self, v: &Value, key: &str) -> Result<Option<Vec<Advisory>>, String> {
        self.opt_list(v, key)?
            .map(|items| {
                items
                    .iter()
                    .map(|a| {
                        let coords = self.points(a, "coords")?.unwrap_or_default();
                        Ok(Advisory {
                            hazard: self.text(a, "hazard")?,
                            points: coords.len(),
                            area: Area { rings: vec![coords] },
                            altitude_low_ft: self.opt_num(a, "altitude_low_ft")?,
                            valid_from: self.opt_num(a, "valid_from")?,
                            valid_to: self.opt_num(a, "valid_to")?,
                            valid: self.opt_num(a, "valid")?,
                            raw: self.text(a, "raw")?,
                        })
                    })
                    .collect()
            })
            .transpose()
    }

    fn airspace(&self, v: &Value, key: &str, kind_key: &str, name_key: &str) -> Result<Option<Vec<Airspace>>, String> {
        self.opt_list(v, key)?
            .map(|items| {
                items
                    .iter()
                    .map(|a| Ok(Airspace { kind: self.text(a, kind_key)?, name: self.text(a, name_key)?, area: self.rings(a, "rings")? }))
                    .collect()
            })
            .transpose()
    }

    pub fn fixes(&self, v: &Value, key: &str) -> Result<Vec<Fix>, String> {
        self.opt_list(v, key)?
            .unwrap_or(&[])
            .iter()
            .map(|f| {
                Ok(Fix {
                    ident: self.text(f, "ident")?,
                    lat: self.num(f, "lat")?,
                    lon: self.num(f, "lon")?,
                    navaid: self.flag(f, "navaid")?,
                    vfr: self.flag(f, "vfr")?,
                    kind: self.text(f, "kind")?,
                    mag_var: self.opt_num(f, "mag_var")?,
                })
            })
            .collect()
    }

    pub fn fields(&self, v: &Value, key: &str) -> Result<Option<Vec<Field>>, String> {
        self.opt_list(v, key)?
            .map(|items| {
                items
                    .iter()
                    .map(|f| {
                        Ok(Field {
                            ident: self.text(f, "ident")?,
                            name: self.text(f, "name")?,
                            lat: self.num(f, "lat")?,
                            lon: self.num(f, "lon")?,
                            runway_ft: self.opt_num(f, "runway_ft")?.unwrap_or(0.0),
                            food: match f.get("food") {
                                Some(Value::Bool(b)) => Some(*b),
                                _ => None,
                            },
                        })
                    })
                    .collect()
            })
            .transpose()
    }

    pub fn ask(&self, v: &Value) -> Result<Ask, String> {
        let filed = match v.get("filed") {
            None | Some(Value::Null) => None,
            Some(f) => Some((self.points(f, "points")?.unwrap_or_default(), self.strings(f, "idents")?)),
        };
        let numbers = |key: &str| -> Result<Option<Vec<f64>>, String> {
            self.opt_list(v, key)?.map(|items| items.iter().map(|x| Ok(x.as_f64().unwrap_or(0.0))).collect()).transpose()
        };
        let water_far = match v.get("water_far") {
            None | Some(Value::Null) => None,
            Some(Value::String(s)) => Some(s.bytes().map(|b| b == b'1').collect()),
            Some(_) => return Err(self.bad("\"water_far\" is not a string of 0 and 1")),
        };
        let winds = self
            .opt_list(v, "winds")?
            .unwrap_or(&[])
            .iter()
            .map(|s| {
                Ok(Station {
                    lat: self.num(s, "lat")?,
                    lon: self.num(s, "lon")?,
                    winds: self
                        .opt_list(s, "winds")?
                        .unwrap_or(&[])
                        .iter()
                        .map(|w| match w.as_array() {
                            Some([d, k, ..]) => d.as_f64().zip(k.as_f64()),
                            _ => None,
                        })
                        .collect(),
                })
            })
            .collect::<Result<_, String>>()?;
        Ok(Ask {
            dep: self.end(v, "dep")?,
            dest: self.end(v, "dest")?,
            profile: self.profile(v)?,
            depart_s: self.num(v, "depart_s")?,
            now_s: self.opt_num(v, "now_s")?.unwrap_or(self.num(v, "depart_s")?),
            min_ceiling_ft: self.opt_num(v, "min_ceiling_ft")?,
            min_visibility_sm: self.opt_num(v, "min_visibility_sm")?,
            current: self.points(v, "current")?.filter(|c| c.len() >= 2),
            current_idents: self.strings(v, "current_idents")?,
            current_landed: self.opt_list(v, "current_landed")?.unwrap_or(&[]).iter().map(|b| matches!(b, Value::Bool(true))).collect(),
            filed,
            night: match v.get("night") {
                None | Some(Value::Null) => None,
                Some(Value::Bool(b)) => Some(*b),
                Some(_) => return Err(self.bad("\"night\" is not true or false")),
            },
            terrain_ft: numbers("terrain_ft")?,
            water_far,
            tafs: self.reports(v, "tafs")?,
            metars: self.reports(v, "metars")?,
            sigmets: self.advisories(v, "sigmets")?,
            gairmets: self.advisories(v, "gairmets")?,
            sua: self.airspace(v, "sua", "type", "name")?,
            tfrs: self.airspace(v, "tfrs", "notam_id", "title")?,
            winds,
            fields: self.fields(v, "fields")?,
            food: self.flag(v, "food")?,
            fixes: self.fixes(v, "fixes")?,
        })
    }
}
