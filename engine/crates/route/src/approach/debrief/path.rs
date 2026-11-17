use super::*;

#[derive(Clone, Copy, Debug)]
pub(super) struct Xy {
    pub(super) x: f64,
    pub(super) y: f64,
}

#[derive(Clone, Debug)]
pub(super) struct PathFix {
    pub(super) ident: String,
    pub(super) roles: Vec<String>,
    pub(super) min_ft: Option<f64>,
    pub(super) max_ft: Option<f64>,
    pub(super) v: usize,
}

/// The way in, as one line: the transition then the final, each vertex's
/// distance along it, the fixes at their vertices, where the final starts
/// and which of the fixes are its final approach fix and missed approach
/// point.
pub(super) struct Path {
    pub(super) ll: Vec<(f64, f64)>,
    pub(super) xy: Vec<Xy>,
    pub(super) cum: Vec<f64>,
    pub(super) fixes: Vec<PathFix>,
    pub(super) final_from: usize,
    pub(super) faf: usize,
    pub(super) map: usize,
}

/// A point in the flat frame about the missed approach point (core's).
pub(super) fn at(frame: &Flat, lat: f64, lon: f64) -> Xy {
    let (x, y) = frame.nm(lat, lon);
    Xy { x, y }
}

pub(super) fn path_of(d: &Drawing, frame: &Flat) -> Option<Path> {
    let mut ll: Vec<(f64, f64)> = Vec::new();
    let mut final_from: Option<usize> = None;
    for line in &d.lines {
        if line.role != "transition" && line.role != "final" {
            continue;
        }
        if line.role == "final" && final_from.is_none() {
            final_from = Some(ll.len().saturating_sub(1));
        }
        for &(lat, lon) in &line.points {
            if let Some(&(a, b)) = ll.last()
                && (a - lat).abs() < 1e-5
                && (b - lon).abs() < 1e-5
            {
                continue;
            }
            ll.push((lat, lon));
        }
    }
    let final_from = final_from?;
    if ll.len() < 2 {
        return None;
    }
    let xy: Vec<Xy> = ll.iter().map(|&(lat, lon)| at(frame, lat, lon)).collect();
    let mut cum = vec![0.0];
    for i in 1..xy.len() {
        cum.push(cum[i - 1] + (xy[i].x - xy[i - 1].x).hypot(xy[i].y - xy[i - 1].y));
    }
    // Each fix at its vertex, in the order the way in reaches them.
    let mut fixes: Vec<PathFix> = Vec::new();
    let mut from = 0;
    for f in d.fixes.iter().filter(|f| !f.missed) {
        let p = at(frame, f.lat, f.lon);
        let Some(v) = (from..xy.len()).find(|&i| (xy[i].x - p.x).hypot(xy[i].y - p.y) < 0.1) else { continue };
        fixes.push(PathFix { ident: f.ident.clone(), roles: f.roles.clone(), min_ft: f.min_ft, max_ft: f.max_ft, v });
        from = v;
    }
    let faf = fixes.iter().position(|f| f.roles.iter().any(|r| r == "FAF"))?;
    let map = fixes.iter().position(|f| f.roles.iter().any(|r| r == "MAP"))?;
    if fixes[map].v <= fixes[faf].v {
        return None;
    }
    Some(Path { ll, xy, cum, fixes, final_from, faf, map })
}

