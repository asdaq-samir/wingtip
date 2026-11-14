//! A special-use area's floor and ceiling read from the FAA's data, the
//! one reading of its codes and descriptors: the area's tab writes them
//! (crate::sua_tab), the alerts ahead test against them (crate::ahead), and
//! a 3D map stands its volume on them (crate::volume_span).
//!
//! The limits are read from the FAA's special use airspace data (AIS's
//! Special_Use_Airspace layer on ADDS, published every eight weeks; its
//! metadata, read 2026-11-12 for 29 Oct to 24 Dec 2026, names the fields
//! but not their values): LOWER_/UPPER_VAL with its UOM (FT, or FL, a
//! flight level), LOWER_/UPPER_CODE (SFC, MSL, STD for a flight level,
//! UNLTD), LOWER_/UPPER_DESC (TI to and including, TNI to but not
//! including, ANI above but not including; the only values the layer
//! holds besides OTHER and none, and read so because the FAA's CIFP
//! writes the same areas' limits that way, below) and EXCLUSION, which
//! the metadata does not define either. The data shows what 1 is: the
//! area's own airspace over a part the FAA excludes lower down, drawn as
//! its own polygon with its area's NAME and its own floor, the area's
//! main polygon cut around it. Brady Low MOA (500 FT SFC to 6,000 MSL
//! TNI) has two, round Curtis Field and San Saba County, 1,500 FT SFC
//! ANI to 6,000 MSL TNI, each with the REMARKS "EXCLUDES SFC TO 1500 FT
//! AGL" (ADDS, queried 2026-11-12): the MOA is there above 1,500 ft AGL,
//! not under it. As wingtip.sua `_area` keeps them in a pack.

use crate::json::Value;
use crate::rules::CLASS_A_FLOOR_FT;

/// One limit as the FAA's data gives it: the figure in feet (a flight
/// level already times 100, wingtip.sua `_height_ft`), its CODE and its
/// DESC.
#[derive(Clone, Copy, Default)]
pub struct Limit<'a> {
    pub ft: Option<f64>,
    pub code: Option<&'a str>,
    pub desc: Option<&'a str>,
}

/// A floor or ceiling as the tab writes it, (feet, reference), written as
/// the FAA's own CIFP (FAACIFP18, ARINC 424's restrictive airspace record,
/// each limit with M for MSL or A for AGL) writes the same areas, which is
/// how ForeFlight writes them (cycle 2610, read 2026-11-12):
///
/// - "UNL" for no ceiling (UNLTD), with no figure.
/// - "SFC" at the surface; a height the FAA codes SFC above 0 is that
///   height above the ground, "AGL" (Brady Low's 500 FT SFC, CIFP's
///   "00500A").
/// - "FL" for a flight level (STD, standard pressure, 14 CFR 1.1); but a
///   ceiling at FL180 "to but not including" is 17,999 ft MSL, CIFP's
///   "17999M" (Brady North): below 18,000 ft MSL, where Class A begins
///   (14 CFR 71.33(a), "from 18,000 feet MSL"), altitudes are MSL. A higher flight level is written
///   as it is: a flight level has no foot below it to write.
/// - Otherwise "MSL", or "AGL" as coded; a ceiling TNI a foot under its
///   figure and a floor ANI a foot over it, as CIFP writes them (Brady
///   Low's 6,000 TNI "05999M", its pieces above 1,500 AGL "01501A").
///
/// (None, None) where there is no figure to write.
pub fn limit(limit: Limit, upper: bool) -> (Option<f64>, Option<&'static str>) {
    let code = limit.code.unwrap_or("").trim().to_uppercase();
    if code == "UNLTD" {
        return (None, Some("UNL"));
    }
    let Some(ft) = limit.ft.filter(|v| v.is_finite()) else { return (None, None) };
    let desc = limit.desc.unwrap_or("").trim().to_uppercase();
    let step = match (upper, desc.as_str()) {
        (true, "TNI") => -1.0,
        (false, "ANI") => 1.0,
        _ => 0.0,
    };
    match code.as_str() {
        "STD" if upper && step != 0.0 && ft == CLASS_A_FLOOR_FT => (Some(ft + step), Some("MSL")),
        "STD" => (Some(ft), Some("FL")),
        "SFC" if ft == 0.0 && step == 0.0 => (Some(0.0), Some("SFC")),
        "SFC" | "AGL" => (Some(ft + step), Some("AGL")),
        _ => (Some(ft + step), Some("MSL")),
    }
}

