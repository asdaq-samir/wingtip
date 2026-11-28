//! The map's view from the phone's packs, with no network: the Class B, C
//! and D, the landing fields and the VORs inside a box, each as the
//! planner's endpoint answers it -- /api/airspace/in-view (AirspaceInView,
//! wingtip.airspace_map), /api/airports/in-view (AirportPin, wingtip.airports) and
//! /api/navaids/in-view (VorPin, wingtip.fixes) -- as JSON with the same field
//! names and the same nulls, so the native app decodes it as it decodes
//! the planner's and draws the chart's overlays from the packs it keeps.
//!
//! What a phone pack (wingtip.cycle_pack's `write_phone`) holds of each, and what it
//! cannot, which is answered null:
//!
//! - The airspace layer's rings (crate::pack, simplified to the phone's
//!   tolerance) with `airspace.vol` (crate::pack_query) and `airspace.attr`, one
//!   JSON object a volume: its primary field's `ident`, its `number` among
//!   the nation's Class B, C and D (the planner's `id` is "ORD-67"), whether
//!   its top is excluded (`ceiling_excluded`) and when it is in effect
//!   (`hours_code`, `hours_remark`). A pack written before the attr has
//!   those null, its `id` the class and the name, and no field is the
//!   primary of anything.
//! - The `airports` table (NASR's APT_BASE rows): the fields with a
//!   SITE_TYPE_CODE of A in service, by their ICAO ident where they have
//!   one, else the FAA's. The planner lists OurAirports' fields and names
//!   them as OurAirports does; here the name is NASR's, set in title case.
//!   `kind` is the SIZE column, OurAirports' size written into the pack
//!   (wingtip.pack_airports.airport_sizes); a pack without it has every field "other".
//!   `military` is OWNERSHIP_TYPE_CODE's, null from a pack without that
//!   column. `towered` is whether TWR_TYPE_CODE names a control tower
//!   (ATCT, ATCT-A/C, ATCT-TRACON and the rest; NON-ATCT is none), as
//!   wingtip.faa_data.towered_fields reads it, false from a pack without
//!   that column: the sectional draws a towered field blue and every
//!   other magenta (FAA Aeronautical Chart User's Guide, VFR Terms and
//!   Symbols, Airports). `flight_category` is a live METAR's and always
//!   null here.
//!   `airspace_class` is read off the pack's own airspace, as
//!   wingtip.airspace.surface_classes reads it off the file: the lowest class
//!   whose floor is the surface over the field, else E where a Class E
//!   reaches the surface there, else G. The planner lists the fields that
//!   report their weather first; with no weather here, the biggest first
//!   and then by ident, at most AIRPORT_LIMIT as the planner's default.
//!   `mark_order` and `mark_size` are the overlay tiles' mark, by the
//!   HARD_FT column (crate::view_airports, where the airports are read).
//! - The `navaids` table (NAV_BASE rows): the VORs, VOR/DMEs and VORTACs
//!   not shut down, by ident, as wingtip.fixes keeps them. `service_volume`
//!   and `hours` are ALT_CODE and OPER_HOURS, null from a pack without
//!   those columns. `remarks` is NAV_RMK's, which no pack holds: always
//!   empty. `fixes` is what the planner answers unasked: empty.
//!
//! A volume's lines are drawn as wingtip.airspace_map draws them: every ring
//! oriented with the volume on its left in lon/lat (its outside
//! counter-clockwise, its holes clockwise), then simplified under a pixel
//! for the box asked (`tolerance_for`) and written [lat, lon] to five
//! places, whole rather than clipped. The pack's rings are already
//! simplified to PHONE_TOLERANCE_DEG, so close in a line may have fewer
//! points than the planner's, within that of it. The label's point is the
//! widest horizontal section's middle on the shell's safe bisector, as
//! GEOS's InteriorPointArea (shapely's representative_point) finds it;
//! on the simplified ring it can differ from the planner's by a little.

use crate::geo;
use crate::json::{self, Value};
use crate::pack::f64_at;
use crate::pack::u32_at;
use crate::{pack::Pack, sort::StableSort};

/// The planner's defaults: at most this many fields, and this many VORs.
pub const AIRPORT_LIMIT: usize = 300;
pub const NAVAID_LIMIT: usize = 500;

/// wingtip.airspace_map's: the finest a line is simplified to, and a box's
/// share of its height, in degrees.
pub const MIN_TOLERANCE_DEG: f64 = 0.00005;
pub const TOLERANCE_PER_BOX: f64 = 1.0 / 12000.0;

/// How far a line may be moved in simplifying it for a box this tall.
pub fn tolerance_for(south: f64, north: f64) -> f64 {
    MIN_TOLERANCE_DEG.max((north - south) * TOLERANCE_PER_BOX)
}

