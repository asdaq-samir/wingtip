use super::*;

/// A question of the quiz: its choices, the right one's index, where the
/// answer is, and what it shows.
#[derive(Clone, Debug, PartialEq)]
pub struct QuizQuestion {
    pub key: String,
    pub prompt: String,
    pub choices: Vec<String>,
    pub answer: usize,
    pub explain: String,
    pub focus: Focus,
}

/// A string's hash (FNV-1a over its UTF-16 code units, as the web's
/// Math.imul sum), for each question's choices to be in an order of its
/// own, the same each time it is asked on every device.
pub(super) fn hash(text: &str) -> u32 {
    let mut h: u32 = 2_166_136_261;
    for c in text.encode_utf16() {
        h = (h ^ u32::from(c)).wrapping_mul(16_777_619);
    }
    h
}

/// A question from its answer and its wrong choices: the wrong ones each
/// once, none the answer, at most three; none, no question.
pub(super) fn question(
    key: &str, prompt: String, answer: String, wrong: Vec<String>, explain: String, focus: Focus,
) -> Option<QuizQuestion> {
    let mut others: Vec<String> = Vec::new();
    for w in wrong {
        if !others.contains(&w) {
            others.push(w);
        }
    }
    others.retain(|w| *w != answer);
    others.truncate(3);
    if others.is_empty() {
        return None;
    }
    let at = (hash(key) % (others.len() as u32 + 1)) as usize;
    let mut choices = others;
    choices.insert(at, answer);
    Some(QuizQuestion { key: key.to_owned(), prompt, choices, answer: at, explain, focus })
}

/// Whether an ident is a runway's ("RW" and a figure).
pub(super) fn is_runway(ident: &str) -> bool {
    ident.starts_with("RW") && ident.as_bytes().get(2).is_some_and(u8::is_ascii_digit)
}

/// The lesson asked back, its answers hidden: multiple choice made from the
/// procedure's own data, each wrong choice another of its own values -- an
/// altitude another fix is crossed at, another fix, another course, the
/// descent rate at another ground speed -- so the right one is known only
/// by knowing the approach. Each answered says where it is.
pub fn approach_quiz(d: &Drawing, gs_kt: f64) -> Vec<QuizQuestion> {
    let parts = Parts::of(d);
    let mut out: Vec<Option<QuizQuestion>> = Vec::new();
    // Every altitude the procedure codes, for the wrong choices.
    let altitudes: Vec<String> = d
        .fixes
        .iter()
        .flat_map(|f| [f.min_ft, f.max_ft])
        .chain(d.missed_legs.iter().flat_map(|l| [l.min_ft, l.max_ft]))
        .flatten()
        .map(feet)
        .collect();
    let idents: Vec<String> = parts.fixes.iter().map(|f| f.ident.clone()).collect();
    for fix in parts.fixes.iter().filter(|f| f.min_ft.is_some() && (f.has("IAF") || f.has("IF") || f.has("FACF") || f.has("FAF"))) {
        let name = fix_name(&fix.ident);
        out.push(question(
            &format!("alt:{}", fix.ident),
            format!("What's the minimum altitude at {name}?"),
            feet(fix.min_ft.unwrap_or_default()),
            altitudes.clone(),
            format!(
                "{name}: cross {}, on the plate's profile view and by the fix on the map.",
                altitude_words(fix).unwrap_or_else(|| "null".to_owned())
            ),
            focus(Some(&fix.ident), None),
        ));
    }
    if let Some(faf) = parts.faf {
        out.push(question(
            "faf",
            "Which fix is the final approach fix?".to_owned(),
            faf.ident.clone(),
            idents.clone(),
            format!("{}, marked FAF on the plate's profile view, ringed on the map.", faf.ident),
            focus(Some(&faf.ident), None),
        ));
    }
    if let Some(final_course) = d.final_course_deg {
        let mut wrong = vec![bearing(final_course + 180.0)];
        wrong.extend(d.missed_legs.iter().filter_map(|l| l.course_deg.map(bearing)));
        out.push(question(
            "course",
            "What's the final approach course?".to_owned(),
            bearing(final_course),
            wrong,
            format!("{} magnetic, on the plate's plan view along the final, drawn over on the map.", bearing(final_course)),
            focus(None, Some("final")),
        ));
    }
    if let Some(angle) = d.glidepath_deg {
        let rate = |gs: f64| format!("{} ft/min", grouped(rounded_fpm(descent_fpm(gs, angle))));
        let deg = to_fixed(angle, 2);
        out.push(question(
            "descent",
            format!("On the {deg}° path at {} kt, about what descent rate?", js_num(gs_kt)),
            rate(gs_kt),
            [60.0, 90.0, 120.0, 150.0].into_iter().filter(|gs| *gs != gs_kt).map(rate).collect(),
            format!("About {}: the ground speed × 101.3 × tan {deg}°, as the TPP's rate of descent table gives it.", rate(gs_kt)),
            focus(parts.faf.map(|f| f.ident.as_str()), Some("final")),
        ));
    }
    if let Some(map) = parts.map {
        let where_ = match parts.minimums {
            MinimumsKind::Da => "the decision altitude",
            MinimumsKind::Mda => "the missed approach point",
            MinimumsKind::DaOrMda => "the DA or the missed approach point",
        };
        out.push(question(
            "decision",
            format!("What do you do at {where_} without the runway in sight?"),
            parts.missed.as_ref().map_or_else(|| "Go missed, as the plate shows".to_owned(), |m| format!("Go missed: {}", lower_first(m))),
            // The two a student most often gets wrong (14 CFR 91.175(c), (e)).
            vec![
                "Keep descending until the runway is in sight".to_owned(),
                "Circle over the field until the runway is in sight".to_owned(),
            ],
            "The missed approach at once (14 CFR 91.175(e)), as the plate's briefing strip and profile say it; drawn dashed on the map."
                .to_owned(),
            focus(Some(&map.ident), Some("missed")),
        ));
    }
    if let Some(hold_fix) = missed_hold_fix(d) {
        out.push(question(
            "missed-fix",
            "Where does the missed approach take you?".to_owned(),
            hold_fix.to_owned(),
            idents.iter().cloned().chain(d.fixes.iter().map(|f| f.ident.clone())).filter(|i| !is_runway(i)).collect(),
            format!("{hold_fix}, at the end of the missed approach's dashed line on the plate and the map."),
            focus(Some(hold_fix), Some("missed")),
        ));
    }
    out.into_iter().flatten().collect()
}
