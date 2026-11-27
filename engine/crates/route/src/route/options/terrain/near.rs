//! The fields near the way round (terrain.rs), found without measuring
//! each against each of the way's points on the ellipsoid.

use super::{Field, FIELD_NM};
use crate::geo;
use wingtip_core::grid::Point;

/// The fields within FIELD_NM of any of `way`'s points, in their order.
/// Only a field the sphere's distance (geo::sphere_nm) cannot place either
/// side of FIELD_NM, within SPHERE_WITHIN, is measured on the ellipsoid,
/// and only fields inside the points' box padded by FIELD_NM (corridor_bbox,
/// whose pad nothing that near lies past) are looked at: a fuel table's
/// 1,000 to 2,000 fields against 200 points were 200,000 to 400,000
/// geodesics, the most of an uncached way round.
pub(super) fn near_way<'a>(way: &[Point], fields: &'a [Field]) -> Vec<&'a Field> {
    let low = way.iter().fold((f64::INFINITY, f64::INFINITY), |m, p| (m.0.min(p.0), m.1.min(p.1)));
    let high = way.iter().fold((f64::NEG_INFINITY, f64::NEG_INFINITY), |m, p| (m.0.max(p.0), m.1.max(p.1)));
    let (s, w, n, e) = geo::corridor_bbox(low, high, FIELD_NM);
    // Within a few degrees of a pole corridor_bbox's pad east and west
    // stops growing (its cosine held at 0.05), too little there: every
    // field is then measured.
    let boxed = s > -85.0 && n < 85.0;
    let (inside, outside) = (FIELD_NM * (1.0 - geo::SPHERE_WITHIN), FIELD_NM * (1.0 + geo::SPHERE_WITHIN));
    fields
        .iter()
        .filter(|fd| !boxed || (fd.at.0 >= s && fd.at.0 <= n && fd.at.1 >= w && fd.at.1 <= e))
        .filter(|fd| {
            way.iter().any(|p| {
                let rough = geo::sphere_nm(p.0, p.1, fd.at.0, fd.at.1);
                rough <= inside || (rough <= outside && geo::distance_nm(p.0, p.1, fd.at.0, fd.at.1) <= FIELD_NM)
            })
        })
        .collect()
}
