use super::*;

/// A step of the approach flown: what to do, why, where the airplane is,
/// what it shows and the altitude its fix is crossed at (for the profile;
/// None where none is coded, the minimums).
#[derive(Clone, Debug, PartialEq)]
pub struct CoachStep {
    pub key: String,
    pub title: String,
    pub say: String,
    pub why: Option<String>,
    pub at: Option<(f64, f64)>,
    pub focus: Focus,
    pub altitude_ft: Option<f64>,
}

/// The altitude a fix is crossed at, as the profile draws it.
pub(super) fn crossing_ft(fix: &Fix) -> Option<f64> {
    fix.min_ft.or(fix.max_ft)
}

/// The last fix the missed approach's legs name: where it ends, the hold.
pub(super) fn missed_hold_fix(d: &Drawing) -> Option<&str> {
    d.missed_legs.iter().rev().find_map(leg_fix)
}

/// The approach flown fix by fix with a word at each, at a ground speed of
/// `gs_kt`: what to do crossing each fix, the descent on the published path
/// at that speed from the FAF and the time to the missed approach point, at
/// the minimums the decision -- land, or the missed approach in its own
/// words (14 CFR 91.175(c) and (e)) -- and then the missed approach flown.
pub fn coaching_steps(d: &Drawing, gs_kt: f64) -> Vec<CoachStep> {
    let parts = Parts::of(d);
    let mut steps: Vec<CoachStep> = Vec::new();
    let course = d.final_course_deg.map(bearing);
    let angle = d.glidepath_deg;
    let minimums = match parts.minimums {
        MinimumsKind::Da => "the DA",
        MinimumsKind::Mda => "the MDA",
        MinimumsKind::DaOrMda => "the DA or MDA",
    };
    let gs = js_num(gs_kt);
    let fixes: Vec<&Fix> = parts.fixes.iter().copied().filter(|f| !f.has("MAP")).collect();
    let faf_at = fixes.iter().position(|f| f.has("FAF"));
    for (i, fix) in fixes.iter().enumerate() {
        let words = altitude_words(fix);
        let name = fix_name(&fix.ident);
        let crossing = format!("Cross {name}{}", words.as_ref().map_or_else(String::new, |w| format!(" {w}")));
        // The next lower altitude the final steps down to, else the minimums.
        let next_down = fixes[i + 1..].iter().find(|f| crossing_ft(f).is_some());
        let descend_to = match next_down {
            Some(next) => format!("{} at {}", alt_ft(crossing_ft(next)), fix_name(&next.ident)),
            None => format!("{minimums} ({SEE_THE_PLATE_LOWER})"),
        };
        let (say, why): (String, Option<String>) = if fix.has("FAF") {
            let say = match angle {
                Some(angle) => format!(
                    "Descend on the {}° path, about {} ft/min at {gs} kt, and start the timer",
                    to_fixed(angle, 2),
                    grouped(rounded_fpm(descent_fpm(gs_kt, angle)))
                ),
                None => format!("Descend to {descend_to} and start the timer"),
            };
            let to_map = parts.nm_to_map(fix).filter(|nm| *nm > 0.0).map_or_else(String::new, |nm| {
                format!(" {} nm to the missed approach point: {} at {gs} kt.", to_fixed(nm, 1), stopwatch((nm / gs_kt) * 3600.0))
            });
            (say, Some(format!("The final approach starts here.{to_map}")))
        } else if faf_at.is_some_and(|f| i > f) {
            (format!("{crossing}, then descend to {descend_to}"), Some("Not below this fix's altitude until it is passed.".to_owned()))
        } else if fix.has("IAF") {
            let say = if parts.turn_at(&fix.ident) { format!("{crossing} and fly the procedure turn the plate shows") } else { crossing };
            (say, Some("The approach begins here: hold each segment's altitude until its next fix.".to_owned()))
        } else if fix.has("IF") || fix.has("FACF") {
            let say = match &course {
                Some(c) => format!("{crossing} and turn onto the final approach course, {c}"),
                None => crossing,
            };
            // The intermediate segment positions the airplane for the final, its
            // speed and configuration set for it (FAA-H-8083-16B, chapter 4).
            (say, Some("The intermediate segment lines you up and slows you to your approach speed before the final.".to_owned()))
        } else {
            (if words.is_some() { crossing } else { format!("Fly to {name}") }, None)
        };
        steps.push(CoachStep {
            key: format!("fix:{}", fix.ident),
            title: format!("Crossing {}", labelled(fix, false)),
            say: format!("{say}."),
            why,
            at: Some((fix.lat, fix.lon)),
            focus: focus(Some(&fix.ident), None),
            altitude_ft: crossing_ft(fix),
        });
    }
    let go_missed = parts.missed.clone().unwrap_or_else(|| "fly the missed approach the plate shows.".to_owned());
    if let Some(map) = parts.map {
        steps.push(CoachStep {
            key: "decision".to_owned(),
            title: match parts.minimums {
                MinimumsKind::Da => "At the Decision Altitude",
                MinimumsKind::Mda => "At the Missed Approach Point",
                MinimumsKind::DaOrMda => "At the DA or Missed Approach Point",
            }
            .to_owned(),
            say: format!("Runway in sight? Land. Otherwise go missed: {}", lower_first(&go_missed)),
            // 14 CFR 91.175(c): below the DA or MDA only in a position to land
            // normally with the visibility and a runway reference in sight; (e):
            // the missed approach at once without them.
            why: Some(
                "Below the minimums only with the runway environment in sight and in position to land; without it, the missed approach at once (14 CFR 91.175(c), (e))."
                    .to_owned(),
            ),
            at: Some((map.lat, map.lon)),
            focus: focus(Some(&map.ident), Some("final")),
            altitude_ft: None,
        });
    }
    let end = d.lines.iter().rev().find(|l| l.role == "missed").and_then(|l| l.points.last().copied());
    if let (Some(missed), Some(end)) = (&parts.missed, end) {
        steps.push(CoachStep {
            key: "missed".to_owned(),
            title: "Going Missed".to_owned(),
            say: missed.clone(),
            // The standard missed approach climb gradient (FAA Order 8260.3),
            // as the dry run climbs it (motion::dry_run MISSED_CLIMB_FT_PER_NM).
            why: Some(
                "Climb at once: a missed approach is built for a climb of 200 ft a mile unless the plate asks for more (FAA Order 8260.3)."
                    .to_owned(),
            ),
            at: Some(end),
            focus: focus(missed_hold_fix(d), Some("missed")),
            altitude_ft: None,
        });
    }
    steps
}

