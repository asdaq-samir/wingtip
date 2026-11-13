//! A position on an approach plate's page: where the pilot is drawn on the
//! FAA plate shown full screen (the owner, 2026-11-13: "Can the current
//! position show on the plate when in full screen as well?"), as an EFB's
//! geo-referenced plates draw own ship.
//!
//! The d-TPP's plates are GeoPDFs (ISO 32000-2 12.9): the page's viewport
//! names a Lambert conformal conic projection on NAD 83 (its WKT's
//! GCS_North_American_1983, spheroid GRS_1980) and four points of the page
//! with their latitude and longitude, of which the page is an affine
//! picture. The planner reads that and fits the affine
//! (wingtip.plates.Georeference, wingtip.plate_page.georeference); here a
//! latitude and longitude goes through the projection forward and the
//! affine onto the page -- the very inverse the planner places the plate
//! by, worked exactly rather than between the page's four corners.
//!
//! The projection is Snyder's, J. P. Snyder, "Map Projections -- A Working
//! Manual", USGS Professional Paper 1395 (1987), pp. 107-109, for the
//! ellipsoid: eqs. (14-15) for m, (15-9) for t, (15-8) for n, (15-10) for
//! F, (15-7) for rho and rho0, (14-4) for theta, and (14-1), (14-2) for x
//! and y; with no false easting or northing, as the planner's affine is
//! fitted to (it takes in the plate's own offsets).
//!
//! A GPS's position is on WGS 84 and the plate's on NAD 83, which differ
//! by a metre or two over the lower 48 (NGA TR8350.2, 3rd ed., 2.1): at a
//! plan view's 1:500,000 that is a hundredth of a point, far under a
//! pixel, so the position goes on the page as it comes.
//!
//! Only the plan view is drawn to scale (the d-TPP's legend), and an inset
//! inside it -- the airport sketch's box in a corner -- is not: a position
//! outside the plan view's box, or inside an inset, is not drawn at all.

use crate::ask::{num_in, Ask};
use crate::geo::{destination, py_mod, EQUATORIAL_RADIUS_M};
use crate::json::{self, Value};

/// GRS 80, NAD 83's ellipsoid (H. Moritz, "Geodetic Reference System
/// 1980", Bulletin Geodesique 54:395-405, 1980): a = 6,378,137 m and
/// 1/f = 298.257222101, as the plates' WKT gives it. Its a is WGS-84's,
/// geo's one; its flattening is its own.
const GRS80_A: f64 = EQUATORIAL_RADIUS_M;
const GRS80_INV_F: f64 = 298.257_222_101;

/// How far ahead along the track a second point is taken, nm, for the
/// track's direction on the page: a mile, over which the projection's
/// convergence and the page's affine are straight to far under a degree.
const TRACK_PROBE_NM: f64 = 1.0;

/// A Lambert conformal conic projection with two standard parallels on an
/// ellipsoid (Snyder, ch. 15), degrees in, metres out.
pub struct Lambert {
    e: f64,
    n: f64,
    af: f64,
    rho0: f64,
    lon0: f64,
}

impl Lambert {
    /// On an ellipsoid of semi-major axis `a`, metres, and eccentricity
    /// squared `e2`; origin `lat0`, central meridian `lon0`, standard
    /// parallels `lat1` and `lat2`, degrees.
    pub fn new(a: f64, e2: f64, lat0: f64, lon0: f64, lat1: f64, lat2: f64) -> Self {
        let e = e2.sqrt();
        // (14-15): m = cos(phi) / sqrt(1 - e^2 sin^2(phi)).
        let m = |phi: f64| phi.cos() / (1.0 - e2 * phi.sin().powi(2)).sqrt();
        let (p1, p2) = (lat1.to_radians(), lat2.to_radians());
        let (m1, m2) = (m(p1), m(p2));
        let (t0, t1, t2) = (t_of(e, lat0.to_radians()), t_of(e, p1), t_of(e, p2));
        // (15-8); one standard parallel (the tangent cone) is (15-4)'s
        // limit, n = sin(phi1).
        let n = if (lat1 - lat2).abs() < 1e-10 { p1.sin() } else { (m1.ln() - m2.ln()) / (t1.ln() - t2.ln()) };
        // (15-10): F = m1 / (n t1^n); a F once, as (15-7) uses it.
        let af = a * m1 / (n * t1.powf(n));
        Lambert { e, n, af, rho0: af * t0.powf(n), lon0 }
    }

    /// NAD 83's GRS 80, as the d-TPP's GeoPDFs name it.
    pub fn grs80(lat0: f64, lon0: f64, lat1: f64, lat2: f64) -> Self {
        let f = 1.0 / GRS80_INV_F;
        Lambert::new(GRS80_A, 2.0 * f - f * f, lat0, lon0, lat1, lat2)
    }

    /// (x, y) in metres, easting and northing from the origin.
    pub fn forward(&self, lat: f64, lon: f64) -> (f64, f64) {
        // (15-7): rho = a F t^n.
        let rho = self.af * t_of(self.e, lat.to_radians()).powf(self.n);
        // (14-4): theta = n (lambda - lambda0), the difference taken the
        // short way round.
        let theta = self.n * (py_mod(lon - self.lon0 + 180.0, 360.0) - 180.0).to_radians();
        // (14-1), (14-2).
        (rho * theta.sin(), self.rho0 - rho * theta.cos())
    }
}

