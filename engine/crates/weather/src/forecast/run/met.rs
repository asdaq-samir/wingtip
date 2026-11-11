//! The forecast ceiling and visibility where and when the run is: the TAF
//! that speaks for the place at that time and the Gridded LAMP's hour, the
//! worse of the two; and the winds aloft at its altitude then.

use super::{Field, Role, Sample, FIELD_WINDOW_S, MODELLED_REACH_S};
use crate::forecast::field::TAF_REACH_NM;
use crate::forecast::{rank, route};
use crate::geo;
use crate::json::Value;
use crate::metar;
use crate::winds::{self, WindAt};
use wingtip_core::sort::StableSort;

/// Whose forecast a figure is.
#[derive(Clone, Debug, PartialEq)]
pub enum Source {
    /// A TAF (FAA-H-8083-28B 27.4), its station and how far it is, nm (0 a field's own).
    Taf { ident: String, nm: f64 },
    /// The NWS's Gridded LAMP for the hour valid at `valid` (s since 1970):
    /// modelled guidance, not an issued forecast.
    Modelled { valid: f64 },
}

impl Source {
    /// The source as the alerts cite it.
    pub fn words(&self) -> String {
        match self {
            Source::Taf { ident, nm } if *nm < 1.0 => format!("TAF {ident}"),
            Source::Taf { ident, nm } => format!("TAF {ident}, {} nm away", nm.round()),
            Source::Modelled { valid } => format!("NWS Gridded LAMP, modelled for {}", super::zulu(*valid)),
        }
    }
}

/// The forecast at a place and time.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Met {
    pub category: Option<&'static str>,
    /// Feet above the ground.
    pub ceiling_ft: Option<f64>,
    pub ceiling_unknown: bool,
    pub visibility_sm: Option<f64>,
    pub source: Option<Source>,
    /// The ground under the ceiling, ft MSL, where known: a TAF station's
    /// field elevation (the Gridded LAMP's ceiling is above ground the
    /// engine is not sent).
    pub ground_ft: Option<f64>,
}

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

/// What a TAF forecasts over [start, end], TEMPO and PROB groups included
/// (route::worst_in_window: a go/no-go read is the worst it allows).
fn taf_met(station: &Value, nm: f64, start: f64, end: f64) -> Option<Met> {
    let fcsts = station.get("fcsts").and_then(Value::as_array)?;
    let w = route::worst_in_window(fcsts, start, end)?;
    Some(Met {
        category: metar::flight_category_of(w.ceiling_ft, w.ceiling_unknown, w.visibility_sm),
        ceiling_ft: w.ceiling_ft,
        ceiling_unknown: w.ceiling_unknown,
        visibility_sm: w.visibility_sm,
        source: Some(Source::Taf { ident: station.get("icaoId").and_then(Value::as_str).unwrap_or("").to_owned(), nm }),
        ground_ft: num(station, "elevation_ft"),
    })
}

/// The TAF that speaks for (lat, lon) over [start, end]: a field's own
/// (`ident`) first, else the nearest station within TAF_REACH_NM whose TAF
/// says something of the window (field.rs: the reach the briefing and the
/// altitude plan's clouds take a TAF over).
fn taf_near(tafs: &[Value], ident: Option<&str>, lat: f64, lon: f64, start: f64, end: f64) -> Option<Met> {
    if let Some(own) =
        ident.and_then(|i| tafs.iter().find(|s| s.get("icaoId").and_then(Value::as_str).is_some_and(|id| id == i || id == format!("K{i}"))))
        && let Some(m) = taf_met(own, 0.0, start, end)
    {
        return Some(m);
    }
    let mut near: Vec<(f64, &Value)> = tafs
        .iter()
        .filter_map(|s| Some((geo::distance_nm(lat, lon, num(s, "lat")?, num(s, "lon")?), s)))
        .filter(|(nm, _)| *nm <= TAF_REACH_NM)
        .collect();
    near.stable_sort_by(|a, b| a.0.total_cmp(&b.0));
    near.into_iter().find_map(|(nm, s)| taf_met(s, nm, start, end))
}

