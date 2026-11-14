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
//! is, and `flow_sample`, the value read from those four. The wind and
//! the temperature are read between the four linearly (bilinear), as
//! weatherlayers-gl reads with LINEAR interpolation; the wind's east and
//! north parts each so, and its speed and direction from those, which is
//! the wind a vector average gives (in shear, an average of the speeds
//! would read a wind where the parts cancel). Every field with a worse
//! end is read as the worst of the four instead (`Field::named`): a pilot
//! is never told better weather than the data holds. None where a pixel
//! the point is read from has no value: no figure is made up at the edge
//! of the model's data.

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

/// A wind under this, knots, is calm: FMH-1 (FCM-H1-2019) Table 5-1,
/// "Estimating Wind Speed", gives "<1" knot as "Calm; smoke rises
/// vertically", and 5.5.2: "When no motion of air is detected, the wind
/// shall be reported as calm", coded "00000KT" (12.6.5 d), no direction.
/// The wind field is in knots (app.flow_grid's "wind", -100 to 100 kt a
/// part), a 255th of 200 kt a step, so a calm's parts read about 0.4 kt
/// from a direction that is only the bytes' rounding: under a knot the
/// reading says calm and gives no direction, as a report would.
pub const CALM_BELOW_KT: f64 = 1.0;

/// The ceiling's picture (app.flow_grid's "ceiling", feet above the
/// ground: 14 CFR 1.1's ceiling is "the height above the earth's surface
/// of the lowest layer of clouds or obscuring phenomena that is reported
/// as broken, overcast, or obscuration") holds 0 to 12,750 ft, 50 ft a
/// step, and writes a ceiling at or over its top, and none at all (the
/// GFS's 20,000 m, the HRRR's missing value), as the top. Either is no
/// ceiling the categories turn on: AIM 7-1-7's highest bound is "VFR.
/// Ceiling greater than 3,000 feet", well under 12,750. So a reading
/// within half a step of the top is no ceiling, and any other is rounded
/// to the step, as the picture holds nothing finer: a 25 ft figure from
/// reading between two pixels would claim a precision the model's ceiling,
/// a diagnosis from its cloud, never had.
fn ceiling(value: f64, unscale: [f64; 2]) -> (f64, bool) {
    let step = (unscale[1] - unscale[0]) / 255.0;
    let none = value >= unscale[1] - step / 2.0;
    let rounded = if step > 0.0 { unscale[0] + ((value - unscale[0]) / step).round() * step } else { value };
    (rounded, none)
}

/// A reading: the value (the wind's speed) in the field's unit, and for
/// the wind the direction it blows from, degrees true, and whether it is
/// calm (CALM_BELOW_KT), when it has no direction; for the ceiling,
/// whether there is none (`ceiling`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Reading {
    pub value: f64,
    pub from_deg: Option<f64>,
    pub calm: bool,
    pub no_ceiling: bool,
}

/// What a picture holds: a plain value read between its pixels, the
/// wind's two parts, the ceiling (`ceiling`), whose top is none, or a
/// plain value read as its worst: the lowest (`Least`) or the highest
/// (`Most`) of the pixels round the point.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Field {
    Scalar,
    Vector,
    Ceiling,
    Least,
    Most,
}

impl Field {
    /// The field app.flow_grid names (its FIELDS), as the picture's file
    /// is named, other than the wind, which `vector` says. Where the four
    /// differ a straight line reads a figure no pixel holds, better than
    /// the worst, so a field with a worse end reads that end (sources read
    /// from the FAA's AIM and the eCFR 2026-11-12). The lowest: the
    /// ceiling and visibility, on which AIM 7-1-7's categories step ("LIFR
    /// (Low IFR). Ceiling less than 500 feet and/or visibility less than 1
    /// mile"; a 500 ft ceiling beside none, the top, reads about 6,600 ft
    /// half way, VFR beside LIFR), and the freezing level: AIM 7-1-19, "A
    /// pilot can expect icing when flying in visible precipitation ... and
    /// the temperature is between +02 and -10 degrees Celsius", so the
    /// lower the freezing level the lower icing begins, and its picture is
    /// already the lowest freezing level in the column (freezing_level_ft).
    /// The highest: icing's categories (AIM 7-1-19, trace to severe: none
    /// beside heavy reads moderate between, a category neither holds);
    /// turbulence (AIM 7-1-21's TBL 7-1-21, light to extreme); the
    /// precipitation (AIM 7-1-12: "LIGHT" (< 26 dBZ) to "EXTREME" (> 50
    /// dBZ)); CAPE and gusts; the cloud cover, whose eighths step from
    /// "ScaTtered 3/8-4/8" to "BroKeN 5/8-7/8" (AIM 7-1-28), a ceiling
    /// (14 CFR 1.1); and the cloud tops, which a pilot reads to clear,
    /// 14 CFR 91.155(a) asking "1,000 feet above" them in Class C, D and
    /// E, where a lower top is never the hazard, and each cell's is its
    /// highest already (app.flow_awc), as icing's and turbulence's are
    /// (app.flow_grid WORST). The wind and the temperature, continuous,
    /// read between.
    pub fn named(name: &str) -> Field {
        match name {
            "ceiling" => Field::Ceiling,
            "vis" | "frzlvl" => Field::Least,
            "gust" | "precip" | "cape" | "cloud" | "tops" | "icing" | "turb" => Field::Most,
            _ => Field::Scalar,
        }
    }
}

