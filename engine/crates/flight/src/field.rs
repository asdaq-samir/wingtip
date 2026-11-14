//! Whether a field is open: the one rule every list of fields, map mark,
//! search answer and landing candidate is held to (the owner's hard rule,
//! 2026-11-13, decision 0043: a field the FAA lists as closed is never
//! shown or offered as an open one).
//!
//! The FAA's word is NASR's APT_BASE.csv, ARPT_STATUS: "O" operational,
//! "CI" closed indefinitely, "CP" closed permanently (the NASR subscriber
//! files' APT_BASE layout). Only "O" is open. Any other code, a blank one
//! among them, is closed: a field NASR does not say is operational is not
//! offered as one, which errs toward the safe side. A field with no NASR
//! record at all (`None`: the host's own table has it, NASR has no row for
//! it, as in a test's airports file with no FAA file beside it) is not
//! judged here; the host's own source decides, as it did before.
//!
//! Whether a field is the armed services' own (`military`) is read here
//! too, from the same file: one statement of it for the planner, the
//! cycle pack's overlays and the engine's own map pins.

/// NASR's operating status of a field.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    /// ARPT_STATUS "O".
    Open,
    /// ARPT_STATUS "CI".
    ClosedIndefinitely,
    /// ARPT_STATUS "CP".
    ClosedPermanently,
    /// Any other ARPT_STATUS, a blank one too: not said to be operational.
    Closed,
    /// No NASR record to read.
    Unknown,
}

/// The status of a field from NASR's ARPT_STATUS, `None` where NASR has
/// no record of it; the code is read trimmed and in capitals.
pub fn status(code: Option<&str>) -> Status {
    let Some(code) = code else { return Status::Unknown };
    match code.trim().to_ascii_uppercase().as_str() {
        "O" => Status::Open,
        "CI" => Status::ClosedIndefinitely,
        "CP" => Status::ClosedPermanently,
        _ => Status::Closed,
    }
}

/// Whether a field may be shown or offered as an open one: NASR's "O", or
/// no NASR record (the host's own source then decides).
pub fn is_open(code: Option<&str>) -> bool {
    matches!(status(code), Status::Open | Status::Unknown)
}

/// The words a closed field is labelled with wherever it appears at all
/// (a search for its ident, its card), in sentence case as the app sets
/// the FAA's own words; None for an open field.
pub fn closed_words(code: Option<&str>) -> Option<&'static str> {
    match status(code) {
        Status::Open | Status::Unknown => None,
        Status::ClosedIndefinitely => Some("Closed indefinitely"),
        Status::ClosedPermanently => Some("Closed permanently"),
        Status::Closed => Some("Closed"),
    }
}

/// NASR APT_BASE's OWNERSHIP_TYPE_CODE for a field the armed services
/// own (the NASR subscriber files' APT_BASE layout): the Air Force's
/// (MA), the Navy's (MN), the Army's (MR) and the Coast Guard's (CG).
/// PU (publicly owned) and PR (privately owned) are the others.
pub const MILITARY_OWNERS: [&str; 4] = ["MA", "MN", "MR", "CG"];

/// A field the armed services own: "joint" where it is open to the public
/// as well (FACILITY_USE_CODE PU) -- a civil airport on a military one,
/// where a civil pilot may land, as Libby AAF and Sierra Vista Municipal
/// -- else "military", where a civil airplane lands only with the
/// service's permission (for the Air Force a Civil Aircraft Landing
/// Permit, 32 CFR part 855); None for any other owner. Both codes are
/// read trimmed and in capitals.
pub fn military(ownership: Option<&str>, facility_use: Option<&str>) -> Option<&'static str> {
    let up = |c: Option<&str>| c.unwrap_or("").trim().to_ascii_uppercase();
    if !MILITARY_OWNERS.contains(&up(ownership).as_str()) {
        return None;
    }
    Some(if up(facility_use) == "PU" { "joint" } else { "military" })
}

/// NASR APT_BASE's SITE_TYPE_CODE for a field an airplane lands on, whose
/// mark comes before a heliport's: airport (A), seaplane base (C),
/// gliderport (G), ultralight park (U) and balloonport (B).
pub const LANDING_SITES: [&str; 5] = ["A", "C", "G", "U", "B"];

