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
//! is, and `flow_sample`, the value read from those four. A continuous
//! field (the wind, the temperature and the rest) is read between the
//! four linearly (bilinear), as weatherlayers-gl reads with LINEAR
//! interpolation; the wind's east and north parts each so, and its speed
//! and direction from those, which is the wind a vector average gives (in
//! shear, an average of the speeds would read a wind where the parts
//! cancel). The ceiling and the visibility, where lower is worse, are
//! read as the worst of the four instead (`Field::named`): a pilot is
//! never told better weather than the data holds. None where a pixel the
//! point is read from has no value: no figure is made up at the edge of
//! the model's data.

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
/// plain value where lower is worse (`Least`, the visibility).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Field {
    Scalar,
    Vector,
    Ceiling,
    Least,
}

impl Field {
    /// The field app.flow_grid names (its FIELDS), as the picture's file
    /// is named, other than the wind, which `vector` says. Read as the
    /// worst of the four pixels round the point, the lowest, are the two
    /// fields AIM 7-1-7's categories turn on, where lower is worse: "LIFR (Low IFR). Ceiling less than 500 feet and/or
    /// visibility less than 1 mile ... VFR. Ceiling greater than 3,000
    /// feet and visibility greater than 5 miles" (read from the FAA's AIM
    /// page 2026-11-12). Each is a step where the four differ, not a slope:
    /// a 500 ft ceiling beside none (the picture's top, 12,750 ft) reads
    /// about 6,600 ft half way between them, VFR beside an LIFR cell, a
    /// figure neither pixel holds; and the picture's top is not a height
    /// at all but a ceiling over it or none (`ceiling`), and the
    /// visibility's 10 SM its "10 or more" (app.flow_grid clips to its
    /// `unscale`). The weather service keeps a cell's ceiling as its
    /// lowest too (app.flow_grid's cells). Every other field reads between
    /// its pixels: the wind and the temperature are continuous, the
    /// freezing level an isotherm's height with no category bound on it,
    /// the cloud tops, CAPE, gusts, precipitation, icing and turbulence
    /// higher where worse, which a straight-line reading never takes over
    /// the highest of the four.
    pub fn named(name: &str) -> Field {
        match name {
            "ceiling" => Field::Ceiling,
            "vis" => Field::Least,
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
    // The lowest of the pixels read (Field::named), so a ceiling is no
    // ceiling only where every one of them is at the top.
    let worst = || unscaled(read().map(|(p, _)| p[0]).fold(f64::INFINITY, f64::min));
    let plain = |value| Some(Reading { value, from_deg: None, calm: false, no_ceiling: false });
    match field {
        Field::Scalar => return plain(channel(0)),
        Field::Least => return plain(worst()),
        Field::Ceiling => {
            let (value, no_ceiling) = ceiling(worst(), unscale);
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
        let r = sample([west, east, west, east], 0.5, 0.0, [-50.0, 50.0], Field::Vector).unwrap();
        assert!(r.value.abs() < 1e-9 && r.from_deg.is_none() && r.calm);
        // A wind from the west, 50 kt: blowing east.
        let r = sample([west; 4], 0.3, 0.6, [-50.0, 50.0], Field::Vector).unwrap();
        assert!((r.value - 50.0).abs() < 1e-9 && (r.from_deg.unwrap() - 270.0).abs() < 1e-9 && !r.calm);
        // From the north: the north part negative.
        let r = sample([[127.5, 0.0, 255.0]; 4], 0.0, 0.0, [-50.0, 50.0], Field::Vector).unwrap();
        assert!(r.from_deg.unwrap().abs() < 1e-9);
    }

    #[test]
    fn under_a_knot_is_calm_with_no_direction() {
        // The weather service's wind picture, -100 to 100 kt a part: byte
        // 128 is 0.39 kt, the nearest a calm's parts come to nothing.
        let r = sample([[128.0, 128.0, 255.0]; 4], 0.0, 0.0, [-100.0, 100.0], Field::Vector).unwrap();
        assert!(r.value > 0.5 && r.value < CALM_BELOW_KT && r.calm && r.from_deg.is_none(), "{r:?}");
        // A knot is not calm (FMH-1 Table 5-1: 1-3 kt, smoke drifts).
        let r = sample([[127.5, 127.5 - 255.0 / 200.0, 255.0]; 4], 0.0, 0.0, [-100.0, 100.0], Field::Vector).unwrap();
        assert!((r.value - 1.0).abs() < 1e-9 && !r.calm && r.from_deg.unwrap().abs() < 1e-9, "{r:?}");
    }

    #[test]
    fn a_scalar_is_read_linearly_and_none_where_a_pixel_has_none() {
        let p = |red: f64, alpha: f64| [red, 0.0, alpha];
        let r = sample([p(0.0, 255.0), p(255.0, 255.0), p(0.0, 255.0), p(255.0, 255.0)], 0.25, 0.5, [0.0, 100.0], Field::Scalar).unwrap();
        assert!((r.value - 25.0).abs() < 1e-9 && r.from_deg.is_none());
        let none = p(0.0, 0.0);
        assert_eq!(sample([p(0.0, 255.0), none, p(0.0, 255.0), none], 0.25, 0.5, [0.0, 100.0], Field::Scalar), None);
        // A pixel the point is not read from at all does not count.
        assert!(sample([p(0.0, 255.0), none, p(0.0, 255.0), none], 0.0, 0.5, [0.0, 100.0], Field::Scalar).is_some());
    }

    #[test]
    fn the_ceiling_is_none_at_its_pictures_top_and_rounded_to_its_step() {
        // app.flow_grid's ceiling: 0 to 12,750 ft, 50 ft a step.
        let top = [0.0, 12_750.0];
        let at = |red: f64, fx: f64| {
            sample([[red, 0.0, 255.0], [red + 1.0, 0.0, 255.0], [red, 0.0, 255.0], [red + 1.0, 0.0, 255.0]], fx, 0.0, top, Field::Ceiling)
                .unwrap()
        };
        // The top byte: a ceiling over 12,750 ft or none, either no ceiling.
        let r = sample([[255.0, 0.0, 255.0]; 4], 0.0, 0.0, top, Field::Ceiling).unwrap();
        assert!(r.no_ceiling && r.value == 12_750.0, "{r:?}");
        // The step under the top is a ceiling, and so is any point read
        // from it and the top: only the top everywhere is none.
        let r = at(254.0, 0.0);
        assert!(!r.no_ceiling && r.value == 12_700.0, "{r:?}");
        let r = at(254.0, 0.5);
        assert!(!r.no_ceiling && r.value == 12_700.0, "{r:?}");
        // AIM 7-1-7's MVFR bound, 3,000 ft (byte 60), reads as itself
        // wherever the point is between it and 3,050: the lower.
        assert_eq!(at(60.0, 0.25).value, 3_000.0);
        assert_eq!(at(60.0, 0.75).value, 3_000.0);
        // On 3,050's own middle, its own value: the pixel read is that one.
        assert_eq!(at(60.0, 1.0).value, 3_050.0);
        // A plain field is never a ceiling, nor rounded.
        assert!(!sample([[255.0, 0.0, 255.0]; 4], 0.0, 0.0, top, Field::Scalar).unwrap().no_ceiling);
    }

    #[test]
    fn the_ceiling_is_the_lowest_round_the_point_never_a_height_between() {
        // app.flow_grid's ceiling, 0 to 12,750 ft: none (the top, byte 255)
        // beside a 500 ft ceiling (byte 10), AIM 7-1-7's IFR floor ("IFR.
        // Ceiling 500 to less than 1,000 feet"). Half way from one to the
        // other a straight-line reading says 6,625 ft, VFR; the data holds
        // 500, and that is the reading anywhere the low pixel is read from.
        let top = [0.0, 12_750.0];
        let (none, low) = ([255.0, 0.0, 255.0], [10.0, 0.0, 255.0]);
        for (fx, fy) in [(0.5, 0.0), (0.5, 0.5), (0.01, 0.0), (0.99, 0.99)] {
            let r = sample([none, low, none, none], fx, fy, top, Field::Ceiling).unwrap();
            assert!(r.value == 500.0 && !r.no_ceiling, "{fx} {fy}: {r:?}");
        }
        // On the clear pixel's own middle, the model's own value there: none.
        assert!(sample([none, low, none, none], 0.0, 0.0, top, Field::Ceiling).unwrap().no_ceiling);
        // A missing pixel the point is read from is still no reading.
        assert_eq!(sample([none, [10.0, 0.0, 0.0], none, none], 0.5, 0.5, top, Field::Ceiling), None);
    }

    #[test]
    fn the_visibility_is_the_lowest_round_the_point() {
        // app.flow_grid's visibility, 0 to 10 SM: 10 SM (its "10 or more")
        // beside 0.8 SM (byte 20.4 is 0.8), under AIM 7-1-7's LIFR "1
        // mile". Read anywhere between, 0.8 SM, never the VFR 5.4 SM a
        // straight line gives half way from one to the other.
        let vis = [0.0, 10.0];
        let r = sample([[255.0, 0.0, 255.0], [20.4, 0.0, 255.0], [255.0, 0.0, 255.0], [255.0, 0.0, 255.0]], 0.5, 0.5, vis, Field::Least)
            .unwrap();
        assert!((r.value - 0.8).abs() < 1e-9 && !r.no_ceiling && !r.calm, "{r:?}");
        assert_eq!(Field::named("vis"), Field::Least);
        assert_eq!(Field::named("ceiling"), Field::Ceiling);
        // The temperature, a continuous field, still reads between.
        assert_eq!(Field::named("temp"), Field::Scalar);
    }

    #[test]
    fn the_rules_answer_their_contracts() {
        let c = json::parse(r#"{"bounds":[0,0,4,2],"width":4,"height":2,"lat":1.25,"lon":1}"#).unwrap();
        assert_eq!(call("flow_cell", &c).unwrap(), r#"{"pixels":[0,1,4,5],"fx":0.5,"fy":0.25}"#);
        let s =
            json::parse(r#"{"pixels":[[0,0,255],[255,0,255],[0,0,255],[255,0,255]],"fx":0.25,"fy":0.5,"unscale":[0,100],"vector":false}"#)
                .unwrap();
        assert_eq!(call("flow_sample", &s).unwrap(), r#"{"value":25.0,"from_deg":null,"calm":false,"no_ceiling":false}"#);
        // The field named by its picture: the visibility reads its lowest.
        let s = json::parse(
            r#"{"pixels":[[0,0,255],[255,0,255],[0,0,255],[255,0,255]],"fx":0.25,"fy":0.5,"unscale":[0,100],"vector":false,"field":"vis"}"#,
        )
        .unwrap();
        assert_eq!(call("flow_sample", &s).unwrap(), r#"{"value":0.0,"from_deg":null,"calm":false,"no_ceiling":false}"#);
        assert!(call("flow_sample", &json::parse(r#"{"pixels":[]}"#).unwrap()).is_err());
    }
}