/// A special-use area's floor and ceiling for the alerts ahead
/// (crate::ahead), from the
/// figures and the area's codes and DESC as wingtip.sua `_area` keeps
/// them (`floor_ref`, `floor_desc`, `ceiling_ref`, `ceiling_desc`), else
/// the codes a pack's `sua.alt` keeps (`refs`, wingtip.cycle_pack
/// `_SUA_REFS`: 1 SFC, 2 AGL, 3 MSL, 0 STD, UNLTD or none, which an absent
/// figure or MSL reads as rightly). A figure not a number is none. Read as its tab reads them (`limit`,
/// the one reading of the FAA's special use airspace data): a figure the
/// FAA codes SFC above 0 is that height above the ground (Brady Low MOA's
/// 500 FT SFC is CIFP's "00500A"), a ceiling "to but not including" a foot
/// under its figure and a floor "above but not including" a foot over it.
/// Read as MSL, as the alerts read them before 2026-11-12, Brady Low's
/// pieces round Curtis Field and San Saba County (1,500 FT SFC ANI,
/// REMARKS "EXCLUDES SFC TO 1500 FT AGL") began at 1,500 ft MSL, under
/// the ground there, and alerted a pilot below the MOA where the FAA
/// excludes it. No ceiling (UNLTD) is none; a limit with no figure is
/// none, as before.
pub fn heights(codes: Option<&Value>, floor_ft: Option<f64>, ceiling_ft: Option<f64>, refs: [u8; 2]) -> Heights {
    let pack_code = |byte: u8| match byte {
        1 => Some("SFC"),
        2 => Some("AGL"),
        3 => Some("MSL"),
        _ => None,
    };
    let text = |key: &str| codes.and_then(|c| c.get(key)).and_then(Value::as_str);
    let (floor, floor_ref) = limit(Limit { ft: floor_ft, code: text("floor_ref").or(pack_code(refs[0])), desc: text("floor_desc") }, false);
    let (ceiling, ceiling_ref) =
        limit(Limit { ft: ceiling_ft, code: text("ceiling_ref").or(pack_code(refs[1])), desc: text("ceiling_desc") }, true);
    Heights { floor, floor_agl: floor_ref == Some("AGL"), ceiling, ceiling_agl: ceiling_ref == Some("AGL") }
}

/// A special-use area's floor and ceiling in feet, each with whether it
/// is above the ground (else MSL, a flight level as its feet); None where
/// there is no figure.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Heights {
    pub floor: Option<f64>,
    pub floor_agl: bool,
    pub ceiling: Option<f64>,
    pub ceiling_agl: bool,
}

/// The `{"ft", "code", "desc"}` limit under `key`; none is no figure.
pub fn read_limit<'a>(v: &'a Value, key: &str) -> Limit<'a> {
    let at = |k: &str| v.get(key).filter(|o| !matches!(o, Value::Null)).and_then(|o| o.get(k));
    Limit { ft: at("ft").and_then(Value::as_f64), code: at("code").and_then(Value::as_str), desc: at("desc").and_then(Value::as_str) }
}

/// A limit for a test: its figure, its CODE and its DESC.
#[cfg(test)]
pub(crate) fn lim<'a>(ft: Option<f64>, code: &'a str, desc: Option<&'a str>) -> Limit<'a> {
    Limit { ft, code: Some(code), desc }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json;

    #[test]
    fn the_alerts_read_sfc_above_the_ground_from_the_json_or_the_packs_codes() {
        // Brady Low MOA's piece round Curtis Field as ADDS has it
        // (2026-11-12): 1,500 SFC ANI to 6,000 MSL TNI, EXCLUSION 1,
        // REMARKS "EXCLUDES SFC TO 1500 FT AGL".
        let piece =
            json::parse(r#"{"floor_ref":"SFC","floor_desc":"ANI","ceiling_ref":"MSL","ceiling_desc":"TNI","excluded":true}"#).unwrap();
        let want = Heights { floor: Some(1501.0), floor_agl: true, ceiling: Some(5999.0), ceiling_agl: false };
        assert_eq!(heights(Some(&piece), Some(1500.0), Some(6000.0), [0, 0]), want);
        // A pack with no JSON: its sua.alt codes (1 SFC, 3 MSL), no DESC.
        let coded = Heights { floor: Some(1500.0), floor_agl: true, ceiling: Some(6000.0), ceiling_agl: false };
        assert_eq!(heights(None, Some(1500.0), Some(6000.0), [1, 3]), coded);
        // The surface is the ground itself; no ceiling (UNLTD, NaN in a pack) is none.
        let surface = Heights { floor: Some(0.0), floor_agl: false, ceiling: None, ceiling_agl: false };
        assert_eq!(heights(None, Some(0.0), Some(f64::NAN), [1, 0]), surface);
    }

    #[test]
    fn limits_are_written_as_the_faas_cifp_writes_them() {
        // Brady North's FL180 TNI: CIFP's "17999M" (Class A, 14 CFR 71.33).
        assert_eq!(limit(lim(Some(18000.0), "STD", Some("TNI")), true), (Some(17999.0), Some("MSL")));
        assert_eq!(limit(lim(Some(18000.0), "STD", Some("TI")), true), (Some(18000.0), Some("FL")));
        assert_eq!(limit(lim(Some(23000.0), "STD", Some("TNI")), true), (Some(23000.0), Some("FL")));
        // Brady Low's 6,000 MSL TNI, "05999M", over 500 FT SFC, "00500A".
        assert_eq!(limit(lim(Some(6000.0), "MSL", Some("TNI")), true), (Some(5999.0), Some("MSL")));
        assert_eq!(limit(lim(Some(500.0), "SFC", None), false), (Some(500.0), Some("AGL")));
        // Its pieces above but not including 1,500 AGL, "01501A".
        assert_eq!(limit(lim(Some(1500.0), "SFC", Some("ANI")), false), (Some(1501.0), Some("AGL")));
        // TNI on a floor and ANI on a ceiling say nothing of the figure.
        assert_eq!(limit(lim(Some(3600.0), "MSL", Some("TNI")), false), (Some(3600.0), Some("MSL")));
        assert_eq!(limit(lim(Some(0.0), "SFC", None), false), (Some(0.0), Some("SFC")));
        // A pack with no DESC: the figure as coded.
        assert_eq!(limit(lim(Some(18000.0), "STD", None), true), (Some(18000.0), Some("FL")));
        assert_eq!(limit(lim(None, "UNLTD", None), true), (None, Some("UNL")));
        assert_eq!(limit(lim(None, "MSL", None), true), (None, None));
    }
}
