//! A flat frame about a point: nautical miles east and north of it, the
//! engine's one copy of the measure its small, local questions take (a
//! traffic display's closest approach, a flown track against an
//! approach's path or a leg, the IFR floor's 4 nm off a course piece).
//!
//! It is the old navigator's approximation, not a tangent plane on the
//! ellipsoid: a minute of latitude is a nautical mile (60 nm a degree)
//! and a minute of longitude is cos(latitude) of one, the latitude the
//! frame's scale is taken at. Its callers were written, and their tests
//! pinned, on exactly this, so it stays. Against WGS-84's geodesic
//! (NGA TR8350.2, GeographicLib's inverse) a distance in it is within
//! 0.5% to 50 deg of latitude and 0.7% to 72 deg (the US, Alaska too)
//! within 15 nm of the origin, within 1% to 72 deg at 30 nm: the
//! ellipsoid's own scale is 59.7 to 60.3 nm a degree of latitude and up
//! to 0.5% more than 60 cos(latitude) a degree of longitude (its radii
//! of curvature M and N), and the flat plane's error grows with the
//! distance beyond that. Anything longer is a geodesic (crate::geo).
//! The longitude difference is taken the short way round, so a frame
//! across the antimeridian (the Aleutians) stays flat.

/// Nautical miles east and north of a point, flat.
#[derive(Clone, Copy, Debug)]
pub struct Flat {
    lat0: f64,
    lon0: f64,
    kx: f64,
}

impl Flat {
    /// The frame about (lat0, lon0), its east scale taken there.
    pub fn about(lat0: f64, lon0: f64) -> Flat {
        Flat::scaled_at(lat0, lat0, lon0)
    }

    /// The frame about (lat0, lon0), its east scale taken at `scale_lat`
    /// (a segment's middle, say). The radians are `deg * PI / 180` in
    /// that order, as the web's lib/geo writes them, a last bit apart
    /// from Rust's to_radians, so a figure ported from it comes out the
    /// same.
    pub fn scaled_at(scale_lat: f64, lat0: f64, lon0: f64) -> Flat {
        Flat { lat0, lon0, kx: (scale_lat * std::f64::consts::PI / 180.0).cos() * 60.0 }
    }

    /// (east, north) of (lat, lon) from the frame's point, nm.
    pub fn nm(&self, lat: f64, lon: f64) -> (f64, f64) {
        let d = lon - self.lon0;
        let d = if d > 180.0 {
            d - 360.0
        } else if d < -180.0 {
            d + 360.0
        } else {
            d
        };
        (d * self.kx, (lat - self.lat0) * 60.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_minute_of_latitude_is_a_mile_and_of_longitude_its_cosine() {
        let f = Flat::about(60.0, -150.0);
        let (x, y) = f.nm(61.0, -149.0);
        assert!((y - 60.0).abs() < 1e-12 && (x - 30.0).abs() < 1e-9, "{x} {y}");
        let (x, _) = Flat::scaled_at(0.0, 60.0, -150.0).nm(60.0, -149.0);
        assert!((x - 60.0).abs() < 1e-12, "{x}");
    }

    #[test]
    fn across_the_antimeridian_it_is_the_short_way_round() {
        // A frame at 179.9 E, a point at 179.9 W: 0.2 deg east of it,
        // not 359.8 deg west.
        let (x, _) = Flat::about(51.9, 179.9).nm(51.9, -179.9);
        assert!(x > 0.0 && (x - 0.2 * 60.0 * (51.9f64).to_radians().cos()).abs() < 1e-9, "{x}");
    }
}
