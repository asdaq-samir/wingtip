//! `runway_proximity`'s input read: own ship's fix, the field, its
//! runways as the planner's airport card sends them (`runways[].
//! runway_ends[]` with each threshold's place, NASR APT_RWY_END's
//! surveyed one, and `width_ft`, NASR APT_RWY's RWY_WIDTH), and the hot
//! spots placed from the diagram (route's `diagram_hot_spots`).

use super::{End, Field, Fix, HotSpot, Strip};
use crate::json::Value;
use wingtip_core::ask::{num_in, opt_num_in, opt_str_in, Ask};

/// Everything the advisor is asked with.
pub struct Asked {
    pub fix: Fix,
    pub field: Field,
    pub strips: Vec<Strip>,
    pub spots: Vec<HotSpot>,
}

/// The input read; a runway without both ends' places is left out (a
/// helipad, or one NASR and OurAirports place nowhere).
pub fn read(name: &str, v: &Value) -> Result<Asked, String> {
    let ask = Ask::new(name, v);
    let f = v.get("fix").ok_or_else(|| format!("{name}: \"fix\" is missing"))?;
    let fix = Fix {
        lat: num_in(name, f, "lat")?,
        lon: num_in(name, f, "lon")?,
        age_s: num_in(name, f, "age_s")?,
        accuracy_m: num_in(name, f, "accuracy_m")?,
        track_deg: opt_num_in(name, f, "track_deg")?,
        groundspeed_kt: opt_num_in(name, f, "groundspeed_kt")?,
        altitude_ft: opt_num_in(name, f, "altitude_ft")?,
    };
    let field = Field { elevation_ft: ask.opt_num("elevation_ft")?, pattern_agl_ft: ask.opt_num("pattern_agl_ft")? };
    let mut strips = Vec::new();
    for r in ask.list("runways")? {
        let ends = match r.get("runway_ends") {
            Some(Value::Array(ends)) => ends,
            _ => continue,
        };
        let placed: Vec<End> = ends
            .iter()
            .filter_map(|e| {
                let ident = opt_str_in(name, e, "ident").ok().flatten()?;
                let lat = opt_num_in(name, e, "lat").ok().flatten()?;
                let lon = opt_num_in(name, e, "lon").ok().flatten()?;
                Some(End { ident: ident.to_owned(), lat, lon })
            })
            .collect();
        if let [a, b] = placed.as_slice() {
            let closed = matches!(r.get("closed"), Some(Value::Bool(true)));
            strips.push(Strip { ends: [a.clone(), b.clone()], width_ft: opt_num_in(name, r, "width_ft")?, closed });
        }
    }
    let mut spots = Vec::new();
    if let Some(Value::Array(list)) = v.get("hot_spots") {
        for s in list {
            let name_of = opt_str_in(name, s, "name")?.unwrap_or("").to_owned();
            spots.push(HotSpot { name: name_of, lat: num_in(name, s, "lat")?, lon: num_in(name, s, "lon")? });
        }
    }
    Ok(Asked { fix, field, strips, spots })
}