/// The Gridded LAMP's hour nearest `t`, within MODELLED_REACH_S.
fn modelled_at(s: &Sample) -> Option<Met> {
    let m = s
        .modelled
        .iter()
        .filter(|m| (m.valid - s.t).abs() <= MODELLED_REACH_S)
        .min_by(|a, b| (a.valid - s.t).abs().total_cmp(&(b.valid - s.t).abs()))?;
    Some(Met {
        category: metar::flight_category_of(m.ceiling_ft, false, m.visibility_sm),
        ceiling_ft: m.ceiling_ft,
        ceiling_unknown: false,
        visibility_sm: m.visibility_sm,
        source: Some(Source::Modelled { valid: m.valid }),
        ground_ft: None,
    })
}

/// The worse of two readings by category (the forecast's rank), the TAF's
/// where they are alike: it is the issued forecast, the model guidance.
/// A TAF's ceiling of unknown height ("OVC///") has no category of its
/// own, yet it is a ceiling not known to be high enough (14 CFR 1.1
/// "ceiling"; AIM 7-1-7's VFR needs one above 3,000 ft): it ranks as
/// MVFR at least here, so a modelled VFR or MVFR does not hide it and
/// under_vfr's "a ceiling of unknown height" alert fires; a modelled IFR
/// or LIFR, a definite worse reading, still wins.
fn worse(taf: Option<Met>, modelled: Option<Met>) -> Met {
    let taf_rank = |t: &Met| if t.ceiling_unknown { rank(t.category).max(rank(Some("MVFR"))) } else { rank(t.category) };
    match (taf, modelled) {
        (Some(t), Some(m)) if rank(m.category) > taf_rank(&t) => m,
        (Some(t), _) => t,
        (None, Some(m)) => m,
        (None, None) => Met::default(),
    }
}

/// The forecast where and when a sample is.
pub fn at_sample(tafs: &[Value], s: &Sample) -> Met {
    worse(taf_near(tafs, None, s.lat, s.lon, s.t, s.t), modelled_at(s))
}

/// A field's TAF at its time (FIELD_WINDOW_S): a landing's from an hour
/// before the run is in to an hour after; the departure's from its time an
/// hour on.
pub fn at_field(tafs: &[Value], f: &Field) -> Met {
    let (start, end) = match f.role {
        Role::Departure => (f.t, f.t + FIELD_WINDOW_S),
        _ => (f.t - FIELD_WINDOW_S, f.t + FIELD_WINDOW_S),
    };
    taf_near(tafs, Some(&f.ident), f.lat, f.lon, start, end).unwrap_or_default()
}

/// The wind at the sample's altitude from the GFS period used for its
/// time (winds.rs wind_at_altitude); none where no period covers it or the
/// altitude is not known -- never calm.
pub fn wind_at(s: &Sample) -> Option<WindAt> {
    let period = s.winds.iter().find(|p| p.from <= s.t && s.t < p.to)?;
    winds::wind_at_altitude(&period.levels, s.alt_ft?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn met(category: Option<&'static str>, ceiling_unknown: bool, modelled: bool) -> Met {
        let source = if modelled { Source::Modelled { valid: 0.0 } } else { Source::Taf { ident: "KXYZ".into(), nm: 0.0 } };
        Met { category, ceiling_unknown, source: Some(source), ..Met::default() }
    }

    #[test]
    fn a_tafs_ceiling_of_unknown_height_is_not_hidden_by_a_modelled_vfr() {
        // TAF OVC/// 6SM: no category, a ceiling not known to be high
        // enough (14 CFR 1.1). The model's VFR and MVFR do not replace it.
        for model in ["VFR", "MVFR"] {
            let got = worse(Some(met(None, true, false)), Some(met(Some(model), false, true)));
            assert!(got.ceiling_unknown && matches!(got.source, Some(Source::Taf { .. })), "{model}");
            assert_eq!(under_vfr_words(&got), vec!["a ceiling of unknown height".to_owned()]);
        }
        // A modelled IFR is a definite worse reading.
        let got = worse(Some(met(None, true, false)), Some(met(Some("IFR"), false, true)));
        assert_eq!(got.category, Some("IFR"));
        // A known TAF ceiling still gives way to a worse model.
        let got = worse(Some(met(Some("VFR"), false, false)), Some(met(Some("MVFR"), false, true)));
        assert_eq!(got.category, Some("MVFR"));
    }

    fn under_vfr_words(m: &Met) -> Vec<String> {
        super::super::checks::under_vfr(m, None)
    }
}
