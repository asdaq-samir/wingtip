//! A report's sky as the AWC's XML gives it (forecast::awc): its ceiling,
//! whether that is not known, and the cover of the ceiling's layer as a
//! METAR writes it ("OVC" of OVC008, "VV" of VV002), for the map's station
//! model (the airport weather marks, the owner's pick, 2026-11-10). Apart
//! from awc.rs and metar.rs, to keep each a size a reader takes in.

use crate::metar;
use crate::xml::Element;

fn num(text: Option<&str>) -> Option<f64> {
    text.and_then(|t| t.trim().parse::<f64>().ok()).filter(|v| v.is_finite())
}

/// A METAR's or a TAF period's ceiling (metar::sky_ceiling_of), whether it
/// is not known, and its layer's cover (ceiling_cover_of).
pub fn sky(el: &Element) -> (Option<f64>, bool, Option<&'static str>) {
    let layers: Vec<(String, Option<f64>)> = el
        .all("sky_condition")
        .map(|sc| (sc.attribute("sky_cover").unwrap_or("").to_owned(), num(sc.attribute("cloud_base_ft_agl"))))
        .collect();
    let vv = num(el.text_at(&["vert_vis_ft"]));
    let (ceiling, unknown) = metar::sky_ceiling_of(layers.iter().map(|(c, b)| (c.as_str(), *b)), vv);
    (ceiling, unknown, ceiling_cover_of(layers.iter().map(|(c, b)| (c.as_str(), *b)), vv))
}

/// The cover of the layer that is the ceiling (sky_ceiling_of): "BKN" or
/// "OVC", or "VV" for an obscuration's vertical visibility (the AWC's
/// "OVX", or one given apart) -- as a METAR writes the ceiling, "OVC008"
/// or "VV002" (FMH-1 ch. 9; AIM 7-1-28's key). None where there is no
/// ceiling, or its height is not known. The lower of two layers at one
/// height is the one written first.
pub fn ceiling_cover_of<'a>(
    layers: impl IntoIterator<Item = (&'a str, Option<f64>)>, vertical_visibility_ft: Option<f64>,
) -> Option<&'static str> {
    let mut best: Option<(f64, &'static str)> = vertical_visibility_ft.map(|v| (v, "VV"));
    let mut first_ceiling = true;
    for (cover, base) in layers {
        let name = match cover {
            "BKN" => "BKN",
            "OVC" => "OVC",
            "OVX" | "VV" => "VV",
            _ => continue,
        };
        // The lowest ceiling layer sent with no height: not known (sky_ceiling_of).
        if first_ceiling && base.is_none() && vertical_visibility_ft.is_none() {
            return None;
        }
        first_ceiling = false;
        if let Some(b) = base
            && best.is_none_or(|(m, _)| b < m)
        {
            best = Some((b, name));
        }
    }
    best.map(|(_, c)| c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_ceilings_cover_is_the_lowest_ceiling_layers() {
        assert_eq!(ceiling_cover_of([("FEW", Some(400.0)), ("BKN", Some(800.0)), ("OVC", Some(1500.0))], None), Some("BKN"));
        assert_eq!(ceiling_cover_of([("SCT", Some(400.0)), ("OVC", Some(800.0))], None), Some("OVC"));
        assert_eq!(ceiling_cover_of([("OVX", Some(200.0))], None), Some("VV"));
        assert_eq!(ceiling_cover_of([("BKN", Some(900.0))], Some(200.0)), Some("VV"));
        assert_eq!(ceiling_cover_of([("FEW", Some(4000.0))], None), None);
        // OVC/// is a ceiling not known: no cover said for it.
        assert_eq!(ceiling_cover_of([("OVC", None)], None), None);
    }
}
