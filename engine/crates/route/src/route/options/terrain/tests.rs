use super::*;

/// A ridge 12,000 ft high across the straight line at 1 to 2 degrees
/// east, from 1 degree south to 3 north; low ground elsewhere.
fn ridge(f: &Frame) -> Vec<f64> {
    let (rows, cols) = (f.rows * PER_CELL, f.cols * PER_CELL);
    let step = CELL_DEG / PER_CELL as f64;
    let mut out = vec![500.0; rows * cols];
    for r in 0..rows {
        let lat = f.lat0 + (r as f64 + 0.5) * step;
        for c in 0..cols {
            let lon = f.lon0 + (c as f64 + 0.5) * step;
            if lon > 1.0 && lon < 2.0 && lat > -1.0 && lat < 3.0 {
                out[r * cols + c] = 12000.0;
            }
        }
    }
    out
}

fn field(ident: &str, lat: f64, lon: f64) -> Field {
    Field { ident: ident.into(), name: format!("{ident} FIELD"), at: (lat, lon) }
}

#[test]
fn the_highest_cruise_either_way_under_the_ceiling() {
    // A PA-28-140's 10,950 ft: 9,500 east, 10,500 west, the lower kept.
    assert_eq!(highest_cruise_ft(Some(10_950.0)), 9_500.0);
    assert_eq!(highest_cruise_ft(Some(13_500.0)), 12_500.0);
    // Never into Class A (14 CFR 71.33).
    assert_eq!(highest_cruise_ft(Some(25_000.0)), 16_500.0);
}

#[test]
fn round_a_ridge_by_the_field_at_its_end() {
    let (start, end) = ((0.0, 0.0), (0.0, 3.0));
    let heights = ridge(&frame(start, end));
    let fields = vec![field("SOUTH", -1.6, 1.5), field("NORTH", 3.6, 1.5), field("ONRIDGE", 0.0, 1.5)];
    let way = way_round(start, end, 10_950.0, &heights, &fields).unwrap().unwrap();
    let idents: Vec<&str> = way.iter().map(|s| s.field.as_ref().map_or("", |f| f.0.as_str())).collect();
    assert_eq!(idents, vec!["SOUTH"]);
}

#[test]
fn a_clear_line_needs_no_way_round() {
    let (start, end) = ((0.0, 0.0), (0.0, 3.0));
    let f = frame(start, end);
    let flat = vec![0.0; f.rows * PER_CELL * f.cols * PER_CELL];
    assert!(way_round(start, end, 10_950.0, &flat, &[]).unwrap().unwrap().is_empty());
}

#[test]
fn the_fields_near_the_way_are_those_the_ellipsoid_puts_within_its_reach() {
    // Fields on rings 30 to 50 nm round a way's points, the edge at 40 nm
    // most of them, at the equator, 60 degrees north and across the
    // antimeridian (a frame's longitudes past 180): near_way's sphere and
    // box must keep exactly those every geodesic would.
    for &(lat, lon) in &[(0.0, 0.0), (60.0, -100.0), (51.0, 179.5)] {
        let way: Vec<Point> = (0..20).map(|i| (lat + 0.05 * i as f64, lon + 0.1 * i as f64)).collect();
        let mut fields = Vec::new();
        for (k, nm) in [30.0, 39.0, 39.6, 39.9, 39.99, 40.0, 40.01, 40.1, 40.4, 41.0, 50.0].iter().enumerate() {
            for b in 0..24 {
                let p = way[(k * 7 + b) % way.len()];
                let (la, lo) = geo::destination(p.0, p.1, b as f64 * 15.0, *nm);
                fields.push(field(&format!("F{k}_{b}"), la, wingtip_core::geo::lon_near(lo, lon)));
            }
        }
        let every: Vec<&str> = fields
            .iter()
            .filter(|fd| way.iter().any(|p| geo::distance_nm(p.0, p.1, fd.at.0, fd.at.1) <= FIELD_NM))
            .map(|fd| fd.ident.as_str())
            .collect();
        let near: Vec<&str> = near::near_way(&way, &fields).iter().map(|fd| fd.ident.as_str()).collect();
        assert_eq!(near, every, "round ({lat}, {lon})");
        assert!(every.len() > 100 && every.len() < fields.len());
    }
}
