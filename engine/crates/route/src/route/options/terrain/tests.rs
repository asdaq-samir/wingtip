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
