//! Which TAF speaks for a field: its own, else the nearest within
//! TAF_REACH_NM -- the briefing's forecast row and the Brief's glance (the
//! web's briefing/fieldWeather had it), as the altitude selection takes
//! the TAFs near a leg for its clouds (wingtip_altitude's
//! CLOUD_STATION_RADIUS_NM, this figure).

use crate::geo;
use wingtip_core::units::NM_PER_SM;

/// A TAF is the forecast for the area within 5 statute miles of the
/// airport's centre (FAA-H-8083-28B 27.4.1; NWSI 10-813),
/// its "vicinity" (VC) the ring from 5 to 10 sm. The one figure each
/// reach below starts from.
pub const TAF_AREA_SM: f64 = 5.0;
/// The same, nm (4.3).
pub const TAF_AREA_NM: f64 = TAF_AREA_SM * NM_PER_SM;
/// Its vicinity's outer edge, 10 sm (8.7 nm): twice the area.
pub const TAF_VICINITY_NM: f64 = 2.0 * TAF_AREA_NM;

/// How far a TAF is taken to speak for a field without one of its own,
/// and for the clouds over a leg (wingtip_altitude's
/// CLOUD_STATION_RADIUS_NM), nm: the planner's own choice, beyond the
/// TAF's 5 sm area and its 10 sm vicinity, so a field near a TAF is not
/// left with no forecast at all; the row says how far away the one it
/// reads is, so the pilot can weigh it.
pub const TAF_REACH_NM: f64 = 25.0;

/// A TAF station as the briefing lists it.
pub struct Station<'a> {
    pub icao_id: &'a str,
    pub at: Option<(f64, f64)>,
}

/// The station that speaks for the field `ident` at `at`: its own -- the
/// station whose ICAO id is the ident, or K and the ident for a
/// three-letter US ident -- by its index and no distance; else the nearest
/// within TAF_REACH_NM and how far it is; None past that.
pub fn field_taf(ident: &str, at: Option<(f64, f64)>, stations: &[Station]) -> Option<(usize, Option<f64>)> {
    let k = format!("K{ident}");
    if let Some(own) = stations.iter().position(|s| s.icao_id == ident || (ident.len() == 3 && s.icao_id == k)) {
        return Some((own, None));
    }
    let (lat, lon) = at?;
    stations
        .iter()
        .enumerate()
        .filter_map(|(i, s)| s.at.map(|(slat, slon)| (i, geo::distance_nm(lat, lon, slat, slon))))
        .filter(|&(_, nm)| nm <= TAF_REACH_NM)
        // The first of equals, as a stable sort leaves it.
        .fold(None, |best: Option<(usize, f64)>, (i, nm)| match best {
            Some((_, b)) if b <= nm => best,
            _ => Some((i, nm)),
        })
        .map(|(i, nm)| (i, Some(nm)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn its_own_else_the_nearest_within_reach() {
        let s = [Station { icao_id: "KRFD", at: Some((42.195, -89.097)) }, Station { icao_id: "KUGN", at: Some((42.422, -87.868)) }];
        assert_eq!(field_taf("UGN", None, &s), Some((1, None)));
        assert_eq!(field_taf("KRFD", None, &s), Some((0, None)));
        // C81, Campbell, about 11 nm from Waukegan and 45 from Rockford.
        let (i, nm) = field_taf("C81", Some((42.324, -88.074)), &s).unwrap();
        assert_eq!(i, 1);
        assert!(nm.unwrap() < TAF_REACH_NM);
        assert_eq!(field_taf("X", Some((45.0, -80.0)), &s), None);
    }
}