/// The course through vertex v, as a unit vector: the way out of it, or
/// into it at the line's end.
pub(super) fn course_at(path: &Path, v: usize) -> Xy {
    let (a, b) = if v < path.xy.len() - 1 { (path.xy[v], path.xy[v + 1]) } else { (path.xy[v - 1], path.xy[v]) };
    let len = (b.x - a.x).hypot(b.y - a.y);
    let len = if len == 0.0 { 1.0 } else { len };
    Xy { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
}

/// A pass of the track by a fix: its point index, the share of the way to
/// the next point, and how far right of the fix (nm).
#[derive(Clone, Copy, Debug)]
pub(super) struct Cross {
    pub(super) i: usize,
    pub(super) u: f64,
    pub(super) right: f64,
}

/// Each time the track crossed the line square to the course at vertex v,
/// going the course's way, within PASS_NM of it.
pub(super) fn crossings(path: &Path, v: usize, xy: &[Xy], from: usize, to: usize) -> Vec<Cross> {
    let (f, d) = (path.xy[v], course_at(path, v));
    let mut out = Vec::new();
    for i in from..to.min(xy.len() - 1) {
        let (a, b) = (xy[i], xy[i + 1]);
        let sa = (a.x - f.x) * d.x + (a.y - f.y) * d.y;
        let sb = (b.x - f.x) * d.x + (b.y - f.y) * d.y;
        if !(sa < 0.0 && sb >= 0.0) {
            continue;
        }
        let u = -sa / (sb - sa);
        let (cx, cy) = (a.x + u * (b.x - a.x) - f.x, a.y + u * (b.y - a.y) - f.y);
        let right = d.y * cx - d.x * cy;
        if right.abs() <= PASS_NM {
            out.push(Cross { i, u, right });
        }
    }
    out
}

/// The track's passes by the fix at vertex v: each crossing (above); else,
/// where it turned at the fix rather than going through its line, each
/// nearest it came within PASS_NM. The first or the last of them.
pub(super) fn pass_of(path: &Path, v: usize, xy: &[Xy], from: usize, to: usize, first: bool) -> Option<Cross> {
    let through = crossings(path, v, xy, from, to);
    if !through.is_empty() {
        return if first { through.first().copied() } else { through.last().copied() };
    }
    let f = path.xy[v];
    let away = |i: usize| (xy[i].x - f.x).hypot(xy[i].y - f.y);
    let mut near: Vec<Cross> = Vec::new();
    let last = to.min(xy.len() - 1);
    for i in from..=last {
        let d = away(i);
        if d <= PASS_NM && (i == from || d <= away(i - 1)) && (i == last || d < away(i + 1)) {
            near.push(Cross { i, u: 0.0, right: d });
        }
    }
    if first {
        near.first().copied()
    } else {
        near.last().copied()
    }
}

/// Where a point is against the way in between two vertices: how far
/// along it (nm from its start), how far right of it (left negative) and
/// how far from it at all.
#[derive(Clone, Copy, Debug)]
pub(super) struct Against {
    pub(super) along: f64,
    pub(super) right: f64,
    pub(super) away: f64,
}

pub(super) fn against(path: &Path, p: Xy, va: usize, vb: usize) -> Against {
    let mut best = Against { along: path.cum[va], right: 0.0, away: f64::INFINITY };
    let mut k = va;
    while k < vb.max(va + 1) && k < path.xy.len() - 1 {
        let (a, b) = (path.xy[k], path.xy[k + 1]);
        let (bx, by) = (b.x - a.x, b.y - a.y);
        let len2 = bx * bx + by * by;
        let (px, py) = (p.x - a.x, p.y - a.y);
        let t = if len2 > 0.0 { ((px * bx + py * by) / len2).clamp(0.0, 1.0) } else { 0.0 };
        let right = if len2 > 0.0 { (by * px - bx * py) / len2.sqrt() } else { px.hypot(py) };
        let away = (px - t * bx).hypot(py - t * by);
        if away < best.away {
            best = Against { along: path.cum[k] + t * len2.sqrt(), right, away };
        }
        k += 1;
    }
    best
}

/// The track's altitude between point i and the next, a share u of the
/// way; the nearer known one where either is missing.
pub(super) fn alt_at(points: &[Point], i: usize, u: f64) -> Option<f64> {
    let a = points[i].alt_ft;
    let b = points.get(i + 1).and_then(|p| p.alt_ft);
    match (a, b) {
        (Some(a), Some(b)) => Some(a + u * (b - a)),
        _ if u < 0.5 => a.or(b),
        _ => b.or(a),
    }
}

pub(super) fn time_at(points: &[Point], i: usize, u: f64) -> f64 {
    let t = points[i].t;
    t + u * (points.get(i + 1).map_or(t, |p| p.t) - t)
}

pub(super) fn nm_to(p: &Point, lat: f64, lon: f64) -> f64 {
    distance_nm(p.lat, p.lon, lat, lon)
}

/// The glidepath's height at a distance from its runway's threshold, nm,
/// ft MSL: a straight line up from the runway's crossing altitude at its
/// angle, over the curved earth. It rises above the curved sea level by
/// d²/2R, 32 ft at 6 nm, which the chart's glide slope altitude at the
/// final approach fix includes (KBUR's ILS 08: 2,753 ft at BUDDE, 6.0 nm
/// out on 3.00° from 787 ft); R is TERPS's earth (tags.rs, FAA Order
/// 8260.3G Appendix D), the one the chart's altitudes are built on.
pub fn glidepath_ft(gp: &RunwayPath, nm_out: f64) -> f64 {
    let d = nm_out * FT_PER_NM;
    gp.ft + d * rad(gp.deg).tan() + (d * d) / (2.0 * TERPS_EARTH_FT)
}

/// A glide slope's full scale either side, ft, at a distance from its
/// threshold (GLIDESLOPE_DEG from its antenna).
pub(super) fn glideslope_half_ft(nm_out: f64) -> f64 {
    (nm_out * FT_PER_NM + GLIDESLOPE_ANTENNA_FT) * rad(GLIDESLOPE_DEG).tan()
}

pub(super) fn map_fix(d: &Drawing) -> Option<&super::super::Fix> {
    d.fixes.iter().find(|f| f.has("MAP") && !f.missed)
}

/// Each time the track flew inbound over the approach's final approach
/// fix: the attempts at it, as point indices -- from the last one's end,
/// to the next one's start.
pub fn attempts_at(d: &Drawing, points: &[Point]) -> Vec<Attempt> {
    if points.len() < 2 {
        return Vec::new();
    }
    let Some(map) = map_fix(d) else { return Vec::new() };
    let frame = Flat::about(map.lat, map.lon);
    let Some(path) = path_of(d, &frame) else { return Vec::new() };
    let xy: Vec<Xy> = points.iter().map(|p| at(&frame, p.lat, p.lon)).collect();
    let passes = crossings(&path, path.fixes[path.faf].v, &xy, 0, xy.len());
    (0..passes.len())
        .map(|k| Attempt {
            faf: passes[k].i,
            from: if k == 0 { 0 } else { passes[k - 1].i + 1 },
            to: if k + 1 < passes.len() { passes[k + 1].i } else { points.len() - 1 },
        })
        .collect()
}
