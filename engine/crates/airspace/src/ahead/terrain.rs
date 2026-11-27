use super::*;

pub(super) fn clearance_level(seconds: f64, clearance: f64) -> Option<&'static str> {
    if seconds <= TERRAIN_WARNING_S && clearance < WARNING_CLEARANCE_FT {
        Some("warning")
    } else if clearance < TERRAIN_CLEARANCE_FT {
        Some("caution")
    } else {
        None
    }
}

/// The terrain look-ahead's points: the track and a line SWATH_NM either
/// side of it, three rows of (lats, lons) of the track's length.
pub(super) fn swath(track: &Track) -> Vec<(Vec<f64>, Vec<f64>)> {
    let n = track.times.len();
    let mut rows = vec![(track.lats.clone(), track.lons.clone())];
    for side in [-90.0, 90.0] {
        rows.push((0..n).map(|i| destination(track.lats[i], track.lons[i], track.track_deg + side, SWATH_NM)).unzip());
    }
    rows
}

/// The ground the next minute's track comes within 500 ft of: one alert
/// where it is least. `ground(row, i)` the ground at the swath's point;
/// None where any cannot be read.
pub(super) fn terrain_with(track: &Track, ground: &dyn Fn(usize, usize, f64, f64) -> Option<f64>) -> Option<Vec<Alert>> {
    let alts = track.alts.as_ref()?;
    let n = track.times.len();
    let rows = swath(track);
    let mut highest = vec![f64::NEG_INFINITY; n];
    let mut at_row = vec![0usize; n];
    for (k, (lats, lons)) in rows.iter().enumerate() {
        for i in 0..n {
            let g = ground(k, i, lats[i], lons[i])?;
            if g > highest[i] {
                highest[i] = g;
                at_row[i] = k;
            }
        }
    }
    let clearance: Vec<f64> = (0..n).map(|i| alts[i] - highest[i]).collect();
    // The worst of them: a warning before a caution, then the least clearance.
    let worst = (0..n)
        .filter_map(|i| clearance_level(track.times[i], clearance[i]).map(|l| (l, i)))
        .min_by(|a, b| (a.0 != "warning").cmp(&(b.0 != "warning")).then(clearance[a.1].partial_cmp(&clearance[b.1]).unwrap()));
    let Some((level, i)) = worst else { return Some(Vec::new()) };
    let (lats, lons) = &rows[at_row[i]];
    Some(vec![Alert {
        id: "terrain".into(),
        kind: "terrain",
        level,
        name: "Terrain".into(),
        need: if level == "warning" { TERRAIN_WARNING } else { TERRAIN_CAUTION }.into(),
        top_ft: Some(round_to(highest[i], -1)),
        clearance_ft: Some(round_to(clearance[i], -1)),
        lat: round_to(lats[i], 5),
        lon: round_to(lons[i], 5),
        ..at(track, i)
    }])
}

pub(super) fn terrain(packs: &[Pack], track: &Track) -> Option<Vec<Alert>> {
    terrain_with(track, &|_, _, lat, lon| ground_ft(packs, lat, lon))
}

/// An obstacle from the FAA's Digital Obstacle File: where it is, its top
/// (feet MSL) and its TYPE column ("TOWER", "STACK").
pub struct Obstacle {
    pub lat: f64,
    pub lon: f64,
    pub amsl_ft: f64,
    pub kind: String,
}

/// The registered obstacles within the swath of the next minute's track
/// (SWATH_NM either side, ahead of the airplane and no further than the
/// track reaches) whose tops come within 500 ft of its altitude when it
/// gets there: the nearest three, by when the airplane reaches them.
pub(super) fn obstacle_alerts(track: &Track, obstacles: &[Obstacle], gs_kt: f64) -> Vec<Alert> {
    let Some(alts) = track.alts.as_ref() else { return Vec::new() };
    let reach = *track.along.last().unwrap();
    if obstacles.is_empty() || reach <= 0.0 {
        return Vec::new();
    }
    let n = track.times.len();
    let (start, end) = ((track.lats[0], track.lons[0]), (track.lats[n - 1], track.lons[n - 1]));
    // The track's course solved once for every obstacle (track_from is
    // track_nm with it given), and one surely more than SWATH_NM off its
    // line (core's surely_off_nm), which fails the cross-track test below
    // on the ellipsoid too, let go after one inverse solve.
    let course = crate::geo::bearing_deg(start.0, start.1, end.0, end.1);
    let mut found = Vec::new();
    for o in obstacles {
        if crate::geo::surely_off_nm(o.lat, o.lon, start, course, SWATH_NM) {
            continue;
        }
        let (cross, along) = crate::geo::track_from(o.lat, o.lon, start, course);
        if cross.abs() > SWATH_NM || along < 0.0 || along > reach {
            continue;
        }
        let seconds = along / gs_kt * 3600.0;
        let alt_then = interp(seconds, &track.times, alts);
        let Some(level) = clearance_level(seconds, alt_then - o.amsl_ft) else { continue };
        let kind = o.kind.trim();
        found.push(Alert {
            id: format!("obstacle:{:.4},{:.4}", o.lat, o.lon),
            kind: "obstacle",
            level,
            name: if kind.is_empty() { "obstacle".into() } else { kind.to_string() },
            need: if level == "warning" { TERRAIN_WARNING } else { TERRAIN_CAUTION }.into(),
            seconds: round_to(seconds, 1),
            distance_nm: round_to(along, 1),
            lat: round_to(o.lat, 5),
            lon: round_to(o.lon, 5),
            top_ft: Some(o.amsl_ft),
            clearance_ft: Some(round_to(alt_then - o.amsl_ft, -1)),
            ..Default::default()
        });
    }
    found.stable_sort_by(|a, b| a.seconds.partial_cmp(&b.seconds).unwrap());
    found.truncate(3);
    found
}