/// A point of the approach's side view: a fix's distance along the line
/// from the first and the altitude it is crossed at.
#[derive(Clone, Debug, PartialEq)]
pub struct ProfileMark {
    pub ident: String,
    pub along_nm: f64,
    pub ft: Option<f64>,
    pub faf: bool,
    pub map: bool,
}

/// The path down from the FAF: (nm, ft) at each end.
pub type ProfilePath = ((f64, f64), (f64, f64));

/// The approach from the side, a sketch from the coded data: each of its
/// fixes at its distance along the line and the altitude it is crossed at,
/// and where a path angle is coded, the path down from the FAF's altitude at
/// that angle to the missed approach point, as the plate's profile view
/// draws it.
pub fn lesson_profile(d: &Drawing) -> (Vec<ProfileMark>, Option<ProfilePath>) {
    let parts = Parts::of(d);
    let marks: Vec<ProfileMark> = parts
        .fixes
        .iter()
        .map(|f| ProfileMark {
            ident: f.ident.clone(),
            along_nm: along_nm(&parts.path, (f.lat, f.lon)),
            ft: if f.has("MAP") { None } else { crossing_ft(f) },
            faf: f.has("FAF"),
            map: f.has("MAP"),
        })
        .collect();
    let faf = marks.iter().find(|m| m.faf);
    let map = marks.iter().find(|m| m.map);
    let path = match (faf, map, d.glidepath_deg) {
        (Some(faf), Some(map), Some(angle)) if faf.ft.is_some() && map.along_nm > faf.along_nm => {
            let from_ft = faf.ft.unwrap_or_default();
            Some(((faf.along_nm, from_ft), (map.along_nm, from_ft - (map.along_nm - faf.along_nm) * FT_PER_NM * rad(angle).tan())))
        }
        _ => None,
    };
    (marks, path)
}
