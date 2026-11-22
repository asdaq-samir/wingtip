//! The runway proximity advisor's figures, each with its source, or said
//! not to be the FAA's where it is a design allowance.

/// Own ship's fix: AC 120-76D 11.17.2.3's 3 s ("removal should take no
/// more than 3 seconds") and 11.17.2.4's 30 m, the same figures as
/// route's diagram rule (motion::diagram FIX_STALE_S and FIX_WORST_M);
/// brief sits under route, so they are stated again here.
pub const FIX_STALE_S: f64 = 3.0;
pub const FIX_WORST_M: f64 = 30.0;

/// Below this height above the field own ship is taken to be on the
/// surface, ft. Not an FAA figure: a GNSS height is good to tens of feet,
/// and a fix at 30 m (98 ft) horizontally is worse vertically, so 100 ft
/// keeps the surface's prompts through a takeoff roll and a flare. It errs
/// toward the surface: "On runway 27" over the numbers is a reminder, and
/// leaving it out on the ground would not be.
pub const SURFACE_AGL_FT: f64 = 100.0;

/// The holding position's distance from the runway centerline assumed for
/// a runway `width_ft` wide (None: not known), at a field `elevation_ft`
/// high. NASR gives no holding positions, so the farthest standard for a
/// runway that wide is taken -- AC 150/5300-13B Appendix G's Runway
/// Design Standards Matrices, "Runway centerline to: Holding Position":
///
/// - under 100 ft wide (Tables G-1 to G-4, runways 60 and 75 ft wide):
///   200 ft (G-2 and G-4; G-1 and G-3's small aircraft 125 ft);
/// - 100 to 149 ft (G-2 to G-5 and G-7 to G-9 at 100 ft): 250 ft;
/// - 150 ft and wider (G-6, G-10 to G-12), or not known: 280 ft (G-11's
///   lowest visibility, G-12), the most in any table;
///
/// plus footnote 8's foot for each 100 ft of elevation (G-6 and G-9 to
/// G-12; footnote 7, G-5's, only above 5,100 ft) on runways 100 ft wide
/// or more. The farthest errs toward the safe side: the advisor's line is
/// never past a standard painted one, only short of it. Every table puts
/// the parallel taxiway farther out than its holding position, but a small
/// field's (G-1's 150 ft) can sit inside the assumed 200 ft: a taxiway
/// parallel to the runway is not closing on it, so the advisor stays
/// quiet there (CLOSING_DEG).
pub fn hold_offset_ft(width_ft: Option<f64>, elevation_ft: Option<f64>) -> f64 {
    let elevation = elevation_ft.unwrap_or(0.0).max(0.0);
    match width_ft.filter(|w| w.is_finite() && *w > 0.0) {
        Some(w) if w < 100.0 => 200.0,
        Some(w) if w < 150.0 => 250.0 + elevation / 100.0,
        _ => 280.0 + elevation / 100.0,
    }
}

/// How far ahead of the holding position "approaching" is said, s at the
/// ground speed, with LEAD_LEAST_FT the least. Not an FAA figure: said
/// before the line rather than at it, in time to stop at a taxi's speed.
pub const LEAD_S: f64 = 10.0;
pub const LEAD_LEAST_FT: f64 = 150.0;

/// Closing on the runway: the track within this of the way to the
/// runway's centerline, degrees. Not an FAA figure: a taxiway that meets
/// the runway at an angle (a high-speed exit's 30°) still closes, a
/// parallel taxiway does not.
pub const CLOSING_DEG: f64 = 60.0;

/// Lined up in the air: the track within 30° of the runway, AIM 5-4-20's
/// straight-in alignment ("within 30 degrees of the runway alignment").
pub const LINED_UP_DEG: f64 = 30.0;

/// The glide path the lined-up window is measured on, degrees: AIM 2-1-2
/// a, a VASI's "normal glide path angles are three degrees". Out to where
/// it stands at the pattern's height (3.1 nm for 1,000 ft), so a straight
/// in and a normal final are both caught.
pub const GLIDE_PATH_DEG: f64 = 3.0;

/// Faster than this on the surface, lined up with a runway, own ship is
/// landing or taking off, not taxiing up to it, kt. Not an FAA figure: a
/// taxi is well under it and a light airplane's final well over (Vref is
/// 1.3 Vso, 14 CFR 97.3's approach category), so a short final under
/// SURFACE_AGL_FT is "Approaching runway 9", not a hold short line.
pub const TAXI_MOST_KT: f64 = 40.0;

/// A hot spot is named within this of own ship, ft. Not an FAA figure: a
/// taxi's half minute at 10 kt, time to read the diagram's note on it.
pub const HOT_SPOT_FT: f64 = 500.0;
