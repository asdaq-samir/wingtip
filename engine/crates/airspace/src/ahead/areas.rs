use super::*;

/// A Class B, C or D volume, wherever it was read from: the phone's pack
/// or the planner's FAA shapefile (the `alerts_ahead` call's input).
pub(super) struct Volume<'a> {
    pub(super) class: char,
    pub(super) name: String,
    pub(super) floor: f64,
    pub(super) ceiling: Option<f64>,
    pub(super) holds: Box<dyn Fn(f64, f64) -> bool + 'a>,
}

/// The Class B, C and D the track goes into, one per named volume at its
/// first shelf entered. Not once inside: a pilot in a Class D has talked
/// to its tower, and one under a Class B shelf is below it.
pub(super) fn class_alerts(track: &Track, volumes: Vec<Volume>) -> Vec<Alert> {
    let mut found: Vec<((String, char), Alert)> = Vec::new();
    let mut inside_of: Vec<(String, char)> = Vec::new();
    for v in volumes {
        let Some((level, need)) = class_need(v.class) else { continue };
        // No ceiling given: up to Class A (71.33), as wingtip.airspace_at reads it.
        let (inside, index) = track.entry(&*v.holds, v.floor, v.ceiling.unwrap_or(CLASS_A_FT));
        let key = (v.name.clone(), v.class);
        if inside {
            inside_of.push(key);
            continue;
        }
        let Some(index) = index else { continue };
        if found.iter().any(|(k, a)| *k == key && a.seconds <= track.times[index]) {
            continue;
        }
        found.retain(|(k, _)| *k != key);
        found.push((
            key,
            Alert {
                id: format!("airspace:{}:{}", v.class, v.name),
                kind: "airspace",
                level,
                name: v.name.clone(),
                need: need.to_string(),
                class: Some(v.class.to_string()),
                floor_ft: Some(v.floor),
                ceiling_ft: v.ceiling,
                ..at(track, index)
            },
        ));
    }
    found.into_iter().filter(|(k, _)| !inside_of.contains(k)).map(|(_, a)| a).collect()
}

pub(super) fn classes(packs: &[Pack], track: &Track) -> Vec<Alert> {
    let boxes = track.boxes(1.0);
    let mut volumes = Vec::new();
    for p in packs {
        let (Some(layer), Some(vols), Some(names)) = (p.layer("airspace"), p.section("airspace.vol"), p.section("airspace.names")) else {
            continue;
        };
        for i in 0..layer.count {
            let Some(r) = vols.get(32 * i..32 * i + 32) else { continue };
            let class = r[0] as char;
            if class_need(class).is_none() || !meets(layer.bbox(i), &boxes) {
                continue;
            }
            let (Some(wkb), Some(floor), Some(ceiling), Some(name)) = (layer.wkb(i), f64_at(r, 8), f64_at(r, 16), text(names, r, 24))
            else {
                continue;
            };
            volumes.push(Volume {
                class,
                name: name.to_string(),
                floor: if r[1] == 0 { 0.0 } else { floor },
                ceiling: (!ceiling.is_nan()).then_some(ceiling),
                holds: Box::new(move |x: f64, y: f64| crate::airspace::wkb_holds(wkb, x, y).unwrap_or(false)),
            });
        }
    }
    class_alerts(track, volumes)
}

/// A floor or ceiling in feet MSL, as wingtip.alerts' `_height_msl`.
pub(super) fn height_msl(value: Option<f64>, agl: bool, ground: Option<f64>, missing: f64) -> f64 {
    match value {
        None => missing,
        Some(v) if agl => match ground {
            Some(g) => v + g,
            None if missing <= 0.0 => v,
            None => missing,
        },
        Some(v) => v,
    }
}

/// A special-use area, from the pack or the planner's FAA SUA data, with
/// the ground under it (`under`) for its AGL heights: the airplane's own
/// where the area's could not be read.
pub(super) struct Area<'a> {
    pub(super) kind: String,
    pub(super) name: String,
    pub(super) heights: sua_limit::Heights,
    pub(super) under: Option<f64>,
    pub(super) times_of_use: Option<String>,
    pub(super) holds: Box<dyn Fn(f64, f64) -> bool + 'a>,
}

