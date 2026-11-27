//! `fields_near`: which box of a phone's cycle packs to read for the
//! fields round the airplane when the planner cannot be reached (Nearest,
//! the emergency assistant, the on-device Ask), one rule for both phones,
//! which read different boxes before (the iPhone a fixed half degree, and
//! Android widening to two degrees and sorting the fields itself; round
//! 4's engine audit). The fields read are then ranked by `best_fields`.
//!
//! The phone asks with no box first and is given the first, half a degree
//! of latitude each way (about 30 nm, past a light single's still-air
//! glide from 10,000 ft above the ground: some 16 nm at 10 to 1); it reads
//! the packs there and asks again with how many fields it found. Too few
//! for `want`, and the box is doubled, to two degrees at most (about 120
//! nm); enough, or the widest read, and no box is given: rank what was
//! read. A box to read, not an aviation figure: what is a landing site,
//! and in what order, is best_fields'.

use crate::gonogo::calls::In;
use crate::json::{self, Value};

type R<T> = Result<T, String>;

const NAME: &str = "fields_near";

/// The first box's half height, degrees of latitude.
pub const FIRST_HALF_DEG: f64 = 0.5;
/// The widest box's, degrees of latitude.
pub const WIDEST_HALF_DEG: f64 = 2.0;
/// The cosine of the latitude a box's width is held to at most: a degree
/// of longitude is shorter by the latitude's cosine, and near the pole the
/// box would grow past any pack.
const COS_FLOOR: f64 = 0.2;

/// The half height of the next box to read, or None where the fields
/// found are enough or the box read was the widest.
pub fn next_half(half_deg: Option<f64>, found: Option<f64>, want: f64) -> Option<f64> {
    match half_deg {
        None => Some(FIRST_HALF_DEG),
        Some(h) if found.unwrap_or(0.0) >= want || h >= WIDEST_HALF_DEG => None,
        Some(h) => Some((h * 2.0).min(WIDEST_HALF_DEG)),
    }
}

/// `{at: {lat, lon}, want, half_deg, found}` answered with `{box}`: the
/// box to read next, `{south, west, north, east, half_deg}`, or null.
pub fn call(name: &str, v: &Value) -> R<String> {
    if name != NAME {
        return Err(format!("the engine has no rule called {name:?}"));
    }
    let i = In { name };
    let at = v.get("at").ok_or_else(|| format!("{NAME}: \"at\" is missing"))?;
    let (lat, lon) = (i.num(at, "lat")?, i.num(at, "lon")?);
    let want = i.num(v, "want")?;
    let half = next_half(i.opt_num(v, "half_deg")?, i.opt_num(v, "found")?, want);
    let mut out = String::from("{\"box\":");
    match half {
        None => out.push_str("null"),
        Some(h) => {
            let across = h / lat.to_radians().cos().max(COS_FLOOR);
            for (n, (key, x)) in
                [("south", lat - h), ("west", lon - across), ("north", lat + h), ("east", lon + across), ("half_deg", h)].iter().enumerate()
            {
                out.push_str(if n == 0 { "{\"" } else { ",\"" });
                out.push_str(key);
                out.push_str("\":");
                json::number(&mut out, *x);
            }
            out.push('}');
        }
    }
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_box_widens_until_it_holds_enough_or_is_the_widest() {
        assert_eq!(next_half(None, None, 5.0), Some(0.5));
        assert_eq!(next_half(Some(0.5), Some(2.0), 5.0), Some(1.0));
        assert_eq!(next_half(Some(0.5), Some(5.0), 5.0), None);
        assert_eq!(next_half(Some(1.0), Some(0.0), 5.0), Some(2.0));
        assert_eq!(next_half(Some(2.0), Some(0.0), 5.0), None);
    }
}