/// numpy's interp: `x` on the line through (xs, ys), held at the ends.
pub(super) fn interp(x: f64, xs: &[f64], ys: &[f64]) -> f64 {
    if x <= xs[0] {
        return ys[0];
    }
    for w in 0..xs.len() - 1 {
        if x <= xs[w + 1] {
            let f = (x - xs[w]) / (xs[w + 1] - xs[w]);
            return ys[w] + f * (ys[w + 1] - ys[w]);
        }
    }
    *ys.last().unwrap()
}

/// Whether the airplane, `distance_nm` from the nearest landing field
/// (`elevation_ft` its elevation, None where not on file), is taking off
/// or landing there: 91.119's minimums hold "except when necessary for
/// takeoff or landing", so within NEAR_FIELD_NM and no more than
/// NEAR_FIELD_AGL_FT over it the ground is not alerted.
pub(super) fn near_field_given(distance_nm: f64, elevation_ft: Option<f64>, alt: f64) -> bool {
    distance_nm <= NEAR_FIELD_NM && elevation_ft.is_none_or(|e| alt <= e + NEAR_FIELD_AGL_FT)
}

/// The landing fields of a pack's airports table as (lat, lon, elevation
/// ft): NASR's airports, seaplane bases, gliderports and ultralight fields
/// (SITE_TYPE_CODE A, C, G, U; a heliport or a balloonport is no field),
/// the elevation None where not on file. Read once a pack and kept
/// (pack_kept), as the phones ask near_field every 10 s in the air.
fn landing_fields(p: &Pack) -> Vec<(f64, f64, Option<f64>)> {
    let Some(t) = p.section("airports").and_then(|b| std::str::from_utf8(b).ok()).and_then(json::table) else {
        return Vec::new();
    };
    let (Some(la), Some(lo), Some(el), Some(kind)) = (t.col("LAT_DECIMAL"), t.col("LONG_DECIMAL"), t.col("ELEV"), t.col("SITE_TYPE_CODE"))
    else {
        return Vec::new();
    };
    t.rows
        .iter()
        .filter(|row| matches!(row[kind].as_str(), "A" | "C" | "G" | "U"))
        .filter_map(|row| Some((row[la].parse::<f64>().ok()?, row[lo].parse::<f64>().ok()?, row[el].parse::<f64>().ok())))
        .collect()
}

/// Whether the airplane is taking off or landing at a field: within 3 nm
/// of one and no more than 1,000 ft over it (wingtip.alerts' `_near_field`),
/// from the packs' landing fields. The nearest is the first at the least
/// geodesic distance, as a scan of every field gives; geo::nearest solves
/// the ellipsoid only for those the sphere cannot rule out.
pub(super) fn near_field(packs: &[Pack], lat: f64, lon: f64, alt: f64) -> bool {
    let held: Vec<_> = packs.iter().map(|p| crate::pack_kept::kept(p, "landing_fields", landing_fields)).collect();
    let all = || held.iter().flat_map(|h| h.iter());
    let Some((i, d)) = crate::geo::nearest(lat, lon, all().map(|f| (f.0, f.1)), |y, x| crate::geo::distance_nm(lat, lon, y, x)) else {
        return false;
    };
    let elev = all().nth(i).and_then(|f| f.2);
    d.is_finite() && near_field_given(d, elev, alt)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The kept, sphere-filtered nearest field is the one a scan of every
    /// row's geodesic finds, over the Chicago phone packs.
    #[test]
    fn the_nearest_field_is_the_scans() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../services/planner/tests_wingtip/fixtures/native/phone");
        let bytes: Vec<Vec<u8>> = ["n40w088.pack", "n40w092.pack"].iter().map(|f| std::fs::read(dir.join(f)).unwrap()).collect();
        let packs: Vec<Pack> = bytes.iter().map(|b| Pack::read(b).unwrap()).collect();
        let fields: Vec<_> = packs.iter().flat_map(landing_fields).collect();
        assert!(fields.len() > 100, "{}", fields.len());
        let started = std::time::Instant::now();
        for k in 0..400 {
            let (lat, lon) = (40.0 + (k / 20) as f64 * 0.2, -92.0 + (k % 20) as f64 * 0.4);
            let scan = fields.iter().fold(None::<(f64, Option<f64>)>, |b, f| {
                let d = crate::geo::distance_nm(lat, lon, f.0, f.1);
                if b.is_none_or(|b| d < b.0) {
                    Some((d, f.2))
                } else {
                    b
                }
            });
            for alt in [0.0, 900.0, 3000.0] {
                let want = scan.is_some_and(|(d, e)| near_field_given(d, e, alt));
                assert_eq!(near_field(&packs, lat, lon, alt), want, "{lat} {lon} {alt}");
            }
        }
        // A field's own point: near it, on the ground.
        assert!(near_field(&packs, fields[0].0, fields[0].1, fields[0].2.unwrap_or(0.0)));
        eprintln!("near_field, 1,200 asks of {} fields: {:?}", fields.len(), started.elapsed());
    }
}
