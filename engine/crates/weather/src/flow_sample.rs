//! Model Weather's reading at a point: the value of one frame's picture
//! of a field (the weather service's app.flow_grid, served by the planner
//! as /api/weather/flow/{frame}/{field}.png) where a pilot taps, or at
//! their position and favourites. The one reading of those pictures: the
//! web's bubble and pins ask it (features/weather-flow/flowTexture), and
//! the phones' FlowGrid are to, so the same point reads the same knots on
//! each.
//!
//! The picture, as app.flow_grid writes it: a latitude-longitude grid,
//! north row first, over `bounds` [west, south, east, north], its pixels'
//! outer edges (flow_grid BOUNDS: the grid's first and last points less
//! and plus half its STEP_DEG), so each pixel's value stands at its
//! middle; the value in red, a 255th of its field's `unscale` range a
//! step, the wind's east part in red and its north part in green, and
//! alpha 0 where the model gave none.
//!
//! Two rules, as an app holds the picture and the engine only the method:
//! `flow_cell`, the four pixels round a point and how far between them it
//! is, and `flow_sample`, the value read from those four. Read between
//! the four linearly (bilinear), as weatherlayers-gl reads with LINEAR
//! interpolation; the wind's east and north parts each so, and its speed
//! and direction from those, which is the wind a vector average gives (in
//! shear, an average of the speeds would read a wind where the parts
//! cancel). None where a pixel the point is read from has no value: no
//! figure is made up at the edge of the model's data.

use crate::json::{self, Value};

/// The four pixels round a point, by index in the picture (row by row
/// from the north): the north-west, north-east, south-west and south-east
/// of it, and how far east (`fx`) and south (`fy`) of the first it is,
/// each 0 to 1.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cell {
    pub pixels: [usize; 4],
    pub fx: f64,
    pub fy: f64,
}

/// The cell a point (lat, lon) is read from, or None off the picture.
/// A point within half a pixel of the edge reads the edge's pixels.
pub fn cell(bounds: [f64; 4], width: usize, height: usize, lat: f64, lon: f64) -> Option<Cell> {
    let [west, south, east, north] = bounds;
    if width == 0 || height == 0 || east <= west || north <= south || !(west..=east).contains(&lon) || !(south..=north).contains(&lat) {
        return None;
    }
    // The pixel's place, fractional, its middle at a whole number.
    let x = (lon - west) / (east - west) * width as f64 - 0.5;
    let y = (north - lat) / (north - south) * height as f64 - 0.5;
    let x0 = (x.floor().max(0.0) as usize).min(width - 1);
    let y0 = (y.floor().max(0.0) as usize).min(height - 1);
    let (x1, y1) = ((x0 + 1).min(width - 1), (y0 + 1).min(height - 1));
    Some(Cell {
        pixels: [y0 * width + x0, y0 * width + x1, y1 * width + x0, y1 * width + x1],
        fx: (x - x0 as f64).clamp(0.0, 1.0),
        fy: (y - y0 as f64).clamp(0.0, 1.0),
    })
}

/// A pixel's red, green and alpha bytes.
pub type Pixel = [f64; 3];

/// A reading: the value (the wind's speed) in the field's unit, and for
/// the wind the direction it blows from, degrees true (None for a calm).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Reading {
    pub value: f64,
    pub from_deg: Option<f64>,
}

