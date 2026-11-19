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
    let mut found = Vec::new();
    for o in obstacles {
        let (cross, along) = crate::geo::track_nm(o.lat, o.lon, start, end);
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

/// Whether the airplane is taking off or landing at a field: within 3 nm
/// of one and no more than 1,000 ft over it (wingtip.alerts' `_near_field`),
/// from the packs' airports (NASR's airports, seaplane bases, gliderports
/// and ultralight fields; a heliport or a balloonport is no field).
pub(super) fn near_field(packs: &[Pack], lat: f64, lon: f64, alt: f64) -> bool {
    let mut best: Option<(f64, Option<f64>)> = None;
    for p in packs {
        let Some(t) = p.section("airports").and_then(|b| std::str::from_utf8(b).ok()).and_then(json::table) else { continue };
        let (Some(la), Some(lo), Some(el), Some(kind)) =
            (t.col("LAT_DECIMAL"), t.col("LONG_DECIMAL"), t.col("ELEV"), t.col("SITE_TYPE_CODE"))
        else {
            continue;
        };
        for row in &t.rows {
            if !matches!(row[kind].as_str(), "A" | "C" | "G" | "U") {
                continue;
            }
            let (Ok(y), Ok(x)) = (row[la].parse::<f64>(), row[lo].parse::<f64>()) else { continue };
            let d = crate::geo::distance_nm(lat, lon, y, x);
            if best.is_none_or(|b| d < b.0) {
                best = Some((d, row[el].parse::<f64>().ok()));
            }
        }
    }
    best.is_some_and(|(d, elev)| near_field_given(d, elev, alt))
}