/// The runway surfaces the sectional's airport symbol counts as hard (FAA
/// Aeronautical Chart User's Guide, VFR Terms and Symbols, Airports:
/// "hard-surfaced runways"), by NASR APT_RWY's SURFACE_TYPE_CODE: asphalt,
/// concrete, PEM (partially concrete, asphalt or bitumen-bound macadam),
/// porous friction courses and brick.
pub const HARD_SURFACES: [&str; 5] = ["ASPH", "CONC", "PEM", "PFC", "BRICK"];

/// Whether a runway's NASR SURFACE_TYPE_CODE is hard (HARD_SURFACES): a
/// mixed surface ("ASPH-TURF", "ASPH/CONC") only where every part is hard;
/// TRTD (treated) goes with a hard one and is not one alone. The one
/// statement the cycle pack's overlays and the planner's map list read.
pub fn hard_surface(code: &str) -> bool {
    let parts: Vec<String> = code.split(['-', '/']).map(|p| p.trim().to_ascii_uppercase()).filter(|p| !p.is_empty()).collect();
    let hard = |p: &String| HARD_SURFACES.contains(&p.as_str());
    !parts.is_empty() && parts.iter().all(|p| hard(p) || p == "TRTD") && parts.iter().any(hard)
}

/// The hard runway (asphalt, concrete and the like: the FAA Aeronautical
/// Chart User's Guide's "hard-surfaced runways", as the overlays read
/// APT_RWY's SURFACE_TYPE_CODE) that puts a public field in the tier
/// drawn a zoom after the towered ones. The app's own line for how
/// crowded the chart gets far out, not an FAA figure.
pub const LONG_HARD_FT: u32 = 3_000;

/// What a field's map mark is first drawn at (`tier`) and kept by where
/// marks would overlap (`order`, lower first), from NASR APT_BASE's
/// SITE_TYPE_CODE, FACILITY_USE_CODE and TWR_TYPE_CODE, its longest hard
/// runway (APT_RWY) and the class of airspace the FAA's Class_Airspace
/// file names it the primary airport of (IDENT, "B" or "C").
///
/// Tiers: 0 towered, 1 public with a hard runway of LONG_HARD_FT or more,
/// 2 other public, 3 private, 4 heliports and the rest. Within a tier the
/// field a Class B is named for comes first, then one a Class C is, then
/// the longer hard runway: zoomed out over Chicago every towered field
/// tied, and the tile's order drew Chicago Executive where O'Hare should
/// be (the owner, 2026-11-14).
///
/// `size` is the step the mark is drawn at, the biggest fields the
/// largest (the owner's pick of the field-sized mark, 2026-11-14):
/// "largest" for a Class B's field, "larger" for a Class C's, "regular"
/// for the other towered fields and the public ones with a long hard
/// runway, "small" for the rest. How much larger each is drawn is each
/// app's own.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MarkRank {
    pub tier: u8,
    pub order: u32,
    pub size: &'static str,
}

/// The order's room for a runway: every hard runway in NASR is under
/// 100,000 ft (the longest, Denver's 16R/34L, is 16,000), so a class's
/// orders never reach the next one's.
const RUNWAY_ROOM: u32 = 100_000;

/// A field's MarkRank; `primary_of` is the class the airspace file names
/// it the primary of, any other than B or C counting as none.
pub fn mark_rank(site_type: &str, facility_use: &str, towered: bool, hard_ft: u32, primary_of: Option<&str>) -> MarkRank {
    let up = |c: &str| c.trim().to_ascii_uppercase();
    let landing = LANDING_SITES.contains(&up(site_type).as_str());
    let tier = if !landing {
        4
    } else if towered {
        0
    } else if up(facility_use) != "PU" {
        3
    } else if hard_ft >= LONG_HARD_FT && up(site_type) == "A" {
        1
    } else {
        2
    };
    // The primaries before the other towered fields: 0 Class B, 1 Class C,
    // then each tier a step on (2 towered ... 6 heliports).
    let class = match (landing, primary_of.map(up).as_deref()) {
        (true, Some("B")) => 0,
        (true, Some("C")) => 1,
        _ => u32::from(tier) + 2,
    };
    let size = ["largest", "larger", "regular", "regular"].get(class as usize).copied().unwrap_or("small");
    MarkRank { tier, order: class * RUNWAY_ROOM + (RUNWAY_ROOM - 1 - hard_ft.min(RUNWAY_ROOM - 1)), size }
}

#[cfg(test)]
mod tests {
    use super::*;