/// The value read from a cell's four pixels (module note), or None where
/// one it is read from has none.
pub fn sample(pixels: [Pixel; 4], fx: f64, fy: f64, unscale: [f64; 2], vector: bool) -> Option<Reading> {
    let weights = [(1.0 - fx) * (1.0 - fy), fx * (1.0 - fy), (1.0 - fx) * fy, fx * fy];
    if pixels.iter().zip(weights).any(|(p, w)| w > 0.0 && p[2] <= 0.0) {
        return None;
    }
    let channel = |c: usize| {
        let byte: f64 = pixels.iter().zip(weights).filter(|(_, w)| *w > 0.0).map(|(p, w)| p[c] * w).sum();
        unscale[0] + byte * (unscale[1] - unscale[0]) / 255.0
    };
    if !vector {
        return Some(Reading { value: channel(0), from_deg: None });
    }
    let (east, north) = (channel(0), channel(1));
    // From where the parts carry the air, turned round.
    let from_deg = (east != 0.0 || north != 0.0).then(|| (-east).atan2(-north).to_degrees().rem_euclid(360.0));
    Some(Reading { value: east.hypot(north), from_deg })
}

fn number(name: &str, v: &Value, key: &str) -> Result<f64, String> {
    v.get(key).and_then(Value::as_f64).filter(|f| f.is_finite()).ok_or_else(|| format!("{name}: \"{key}\" is not a number"))
}

fn numbers<const N: usize>(name: &str, v: Option<&Value>, what: &str) -> Result<[f64; N], String> {
    let bad = || format!("{name}: \"{what}\" is not {N} numbers");
    let list = v.and_then(Value::as_array).filter(|l| l.len() == N).ok_or_else(bad)?;
    let mut out = [0.0; N];
    for (o, item) in out.iter_mut().zip(list) {
        *o = item.as_f64().filter(|f| f.is_finite()).ok_or_else(bad)?;
    }
    Ok(out)
}

fn size(name: &str, v: &Value, key: &str) -> Result<usize, String> {
    let n = number(name, v, key)?;
    if n < 0.0 || n.fract() != 0.0 {
        return Err(format!("{name}: \"{key}\" is not a whole number"));
    }
    Ok(n as usize)
}

