use super::*;

/// What a step of the lesson shows on the map: a fix ringed, a part of
/// the procedure's line ("transition", "final", "missed") drawn over.
#[derive(Clone, Debug, PartialEq)]
pub struct Focus {
    pub fix: Option<String>,
    pub segment: Option<&'static str>,
}

pub(super) fn focus(fix: Option<&str>, segment: Option<&'static str>) -> Focus {
    Focus { fix: fix.map(str::to_owned), segment }
}

/// The parts of the approach the lesson goes by.
pub(super) struct Parts<'a> {
    pub(super) fixes: Vec<&'a Fix>,
    pub(super) faf: Option<&'a Fix>,
    pub(super) map: Option<&'a Fix>,
    pub(super) path: Vec<(f64, f64)>,
    pub(super) missed: Option<String>,
    pub(super) minimums: MinimumsKind,
    pub(super) drawing: &'a Drawing,
}

impl<'a> Parts<'a> {
    pub(super) fn of(d: &'a Drawing) -> Parts<'a> {
        let fixes = approach_fixes(d);
        Parts {
            faf: fixes.iter().copied().find(|f| f.has("FAF")),
            map: fixes.iter().copied().find(|f| f.has("MAP")),
            fixes,
            path: lesson_path(d),
            missed: missed_words(&d.missed_legs),
            minimums: minimums_kind(&d.name),
            drawing: d,
        }
    }

    /// Whether a procedure turn is drawn at a fix (wingtip.procedures).
    pub(super) fn turn_at(&self, ident: &str) -> bool {
        self.drawing.holds.iter().any(|h| h.fix == ident && h.kind == "procedure turn" && !h.missed)
    }

    /// A fix's distance on to the missed approach point along the line, nm.
    pub(super) fn nm_to_map(&self, fix: &Fix) -> Option<f64> {
        let map = self.map?;
        Some((along_nm(&self.path, (map.lat, map.lon)) - along_nm(&self.path, (fix.lat, fix.lon))).max(0.0))
    }
}

/// What a fix is in the lesson's words, by the part it plays.
pub(super) fn fix_title(fix: &Fix, after_faf: bool) -> &'static str {
    if fix.has("IAF") {
        "Initial Approach Fix"
    } else if fix.has("IF") || fix.has("FACF") {
        "Intermediate Fix"
    } else if fix.has("FAF") {
        "Final Approach Fix"
    } else if after_faf {
        "Step-Down Fix"
    } else {
        "Transition Fix"
    }
}

/// A fix's roles after its name, as a plate labels it: "SILEX (IAF)".
pub(super) fn labelled(fix: &Fix, start: bool) -> String {
    let roles: Vec<&str> = fix.roles.iter().map(String::as_str).filter(|r| *r != "hold" && *r != "FACF").collect();
    let name = fix_name(&fix.ident);
    let said = if start { upper_first(&name) } else { name };
    if roles.is_empty() {
        said
    } else {
        format!("{said} ({})", roles.join(", "))
    }
}

/// A fix's crossing altitude in words, "at or above 3,300 ft", as the
/// chart sets it (crate::route::picks::altitude_lines); None with none.
pub(super) fn altitude_words(fix: &Fix) -> Option<String> {
    let (crossing, _) = altitude_lines(fix.min_ft, fix.max_ft)?;
    Some(match crossing {
        Crossing::At => format!("at {} ft", alt_ft(fix.min_ft)),
        Crossing::Between => format!("between {} and {} ft", alt_ft(fix.min_ft), alt_ft(fix.max_ft)),
        Crossing::AtOrAbove => format!("at or above {} ft", alt_ft(fix.min_ft)),
        Crossing::AtOrBelow => format!("at or below {} ft", alt_ft(fix.max_ft)),
    })
}

/// The crossing altitude in words, capitalised as a line of its own.
pub(super) fn cross_words(fix: &Fix) -> String {
    altitude_words(fix).map_or_else(|| format!("Altitude: {SEE_THE_PLATE_LOWER}"), |w| format!("Cross {w}"))
}

/// An item of the briefing: its key, title, lines and what it shows.
#[derive(Clone, Debug, PartialEq)]
pub struct BriefItem {
    pub key: String,
    pub title: &'static str,
    pub lines: Vec<String>,
    pub focus: Focus,
}

