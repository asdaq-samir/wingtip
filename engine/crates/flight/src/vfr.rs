//! 14 CFR 91.155's basic VFR weather minimums, one copy for every crate
//! that asks them: the airspace over a point (wingtip_airspace::rules),
//! the altitude plan's distance under a cloud base
//! (wingtip_altitude::clouds), route options' fields under minimums and
//! the briefing's "VFR flight not recommended" line. They were written
//! out in each of those before (the aviation audit, 2026-11-08).

/// 91.155(c): no VFR beneath a ceiling lower than 1,000 ft within the
/// lateral boundaries of the surface areas of controlled airspace
/// designated to the surface for an airport ...
pub const SURFACE_AREA_CEILING_FT: f64 = 1000.0;
/// ... and 91.155(d): nor there with a ground visibility under 3 statute
/// miles, without a special VFR clearance (91.157). These are the surface
/// area's minimums, not the least VFR ever asks (Class G at or below
/// 1,200 ft above the surface asks 1 sm and clear of clouds by day,
/// 91.155(a), and special VFR 1 sm, 91.157(b)(3)); the planner holds
/// every route to them, the safer reading.
pub const SURFACE_AREA_VISIBILITY_SM: f64 = 3.0;

/// 91.155(a)'s table under 10,000 ft MSL (Class C, D and E, and Class G
/// at night or more than 1,200 ft above the surface): 3 statute miles,
/// 500 ft below the clouds, 1,000 ft above and 2,000 ft horizontal.
pub const VISIBILITY_SM: f64 = 3.0;
pub const CLOUD_BELOW_FT: f64 = 500.0;
pub const CLOUD_ABOVE_FT: f64 = 1000.0;
pub const CLOUD_HORIZONTAL_FT: f64 = 2000.0;

/// 91.155(a)'s rows "at or above 10,000 feet MSL" (Class E, and Class G
/// more than 1,200 ft above the surface): 5 statute miles, 1,000 ft below
/// and above the clouds and 1 statute mile horizontal.
pub const HIGH_FROM_MSL_FT: f64 = 10_000.0;
pub const HIGH_VISIBILITY_SM: f64 = 5.0;
pub const HIGH_CLOUD_BELOW_FT: f64 = 1000.0;
pub const HIGH_CLOUD_ABOVE_FT: f64 = 1000.0;
pub const HIGH_CLOUD_HORIZONTAL_FT: f64 = wingtip_core::units::FT_PER_SM;

/// Class G's rows split at 1,200 ft above the surface (91.155(a)): at or
/// below it by day, 1 statute mile and clear of clouds; more than 1,200 ft
/// above the surface but under 10,000 ft MSL by day, 1 statute mile with
/// the standard distances from clouds.
pub const CLASS_G_LOW_AGL_FT: f64 = 1200.0;
pub const CLASS_G_DAY_VISIBILITY_SM: f64 = 1.0;

/// 14 CFR 91.155(b)(2), the one exception to 91.155(a) for an airplane:
/// "the following operations may be conducted in Class G airspace below
/// 1,200 feet above the surface: ... If the visibility is less than 3
/// statute miles but not less than 1 statute mile during night hours and
/// you are operating in an airport traffic pattern within 1/2 mile of the
/// runway, you may operate an airplane ... clear of clouds" (eCFR, current
/// on 2026-11-21). By day the table's own low row already asks 1 sm and
/// clear of clouds; 91.155(b)(1) is the helicopter's, and the app plans
/// airplanes. "Below 1,200 feet", where the table's row is "1,200 feet or
/// less": at 1,200 ft exactly the exception is not there.
pub const PATTERN_LEAST_VISIBILITY_SM: f64 = 1.0;
/// ... and it is for a visibility under 3 statute miles: at 3 or more
/// the table's night row (3 sm, 500 ft below, 1,000 above, 2,000
/// horizontal) is the rule again.
pub const PATTERN_UNDER_VISIBILITY_SM: f64 = 3.0;

/// 91.155(b)(2) in the words the drill and the rule give it.
pub const NIGHT_PATTERN_WORDS: &str =
    "Under 3 sm but not under 1 sm at night, an airplane in the traffic pattern within 1/2 mile of the runway may fly clear of clouds (91.155(b)(2)).";

/// Whether 91.155(b)(2) lets an airplane fly clear of clouds in Class G:
/// below 1,200 ft above the surface, at night, in an airport traffic
/// pattern within 1/2 mile of the runway, with a visibility under 3 but
/// not under 1 statute mile (`None`, not known: the other conditions
/// decide, and the 1 sm is the pilot's to see).
pub fn night_pattern_exception(class_g: bool, agl_ft: f64, night: bool, in_pattern: bool, visibility_sm: Option<f64>) -> bool {
    class_g
        && agl_ft < CLASS_G_LOW_AGL_FT
        && night
        && in_pattern
        && visibility_sm.is_none_or(|v| (PATTERN_LEAST_VISIBILITY_SM..PATTERN_UNDER_VISIBILITY_SM).contains(&v))
}