    // NASR APT_BASE's ownership codes, each side of the rule.
    #[test]
    fn the_services_fields_are_military_or_joint() {
        for owner in MILITARY_OWNERS {
            assert_eq!(military(Some(owner), Some("PR")), Some("military"));
            assert_eq!(military(Some(owner), Some("PU")), Some("joint"));
        }
        assert_eq!(military(Some(" mr "), Some(" pu")), Some("joint"));
        assert_eq!(military(Some("MR"), None), Some("military"));
        assert_eq!(military(Some("PU"), Some("PU")), None);
        assert_eq!(military(Some("PR"), Some("PR")), None);
        assert_eq!(military(None, Some("PU")), None);
    }

    // NASR APT_BASE's ARPT_STATUS codes, each side of the rule.
    #[test]
    fn only_operational_is_open() {
        assert!(is_open(Some("O")));
        assert!(is_open(Some(" o ")));
        assert!(!is_open(Some("CI")));
        assert!(!is_open(Some("CP")));
        assert!(!is_open(Some("")));
        assert!(!is_open(Some("X")));
    }

    #[test]
    fn closed_fields_are_labelled() {
        assert_eq!(closed_words(Some("O")), None);
        assert_eq!(closed_words(Some("CI")), Some("Closed indefinitely"));
        assert_eq!(closed_words(Some("CP")), Some("Closed permanently"));
        assert_eq!(closed_words(Some("")), Some("Closed"));
    }

    // No NASR record: not judged here, so not hidden and not labelled.
    #[test]
    fn no_record_is_the_hosts_to_decide() {
        assert_eq!(status(None), Status::Unknown);
        assert!(is_open(None));
        assert_eq!(closed_words(None), None);
    }

    // The marks' order over Chicago at the 2026-10-29 cycle's figures:
    // O'Hare (Class B, 13,000 ft) before Midway (Class C, 6,522 ft)
    // before DuPage (towered, 7,571 ft) before Chicago Executive (towered,
    // 5,001 ft) before Lansing (public, 4,002 ft); a short public field,
    // a private strip, then a heliport, last.
    #[test]
    fn the_class_b_field_comes_first() {
        let ord = mark_rank("A", "PU", true, 13_000, Some("B"));
        let mdw = mark_rank("A", "PU", true, 6_522, Some("C"));
        let dpa = mark_rank("A", "PU", true, 7_571, None);
        let pwk = mark_rank("A", "PU", true, 5_001, None);
        let igq = mark_rank("A", "PU", false, 4_002, None);
        let short = mark_rank("A", "PU", false, 2_000, None);
        let ll22 = mark_rank("A", "PR", false, 2_813, None);
        let pad = mark_rank("H", "PR", false, 0, Some("B"));
        assert_eq!([ord.tier, mdw.tier, pwk.tier, igq.tier, short.tier, ll22.tier, pad.tier], [0, 0, 0, 1, 2, 3, 4]);
        let orders = [ord, mdw, dpa, pwk, igq, short, ll22, pad].map(|r| r.order);
        assert!(orders.windows(2).all(|w| w[0] < w[1]), "{orders:?}");
        assert_eq!(ord.order, 86_999);
        let sizes = [ord, mdw, dpa, igq, short, ll22, pad].map(|r| r.size);
        assert_eq!(sizes, ["largest", "larger", "regular", "regular", "small", "small", "small"]);
    }

    // A seaplane base with a long hard runway is public, not "long hard",
    // which is the airport's; codes read trimmed and in capitals.
    #[test]
    fn the_codes_as_nasr_writes_them() {
        assert_eq!(mark_rank(" c ", "pu", false, 5_000, None).tier, 2);
        assert_eq!(mark_rank("A", " pu ", false, 3_000, None).tier, 1);
        assert_eq!(mark_rank("A", "PU", true, 200_000, Some("b")).order, 0);
    }

    // NASR APT_RWY's codes, each side of the rule (the overlays' cases).
    #[test]
    fn a_hard_surface_is_one_paved_all_through() {
        for code in ["ASPH", "CONC", "asph-conc", "ASPH-TRTD", "PEM", "PFC", "BRICK", "ASPH/CONC"] {
            assert!(hard_surface(code), "{code}");
        }
        for code in ["ASPH-TURF", "TURF", "GRVL", "TRTD", "WATER", ""] {
            assert!(!hard_surface(code), "{code}");
        }
    }
}