/// The value read from a cell's four pixels (module note), or None where
/// one it is read from has none. The pixels a point is read from are
/// those with a weight: all four between their middles, one on a pixel's
/// own middle, as that pixel's value is the model's there.
pub fn sample(pixels: [Pixel; 4], fx: f64, fy: f64, unscale: [f64; 2], field: Field) -> Option<Reading> {
    let weights = [(1.0 - fx) * (1.0 - fy), fx * (1.0 - fy), (1.0 - fx) * fy, fx * fy];
    if pixels.iter().zip(weights).any(|(p, w)| w > 0.0 && p[2] <= 0.0) {
        return None;
    }
    let read = || pixels.iter().zip(weights).filter(|(_, w)| *w > 0.0);
    let unscaled = |byte: f64| unscale[0] + byte * (unscale[1] - unscale[0]) / 255.0;
    let channel = |c: usize| unscaled(read().map(|(p, w)| p[c] * w).sum());
    // The worst of the pixels read (Field::named), the lowest or the
    // highest, so a ceiling is none only where every one is at the top.
    let lowest = || read().map(|(p, _)| unscaled(p[0])).fold(f64::INFINITY, f64::min);
    let highest = || read().map(|(p, _)| unscaled(p[0])).fold(f64::NEG_INFINITY, f64::max);
    let plain = |value| Some(Reading { value, from_deg: None, calm: false, no_ceiling: false });
    match field {
        Field::Scalar => return plain(channel(0)),
        Field::Least => return plain(lowest()),
        Field::Most => return plain(highest()),
        Field::Ceiling => {
            let (value, no_ceiling) = ceiling(lowest(), unscale);
            return Some(Reading { value, from_deg: None, calm: false, no_ceiling });
        }
        Field::Vector => {}
    }
    let (east, north) = (channel(0), channel(1));
    let speed = east.hypot(north);
    let calm = speed < CALM_BELOW_KT;
    // From where the parts carry the air, turned round; none for a calm.
    let from_deg = (!calm).then(|| (-east).atan2(-north).to_degrees().rem_euclid(360.0));
    Some(Reading { value: speed, from_deg, calm, no_ceiling: false })
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
/// a] x 4], "fx", "fy", "unscale", "vector", "ceiling"?, "field"?}` to
/// `{"value", "from_deg", "calm", "no_ceiling"}` or null.
#[cfg_attr(target_arch = "wasm32", inline(always))]
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
            let named = v.get("field").and_then(Value::as_str).map_or(Field::Scalar, Field::named);
            let field = match (v.get("vector"), v.get("ceiling")) {
                (Some(Value::Bool(true)), _) => Field::Vector,
                (_, Some(Value::Bool(true))) => Field::Ceiling,
                _ => named,
            };
            let Some(r) = sample(pixels, fx, fy, unscale, field) else { return Ok("null".to_owned()) };
            out.push_str("{\"value\":");
            json::number(&mut out, r.value);
            out.push_str(",\"from_deg\":");
            json::opt_number(&mut out, r.from_deg);
            out.push_str(if r.calm { ",\"calm\":true" } else { ",\"calm\":false" });
            out.push_str(if r.no_ceiling { ",\"no_ceiling\":true}" } else { ",\"no_ceiling\":false}" });
        }
        _ => return Err(format!("{name}: not a flow rule")),
    }
    Ok(out)
}

#[cfg(test)]
#[path = "flow_sample_tests.rs"]
mod tests;