/// The approach briefing, the way an instructor has a student brief it
/// before the approach (FAA-H-8083-16B, chapter 4, "Approach Briefing", in
/// the order of the plate's briefing strip and plan view): the procedure,
/// the radio, the final approach course, each fix and its altitude from the
/// IAF to the FAF, the minimums, the missed approach point and the missed
/// approach. Each shows its fix or its part on the map.
pub fn approach_brief(d: &Drawing, frequencies: &[Frequency], vref_kt: Option<f64>, vso_kt: Option<f64>) -> Vec<BriefItem> {
    let parts = Parts::of(d);
    let mut items: Vec<BriefItem> = Vec::new();
    let mut approach = vec![format!("{} at {}", d.name, d.airport)];
    approach.push(match d.transition.as_deref() {
        Some(t) if !t.is_empty() => format!("From {t}"),
        _ => "Vectors to final".to_owned(),
    });
    if d.stale {
        approach.push("Out of date: these are an older cycle's data".to_owned());
    }
    items.push(BriefItem { key: "approach".to_owned(), title: "The Approach", lines: approach, focus: focus(None, None) });
    items.push(BriefItem {
        key: "frequencies".to_owned(),
        title: "Frequencies",
        lines: brief_frequencies(frequencies),
        focus: focus(None, None),
    });
    let mut course = vec![d.final_course_deg.map_or_else(|| SEE_THE_PLATE.to_owned(), |c| format!("{} magnetic", bearing(c)))];
    if let Some(angle) = d.glidepath_deg {
        course.push(format!("Glidepath {}°", to_fixed(angle, 2)));
    }
    items.push(BriefItem { key: "course".to_owned(), title: "Final Approach Course", lines: course, focus: focus(None, Some("final")) });
    let mut after_faf = false;
    for fix in parts.fixes.iter().filter(|f| !f.has("MAP")) {
        let mut lines = vec![labelled(fix, true), cross_words(fix)];
        if parts.turn_at(&fix.ident) {
            lines.push("Procedure turn here".to_owned());
        } else if fix.has("hold") {
            lines.push("Hold here as the plate shows".to_owned());
        }
        if fix.has("FAF") {
            lines.push(match d.glidepath_deg {
                Some(angle) => format!("Descend on the {}° path from here", to_fixed(angle, 2)),
                None => format!("Descend to the {} from here", parts.minimums.key()),
            });
            if let Some(nm) = parts.nm_to_map(fix).filter(|nm| *nm > 0.0) {
                lines.push(format!("{} nm to the missed approach point", to_fixed(nm, 1)));
            }
        }
        items.push(BriefItem {
            key: format!("fix:{}", fix.ident),
            title: fix_title(fix, after_faf),
            lines,
            focus: focus(Some(&fix.ident), None),
        });
        if fix.has("FAF") {
            after_faf = true;
        }
    }
    let mut minimums = vec![match parts.minimums {
        MinimumsKind::DaOrMda => format!("DA (LPV, LNAV/VNAV) or MDA (LNAV): {SEE_THE_PLATE_LOWER}"),
        kind => format!("{}: {SEE_THE_PLATE_LOWER}", kind.key()),
    }];
    if let Some(category) = approach_category(vref_kt, vso_kt) {
        minimums.push(format!("Category {category}"));
    }
    items.push(BriefItem { key: "minimums".to_owned(), title: "Minimums", lines: minimums, focus: focus(None, Some("final")) });
    if let Some(map) = parts.map {
        items.push(BriefItem {
            key: "map".to_owned(),
            title: "Missed Approach Point",
            lines: if parts.minimums == MinimumsKind::Da {
                vec!["At the decision altitude on the glidepath".to_owned(), format!("Coded at {}", fix_name(&map.ident))]
            } else {
                vec![labelled(map, true)]
            },
            focus: focus(Some(&map.ident), None),
        });
    }
    items.push(BriefItem {
        key: "missed".to_owned(),
        title: "Missed Approach",
        lines: vec![parts.missed.clone().unwrap_or_else(|| SEE_THE_PLATE.to_owned())],
        focus: focus(None, Some("missed")),
    });
    items
}