/// (15-9): t = tan(pi/4 - phi/2) / ((1 - e sin(phi)) / (1 + e sin(phi)))^(e/2).
fn t_of(e: f64, phi: f64) -> f64 {
    let es = e * phi.sin();
    (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan() / ((1.0 - es) / (1.0 + es)).powf(e / 2.0)
}

/// A box on the page, in points from its bottom left.
#[derive(Clone, Copy)]
pub struct PageBox {
    pub left: f64,
    pub bottom: f64,
    pub right: f64,
    pub top: f64,
}

impl PageBox {
    fn holds(&self, x: f64, y: f64) -> bool {
        self.left < x && x < self.right && self.bottom < y && y < self.top
    }
}

/// A plate's georeference as the planner gives it (PlateGeoreference).
pub struct PlateGeoreference {
    pub projection: Lambert,
    /// x = a E + b N + c, y = d E + e N + f: projection metres to page
    /// points from the bottom left.
    pub to_page: [f64; 6],
    pub width_pt: f64,
    pub height_pt: f64,
    pub plan_view: PageBox,
    pub insets: Vec<PageBox>,
}

/// Where a position is drawn on the page: fractions of its width across
/// from the left and of its height down from the top (so of its picture
/// at any scale), and the track's direction on the page, degrees
/// clockwise from the page's up, where a track is given.
#[derive(Debug, PartialEq)]
pub struct PagePoint {
    pub x: f64,
    pub y: f64,
    pub rotation_deg: Option<f64>,
}

impl PlateGeoreference {
    /// A point on the ground on the page, in points from its bottom left,
    /// wherever it falls.
    pub fn page_of(&self, lat: f64, lon: f64) -> (f64, f64) {
        let (e, n) = self.projection.forward(lat, lon);
        let [a, b, c, d, ee, f] = self.to_page;
        (a * e + b * n + c, d * e + ee * n + f)
    }

    /// The position on the page, or None where it falls outside the plan
    /// view or inside an inset, where the page is not to scale with the
    /// ground. `track_deg` is true, as a GPS's track is: it is turned
    /// onto the page by the page itself (the projection's convergence and
    /// the page's own turn), by a point a mile ahead put on it too.
    pub fn point(&self, lat: f64, lon: f64, track_deg: Option<f64>) -> Option<PagePoint> {
        let (x, y) = self.page_of(lat, lon);
        if !(x.is_finite() && y.is_finite()) || !self.plan_view.holds(x, y) || self.insets.iter().any(|i| i.holds(x, y)) {
            return None;
        }
        let rotation_deg = track_deg.filter(|t| t.is_finite()).map(|t| {
            let (lat2, lon2) = destination(lat, lon, t, TRACK_PROBE_NM);
            let (x2, y2) = self.page_of(lat2, lon2);
            // The page's y runs up: clockwise from up is atan2(dx, dy).
            py_mod((x2 - x).atan2(y2 - y).to_degrees(), 360.0)
        });
        Some(PagePoint { x: x / self.width_pt, y: 1.0 - y / self.height_pt, rotation_deg })
    }
}

fn page_box(name: &str, v: &Value) -> Result<PageBox, String> {
    Ok(PageBox {
        left: num_in(name, v, "left")?,
        bottom: num_in(name, v, "bottom")?,
        right: num_in(name, v, "right")?,
        top: num_in(name, v, "top")?,
    })
}

/// The georeference read from the rule's input.
pub fn georeference_of(name: &str, g: &Value) -> Result<PlateGeoreference, String> {
    let to_page: Vec<f64> =
        g.get("to_page").and_then(Value::as_array).map(|l| l.iter().filter_map(Value::as_f64).collect()).unwrap_or_default();
    let to_page: [f64; 6] = to_page.try_into().map_err(|_| format!("{name}: \"to_page\" is not six numbers"))?;
    let plan_view = page_box(name, g.get("plan_view").ok_or_else(|| format!("{name}: \"plan_view\" is missing"))?)?;
    let insets = match g.get("insets").and_then(Value::as_array) {
        Some(list) => list.iter().map(|b| page_box(name, b)).collect::<Result<_, _>>()?,
        None => Vec::new(),
    };
    Ok(PlateGeoreference {
        projection: Lambert::grs80(
            num_in(name, g, "lat_0")?,
            num_in(name, g, "lon_0")?,
            num_in(name, g, "lat_1")?,
            num_in(name, g, "lat_2")?,
        ),
        to_page,
        width_pt: num_in(name, g, "width_pt")?,
        height_pt: num_in(name, g, "height_pt")?,
        plan_view,
        insets,
    })
}

/// `plate_page_point`: {"lat", "lon", "track_deg" (or null), "georeference"}
/// to {"x", "y", "rotation_deg"} or null (PlateGeoreference::point).
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let geo = georeference_of(name, v.get("georeference").ok_or_else(|| format!("{name}: \"georeference\" is missing"))?)?;
    let mut out = String::new();
    match geo.point(ask.num("lat")?, ask.num("lon")?, ask.opt_num("track_deg")?) {
        None => out.push_str("null"),
        Some(p) => {
            out.push_str("{\"x\":");
            json::number(&mut out, p.x);
            out.push_str(",\"y\":");
            json::number(&mut out, p.y);
            out.push_str(",\"rotation_deg\":");
            json::opt_number(&mut out, p.rotation_deg);
            out.push('}');
        }
    }
    Ok(out)
}

#[cfg(test)]
#[path = "plate_tests.rs"]
mod tests;
