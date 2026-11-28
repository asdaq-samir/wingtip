//! The Dimmer's words and paper at night, one copy of the maths for every
//! app (map_dim_words): the chart's white as MapLibre's raster shader draws
//! it under the Contrast and the Dimmer, the share of their night inks the
//! map's light-haloed words take so that none is brighter than the paper
//! under them (AIM 8-1-6, Vision in Flight: the pilot's dark adaptation),
//! and a night warning's light against the paper's. A display's look, not
//! an aviation figure; its figures are design/tokens.json's map-dim group
//! (map_dim_figures, generated), and apps/web/src/lib/fixtures/mapDim.json
//! holds it to its cases (facade/tests/map_dim.rs).

use crate::ask::Ask;
use crate::json::{self, Value};
use crate::text::js_round_f;

#[path = "map_dim_figures.rs"]
mod figures;
use figures::*;

/// A grey's factor about the middle under MapLibre's raster-contrast `k`:
/// 1/(1-k) for a k over 0, 1+k under.
fn contrast_factor(k: f64) -> f64 {
    if k > 0.0 {
        1.0 / (1.0 - k)
    } else {
        1.0 + k
    }
}

/// The chart's white as the raster shader draws it, encoded sRGB 0 to 1:
/// raster-contrast first, about the middle, then raster-brightness-max.
pub fn paper(brightness: f64, contrast: f64) -> f64 {
    ((0.5 * contrast_factor(contrast) + 0.5) * brightness.clamp(0.0, 1.0)).min(1.0)
}

/// sRGB's encoded 0 to 1 to its linear light (IEC 61966-2-1, as WCAG 2
/// takes a colour's luminance).
pub fn linear(c: f64) -> f64 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// The paper's light as the words' share: the factor that brings the
/// words' light (WORD_LIGHT, every night ink brought to it) to the paper's.
fn paper_share(brightness: f64, contrast: f64) -> f64 {
    (linear(paper(brightness, contrast)) / WORD_LIGHT).powf(1.0 / WORD_GAMMA)
}

/// In hundredths, as JavaScript's Math.round has them: each new figure
/// lays the words' sources out again, so they move in steps.
fn hundredths(v: f64) -> f64 {
    js_round_f(v * 100.0) / 100.0
}

/// The words' share of their night inks after dark, 0 by day: the paper's
/// share, floored at WORD_FLOOR or the paper's own at the night's contrast
/// (WORD_FLOOR_CONTRAST) where the Dimmer takes that lower, so a flatter
/// chart leaves the words about 4.5:1 on their halo and the Dimmer still
/// dims them; never under WORD_LEAST at night.
pub fn words(night: bool, brightness: f64, contrast: f64) -> f64 {
    if !night {
        return 0.0;
    }
    let floor = WORD_FLOOR.min(paper_share(brightness, WORD_FLOOR_CONTRAST));
    let share = paper_share(brightness, contrast).max(floor);
    hundredths(share).clamp(WORD_LEAST, 1.0)
}

/// A night warning's light: the paper's times WARNING_UNDER_PAPER, so the
/// TFR's red holds 3:1 over the paper across the Contrast; 1 by day.
pub fn warning(night: bool, brightness: f64, contrast: f64) -> f64 {
    if night {
        hundredths((WARNING_UNDER_PAPER * paper(brightness, contrast)).min(1.0))
    } else {
        1.0
    }
}

/// map_dim_words: `night`, the chart's `brightness` (raster-brightness-max)
/// and `contrast` (raster-contrast) in; the paper's light, the words'
/// share and the warnings' out.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let (night, b, k) = (ask.opt_bool("night")?, ask.num("brightness")?, ask.num("contrast")?);
    let mut out = String::from("{\"paper\":");
    json::number(&mut out, paper(b, k));
    out.push_str(",\"words\":");
    json::number(&mut out, words(night, b, k));
    out.push_str(",\"warning\":");
    json::number(&mut out, warning(night, b, k));
    out.push('}');
    Ok(out)
}