/// `flow_cell`: `{"bounds", "width", "height", "lat", "lon"}` to
/// `{"pixels", "fx", "fy"}` or null; `flow_sample`: `{"pixels": [[r, g,
/// a] x 4], "fx", "fy", "unscale", "vector"}` to `{"value", "from_deg"}`
/// or null.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let mut out = String::new();
    match name {
        "flow_cell" => {
            let bounds = numbers::<4>(name, v.get("bounds"), "bounds")?;
            let found = cell(bounds, size(name, v, "width")?, size(name, v, "height")?, number(name, v, "lat")?, number(name, v, "lon")?);
            let Some(c) = found else { return Ok("null".to_owned()) };
            out.push_str("{\"pixels\":[");
            out.push_str(&c.pixels.map(|p| p.to_string()).join(","));
            out.push_str("],\"fx\":");
            json::number(&mut out, c.fx);
            out.push_str(",\"fy\":");
            json::number(&mut out, c.fy);
            out.push('}');
        }
        "flow_sample" => {
            let list = v.get("pixels").and_then(Value::as_array).filter(|l| l.len() == 4);
            let list = list.ok_or_else(|| format!("{name}: \"pixels\" is not four pixels"))?;
            let mut pixels = [[0.0; 3]; 4];
            for (p, item) in pixels.iter_mut().zip(list) {
                *p = numbers::<3>(name, Some(item), "pixels")?;
            }
            let fx = number(name, v, "fx")?.clamp(0.0, 1.0);
            let fy = number(name, v, "fy")?.clamp(0.0, 1.0);
            let unscale = numbers::<2>(name, v.get("unscale"), "unscale")?;
            let vector = matches!(v.get("vector"), Some(Value::Bool(true)));
            let Some(r) = sample(pixels, fx, fy, unscale, vector) else { return Ok("null".to_owned()) };
            out.push_str("{\"value\":");
            json::number(&mut out, r.value);
            out.push_str(",\"from_deg\":");
            json::opt_number(&mut out, r.from_deg);
            out.push('}');
        }
        _ => return Err(format!("{name}: not a flow rule")),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 4 by 2 picture over 0 to 4 east, 0 to 2 north: pixel middles at
    /// half degrees.
    const BOUNDS: [f64; 4] = [0.0, 0.0, 4.0, 2.0];

    #[test]
    fn a_point_is_read_from_the_four_pixel_middles_round_it() {
        // 1.0 E, 1.25 N: half way between columns 0 and 1, a quarter of the
        // way from row 0 (1.5 N) to row 1 (0.5 N).
        assert_eq!(cell(BOUNDS, 4, 2, 1.25, 1.0), Some(Cell { pixels: [0, 1, 4, 5], fx: 0.5, fy: 0.25 }));
        // On a pixel's middle, all its own.
        assert_eq!(cell(BOUNDS, 4, 2, 1.5, 0.5), Some(Cell { pixels: [0, 1, 4, 5], fx: 0.0, fy: 0.0 }));
        // Within half a pixel of the edge, the edge's pixel.
        assert_eq!(cell(BOUNDS, 4, 2, 0.1, 3.9).map(|c| c.pixels), Some([7, 7, 7, 7]));
        assert_eq!(cell(BOUNDS, 4, 2, 2.1, 1.0), None);
    }

    #[test]
    fn the_wind_is_the_average_of_its_parts_not_of_its_speeds() {
        // Unscaled -50 to 50 kt: byte 0 is -50, 255 is 50. A westerly of
        // 50 kt beside an easterly of 50 kt, read half way: calm, where an
        // average of the speeds reads 50.
        let (west, east) = ([255.0, 127.5, 255.0], [0.0, 127.5, 255.0]);
        let r = sample([west, east, west, east], 0.5, 0.0, [-50.0, 50.0], true).unwrap();
        assert!(r.value.abs() < 1e-9 && r.from_deg.is_none());
        // A wind from the west, 50 kt: blowing east.
        let r = sample([west; 4], 0.3, 0.6, [-50.0, 50.0], true).unwrap();
        assert!((r.value - 50.0).abs() < 1e-9 && (r.from_deg.unwrap() - 270.0).abs() < 1e-9);
        // From the north: the north part negative.
        let r = sample([[127.5, 0.0, 255.0]; 4], 0.0, 0.0, [-50.0, 50.0], true).unwrap();
        assert!(r.from_deg.unwrap().abs() < 1e-9);
    }

    #[test]
    fn a_scalar_is_read_linearly_and_none_where_a_pixel_has_none() {
        let p = |red: f64, alpha: f64| [red, 0.0, alpha];
        let r = sample([p(0.0, 255.0), p(255.0, 255.0), p(0.0, 255.0), p(255.0, 255.0)], 0.25, 0.5, [0.0, 100.0], false).unwrap();
        assert!((r.value - 25.0).abs() < 1e-9 && r.from_deg.is_none());
        let none = p(0.0, 0.0);
        assert_eq!(sample([p(0.0, 255.0), none, p(0.0, 255.0), none], 0.25, 0.5, [0.0, 100.0], false), None);
        // A pixel the point is not read from at all does not count.
        assert!(sample([p(0.0, 255.0), none, p(0.0, 255.0), none], 0.0, 0.5, [0.0, 100.0], false).is_some());
    }

    #[test]
    fn the_rules_answer_their_contracts() {
        let c = json::parse(r#"{"bounds":[0,0,4,2],"width":4,"height":2,"lat":1.25,"lon":1}"#).unwrap();
        assert_eq!(call("flow_cell", &c).unwrap(), r#"{"pixels":[0,1,4,5],"fx":0.5,"fy":0.25}"#);
        let s =
            json::parse(r#"{"pixels":[[0,0,255],[255,0,255],[0,0,255],[255,0,255]],"fx":0.25,"fy":0.5,"unscale":[0,100],"vector":false}"#)
                .unwrap();
        assert_eq!(call("flow_sample", &s).unwrap(), r#"{"value":25.0,"from_deg":null}"#);
        assert!(call("flow_sample", &json::parse(r#"{"pixels":[]}"#).unwrap()).is_err());
    }
}
