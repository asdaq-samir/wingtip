use super::*;

/// A TFR, as the phone kept it or the planner read it: its NOTAM, its
/// title, the rule it is issued under, its floor and ceiling in feet with
/// each one's reference, when it starts and ends (Unix seconds), its
/// polygons' rings of (lon, lat), and the ground under it for AGL heights.
pub(super) struct Tfr {
    pub(super) notam: String,
    pub(super) title: String,
    pub(super) rule: String,
    pub(super) floor: Option<f64>,
    pub(super) floor_agl: bool,
    pub(super) ceiling: Option<f64>,
    pub(super) ceiling_agl: bool,
    pub(super) from: Option<i64>,
    pub(super) to: Option<i64>,
    pub(super) shape: Polygons,
    pub(super) under: Option<f64>,
}

/// Polygons as rings of (lon, lat): each polygon its outline and holes.
pub(super) type Polygons = Vec<Vec<Vec<(f64, f64)>>>;

/// Whether polygons hold a point: inside an odd number of one polygon's
/// rings (its outline and not a hole), by the even-odd rule.
pub(super) fn polygons_hold(shape: &Polygons, x: f64, y: f64) -> bool {
    shape.iter().any(|rings| rings.iter().filter(|r| r.len() >= 3 && geo::ring_holds(r, x, y)).count() % 2 == 1)
}

/// The phone's kept TFRs, one a tab-separated line: its NOTAM, title,
/// rule, floor and its reference, ceiling and its reference, start and
/// end (Unix seconds, empty where not given), and its outer ring as "lon
/// lat" pairs joined by ",".
pub(super) fn tfrs_of(text: &str) -> Vec<Tfr> {
    text.lines()
        .filter_map(|line| {
            let f: Vec<&str> = line.split('\t').collect();
            if f.len() != 10 {
                return None;
            }
            let num = |s: &str| s.trim().parse::<f64>().ok().filter(|v| v.is_finite());
            let ring: Vec<(f64, f64)> = f[9]
                .split(',')
                .filter_map(|p| {
                    let mut it = p.split_whitespace();
                    Some((num(it.next()?)?, num(it.next()?)?))
                })
                .collect();
            (ring.len() >= 3).then(|| Tfr {
                notam: f[0].to_string(),
                title: f[1].to_string(),
                rule: f[2].to_string(),
                floor: num(f[3]),
                floor_agl: f[4] == "AGL",
                ceiling: num(f[5]),
                ceiling_agl: f[6] == "AGL",
                from: f[7].trim().parse().ok(),
                to: f[8].trim().parse().ok(),
                shape: vec![vec![ring]],
                under: None,
            })
        })
        .collect()
}

/// The TFRs in force over the look-ahead that the track goes into, or is
/// in: entry only as the NOTAM allows (14 CFR 91.137 to 91.145, 99.7). In
/// force is from its effective to its expiry time, as its NOTAM gives
/// them (AIM 3-5-3); one with neither is taken as in force.
pub(super) fn tfr_alerts(track: &Track, ground: Option<f64>, now: i64, list: &[Tfr]) -> Vec<Alert> {
    let until = now + *track.times.last().unwrap() as i64;
    let mut found = Vec::new();
    for t in list {
        if t.to.is_some_and(|e| e < now) || t.from.is_some_and(|s| s > until) {
            continue;
        }
        let under = t.under.or(ground);
        let floor = height_msl(t.floor, t.floor_agl, under, 0.0);
        let ceiling = height_msl(t.ceiling, t.ceiling_agl, under, f64::INFINITY);
        let holds = |x: f64, y: f64| polygons_hold(&t.shape, x, y);
        let (inside, index) = track.entry(&holds, floor, ceiling);
        let Some(index) = index else { continue };
        found.push(Alert {
            id: format!("tfr:{}", t.notam),
            kind: "tfr",
            level: "warning",
            name: if t.title.is_empty() { format!("TFR {}", t.notam) } else { t.title.clone() },
            need: if t.rule.is_empty() {
                format!("In force: no flight in it but as NOTAM {} allows.", t.notam)
            } else {
                format!("In force: no flight in it but as NOTAM {} allows ({}).", t.notam, t.rule)
            },
            inside: inside && index == 0,
            floor_ft: t.floor.map(|_| floor),
            ceiling_ft: Some(ceiling).filter(|c| c.is_finite()),
            notam_id: Some(t.notam.clone()),
            ..at(track, index)
        });
    }
    found
}

pub(super) fn tfrs(packs: &[Pack], track: &Track, ground: Option<f64>, now: i64, text: &str) -> Vec<Alert> {
    let mut list = tfrs_of(text);
    for t in &mut list {
        // The ground at the TFR's first point, for its AGL heights.
        if t.floor_agl || t.ceiling_agl {
            let (x, y) = t.shape[0][0][0];
            t.under = ground_ft(packs, y, x);
        }
    }
    tfr_alerts(track, ground, now, &list)
}