/// The special-use areas the track goes into, or is in: one per name.
pub(super) fn special_use_alerts(track: &Track, areas: Vec<Area>) -> Vec<Alert> {
    let mut found: Vec<Alert> = Vec::new();
    for a in areas {
        let Some((level, need)) = special_use_need(&a.kind) else { continue };
        let h = a.heights;
        let floor = height_msl(h.floor, h.floor_agl, a.under, 0.0);
        let ceiling = height_msl(h.ceiling, h.ceiling_agl, a.under, f64::INFINITY);
        let (inside, index) = track.entry(&*a.holds, floor, ceiling);
        let Some(index) = index else { continue };
        if found.iter().any(|f| f.name == a.name && f.seconds <= track.times[index]) {
            continue;
        }
        found.retain(|f| f.name != a.name);
        found.push(Alert {
            id: format!("special_use:{}", a.name),
            kind: "special_use",
            level,
            name: a.name.clone(),
            need: need.to_string(),
            inside: inside && index == 0,
            class: Some(a.kind.clone()),
            floor_ft: if h.floor_agl { Some(floor) } else { h.floor },
            ceiling_ft: if h.ceiling_agl { Some(ceiling).filter(|c| c.is_finite()) } else { h.ceiling },
            times_of_use: a.times_of_use.clone().filter(|t| !t.is_empty()),
            ..at(track, index)
        });
    }
    found
}

/// A special-use area's kind as the pack keeps it, its first four bytes up
/// to the first zero ("R", "MOA" ...); empty where not UTF-8, which no
/// kind is.
fn kind_of(a: &[u8]) -> &str {
    std::str::from_utf8(a[..4].split(|&c| c == 0).next().unwrap_or(&[])).unwrap_or("")
}

/// Each of a pack's special-use areas' heights, by its place in the
/// layer, None for a kind no alert is given for or a row not read: the
/// FAA's codes and DESC as the pack keeps them (wingtip.sua `_area`), its
/// JSON parsed once a pack and kept (pack_kept), not once an area a fix.
fn sua_heights(p: &Pack) -> Vec<Option<sua_limit::Heights>> {
    let (Some(layer), Some(alt), Some(rec)) = (p.layer("sua"), p.section("sua.alt"), p.section("sua.rec")) else {
        return Vec::new();
    };
    let codes = p.section("sua.json");
    (0..layer.count)
        .map(|i| {
            let (a, r) = (alt.get(32 * i..32 * i + 32)?, rec.get(24 * i..24 * i + 24)?);
            special_use_need(kind_of(a))?;
            let codes = codes.and_then(|d| text(d, r, 8)).and_then(|t| json::parse(t).ok());
            Some(sua_limit::heights(codes.as_ref(), f64_at(a, 8), f64_at(a, 16), [a[4], a[5]]))
        })
        .collect()
}

pub(super) fn special_use(packs: &[Pack], track: &Track, ground: Option<f64>) -> Vec<Alert> {
    let boxes = track.boxes(1.0);
    let mut areas = Vec::new();
    for p in packs {
        let (Some(layer), Some(alt), Some(names), Some(rec), Some(times)) =
            (p.layer("sua"), p.section("sua.alt"), p.section("sua.names"), p.section("sua.rec"), p.section("sua.times"))
        else {
            continue;
        };
        let held = crate::pack_kept::kept(p, "sua_heights", sua_heights);
        for i in 0..layer.count {
            let (Some(a), Some(r), Some(Some(heights))) =
                (alt.get(32 * i..32 * i + 32), rec.get(24 * i..24 * i + 24), held.get(i).copied())
            else {
                continue;
            };
            let bbox = layer.bbox(i);
            if !meets(bbox, &boxes) {
                continue;
            }
            let (Some(wkb), Some(name)) = (layer.wkb(i), text(names, r, 16)) else { continue };
            // The ground under the area for its AGL heights: the middle of
            // its box, the airplane's own where that cannot be read.
            let under = if heights.floor_agl || heights.ceiling_agl {
                ground_ft(packs, (bbox[1] + bbox[3]) / 2.0, (bbox[0] + bbox[2]) / 2.0).or(ground)
            } else {
                ground
            };
            areas.push(Area {
                kind: kind_of(a).to_owned(),
                name: name.to_string(),
                heights,
                under,
                times_of_use: text(times, a, 24).map(str::to_string),
                holds: Box::new(move |x: f64, y: f64| crate::airspace::wkb_holds(wkb, x, y).unwrap_or(false)),
            });
        }
    }
    special_use_alerts(track, areas)
}