// The VORs and every navaid kind, the likelier to fly to first.
pub(crate) use crate::navaid_kinds::{NAVAID_KINDS, VOR_KINDS};
/// wingtip.fixes' SAME_FACILITY_NM: two navaids by one ident this close are
/// one facility filed twice.
const SAME_FACILITY_NM: f64 = 1.0;

/// A point as (lon, lat), the shapes' own order.
pub(crate) type Pt = (f64, f64);

/// (west, south, east, north): min lon, min lat, max lon, max lat, as a
/// layer's boxes are.
pub(crate) type Bbox = [f64; 4];

pub(crate) fn text_at<'a>(names: &'a [u8], record: &[u8], at: usize) -> Option<&'a str> {
    let (o, l) = (u32_at(record, at)? as usize, u32_at(record, at + 4)? as usize);
    std::str::from_utf8(names.get(o..o + l)?).ok()
}

pub(crate) fn meets(b: Bbox, view: Bbox) -> bool {
    !(b[2] < view[0] || b[0] > view[2] || b[3] < view[1] || b[1] > view[3])
}

pub(crate) fn in_box(p: Pt, view: Bbox) -> bool {
    p.0 >= view[0] && p.0 <= view[2] && p.1 >= view[1] && p.1 <= view[3]
}

/// Python's round(v, 5), near enough: a tie at the sixth place is the
/// only difference, and no coordinate lands on one.
pub(crate) fn round5(v: f64) -> f64 {
    (v * 1e5).round() / 1e5
}

// --- Rings --------------------------------------------------------------------

mod rings;
pub use rings::*;
mod inview;
pub use inview::*;
mod navaids;
pub use navaids::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rings_are_oriented_with_the_volume_on_the_left() {
        // A shapefile's clockwise square with a counter-clockwise hole.
        let outer = vec![(0.0, 0.0), (0.0, 10.0), (10.0, 10.0), (10.0, 0.0)];
        let hole = vec![(4.0, 4.0), (6.0, 4.0), (6.0, 6.0), (4.0, 6.0)];
        let polygons = oriented(vec![vec![outer, hole]]);
        assert_eq!(polygons.len(), 1);
        assert!(signed_area(&polygons[0].shell) > 0.0);
        assert!(signed_area(&polygons[0].holes[0]) < 0.0);
        // A hole nothing holds is a polygon of its own, left as it is.
        let orphan = vec![(20.0, 20.0), (21.0, 20.0), (21.0, 21.0), (20.0, 21.0)];
        let polygons = oriented(vec![vec![orphan.clone()]]);
        assert_eq!(polygons[0].shell, orphan);
    }

    #[test]
    fn a_box_is_met_by_a_line_through_it_or_a_corner_inside() {
        let square = oriented(vec![vec![vec![(0.0, 0.0), (0.0, 10.0), (10.0, 10.0), (10.0, 0.0)]]]);
        assert!(reaches(&square, [2.0, 2.0, 3.0, 3.0]));
        assert!(reaches(&square, [-1.0, 5.0, 1.0, 6.0]));
        assert!(reaches(&square, [-1.0, -1.0, 11.0, 11.0]));
        assert!(!reaches(&square, [11.0, 11.0, 12.0, 12.0]));
        assert!(!segment_meets((11.0, 0.0), (11.0, 10.0), [0.0, 0.0, 10.0, 10.0]));
    }

    #[test]
    fn simplifying_keeps_the_ends_and_the_far_points() {
        let line = vec![(0.0, 0.0), (1.0, 0.01), (2.0, 0.0), (3.0, 1.0), (4.0, 0.0)];
        // (2, 0) is kept once (3, 1) is: it is far off the line to it.
        assert_eq!(simplified(&line, 0.1), vec![(0.0, 0.0), (2.0, 0.0), (3.0, 1.0), (4.0, 0.0)]);
        assert_eq!(simplified(&line, 0.0), line);
    }

    #[test]
    fn the_label_is_in_the_widest_section() {
        let square = oriented(vec![vec![
            vec![(0.0, 0.0), (0.0, 10.0), (10.0, 10.0), (10.0, 0.0)],
            vec![(4.0, 4.0), (6.0, 4.0), (6.0, 6.0), (4.0, 6.0)],
        ]]);
        // The bisector at 5 cuts the hole: two sections of 4, the first
        // kept, as JTS keeps it.
        assert_eq!(representative(&square).unwrap(), (2.0, 5.0));
        let tall = oriented(vec![vec![vec![(0.0, 0.0), (0.0, 10.0), (1.0, 10.0), (1.0, 0.0)]]]);
        assert_eq!(representative(&tall).unwrap(), (0.5, 5.0));
    }
}
