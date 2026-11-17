use super::*;

/// "word", any space, "word" (/a\s+b/i with `at_least_one`, /a\s*b/i without).
pub(super) fn spaced_ci(c: &[char], a: &str, b: &str, at_least_one: bool) -> bool {
    let n = a.chars().count();
    (0..c.len()).any(|i| {
        js::starts_ci(c, i, a) && {
            let s = space_run(c, i + n);
            (s > 0 || !at_least_one) && js::starts_ci(c, i + n + s, b)
        }
    })
}

/// "usable", then up to forty that are not digits, then a figure
/// (/usable[^\d]{0,40}(\d[\d,.]*)/i): the figure's text.
pub(super) fn usable_figure(c: &[char]) -> Option<String> {
    for i in 0..c.len() {
        if !js::starts_ci(c, i, "usable") {
            continue;
        }
        let from = i + 6;
        let gap = c[from..].iter().take_while(|x| !x.is_ascii_digit()).count();
        if gap <= 40 && from + gap < c.len() {
            let start = from + gap;
            let len = 1 + c[start + 1..].iter().take_while(|x| x.is_ascii_digit() || **x == ',' || **x == '.').count();
            return Some(c[start..start + len].iter().collect());
        }
    }
    None
}

/// /\d{3,5}\s*(ft|feet)/i: an altitude in feet.
pub(super) fn says_feet(c: &[char]) -> bool {
    (0..c.len()).any(|i| {
        let run = digit_run(c, i);
        run >= 3 && (i == 0 || !c[i - 1].is_ascii_digit()) && {
            let after = i + run + space_run(c, i + run);
            js::starts_ci(c, after, "ft") || js::starts_ci(c, after, "feet")
        }
    })
}

/// /\bv\s*no\b/i: Vno, the maximum structural cruising speed.
pub(super) fn says_vno(c: &[char]) -> bool {
    (0..c.len()).any(|i| {
        js::boundary(c, i) && js::starts_ci(c, i, "v") && {
            let at = i + 1 + space_run(c, i + 1);
            js::starts_ci(c, at, "no") && js::boundary(c, at + 2)
        }
    })
}

/// /fuel\s+(consumption|flow|burn)|gal(lons)?\.?\s*(per|\/)\s*h(ou)?r|\bgph\b/i.
pub(super) fn says_burn(c: &[char]) -> bool {
    if ["consumption", "flow", "burn"].iter().any(|w| spaced_ci(c, "fuel", w, true)) || js::has_word_ci(c, "gph") {
        return true;
    }
    (0..c.len()).any(|i| {
        if !js::starts_ci(c, i, "gal") {
            return false;
        }
        let mut j = i + 3;
        if js::starts_ci(c, j, "lons") {
            j += 4;
        }
        if c.get(j) == Some(&'.') {
            j += 1;
        }
        j += space_run(c, j);
        if js::starts_ci(c, j, "per") {
            j += 3;
        } else if c.get(j) == Some(&'/') {
            j += 1;
        } else {
            return false;
        }
        j += space_run(c, j);
        if !js::starts_ci(c, j, "h") {
            return false;
        }
        j += 1;
        if js::starts_ci(c, j, "ou") {
            j += 2;
        }
        js::starts_ci(c, j, "r")
    })
}

/// The figure after the cruise's own power where two powers' burns share a
/// line ("75% 8.4 gph 65% 7.0 gph"): /\b75\s*%[^\d]{0,20}(\d+(?:\.\d+)?)/.
pub(super) fn burn_at_power(c: &[char], pct: &str) -> Option<String> {
    let n = pct.chars().count();
    for i in 0..c.len() {
        if !(js::boundary(c, i) && c[i..].starts_with(&pct.chars().collect::<Vec<_>>())) {
            continue;
        }
        let pc = i + n + space_run(c, i + n);
        if c.get(pc) != Some(&'%') {
            continue;
        }
        let gap = c[pc + 1..].iter().take_while(|x| !x.is_ascii_digit()).count();
        if gap > 20 || pc + 1 + gap >= c.len() {
            continue;
        }
        let start = pc + 1 + gap;
        let mut end = start + digit_run(c, start);
        if c.get(end) == Some(&'.') && c.get(end + 1).is_some_and(char::is_ascii_digit) {
            end += 1 + digit_run(c, end + 1);
        }
        return Some(c[start..end].iter().collect());
    }
    None
}

pub fn figures_of_page(text: &str) -> Figures {
    let lines = entries(text);
    let mut found = Figures::default();

    for line in &lines {
        let c = chars(line);
        let n = figure(line);
        if found.service_ceiling_ft.is_none() && spaced_ci(&c, "service", "ceiling", true) && bounded(n, "serviceCeilingFt") {
            found.service_ceiling_ft = n.map(|value| Figure { value, words: line.clone() });
        }
        // "Best Rate of Climb Speed (mph) 85": a speed, not the rate itself.
        if found.climb_tas_kt.is_none() && js::contains_ci(&c, "climb") && js::contains_ci(&c, "speed") && bounded(n, "climbTasKt") {
            found.climb_tas_kt = n.map(|v| Figure { value: knots(line, v), words: line.clone() });
        }
        // "Usable Fuel (gal) 48" or "Total 56 GAL. usable 53 GAL."
        if found.usable_fuel_gal.is_none() && js::contains_ci(&c, "usable") && !js::contains_ci(&c, "unusable") {
            let v = match usable_figure(&c) {
                Some(after) => Some(number(&after)),
                None => n,
            };
            if bounded(v, "usableFuelGal") {
                found.usable_fuel_gal = v.map(|value| Figure { value, words: line.clone() });
            }
        }
    }

    // Cruise: of the page's cruising speeds, the one at a stated altitude
    // (the handbook's "optimum"), at 75% power where it says, over one at
    // sea level or at a lower, training power; the first of the best.
    let mut cruise: Option<(&String, i32)> = None;
    for l in &lines {
        let c = chars(l);
        // Not the structural cruising speed (Vno), a limit, not a cruise.
        let is_cruise = js::contains_ci(&c, "cruis")
            && !(js::contains_ci(&c, "structural") || says_vno(&c))
            && (js::contains_ci(&c, "speed")
                || js::contains_ci(&c, "knots")
                || js::has_word_ci(&c, "kt")
                || js::has_word_ci(&c, "kts")
                || js::contains_ci(&c, "mph"))
            && bounded(figure(l), "cruiseTasKt");
        if !is_cruise {
            continue;
        }
        let score = if says_feet(&c) && !spaced_ci(&c, "sea", "level", false) { 2 } else { 0 } + i32::from(power(l) == 75.0);
        if cruise.is_none_or(|(_, best)| score > best) {
            cruise = Some((l, score));
        }
    }
    if let Some((l, _)) = cruise {
        if let Some(v) = figure(l) {
            found.cruise_tas_kt = Some(Figure { value: knots(l, v), words: l.clone() });
        }
        let pct = power(l);
        if bounded(Some(pct), "cruisePowerPct") {
            found.cruise_power_pct = Some(Figure { value: pct, words: l.clone() });
        }
    }

    // Fuel burn: "Fuel Consumption (gal per hr 75%) 8.4", the one at the
    // cruise's power where the page gives several.
    let burns: Vec<&String> = lines.iter().filter(|l| says_burn(&chars(l)) && bounded(figure(l), "fuelBurnGph")).collect();
    let cruise_pct = found.cruise_power_pct.as_ref().map(|f| f.value);
    let burn = burns.iter().find(|l| cruise_pct.is_some_and(|p| power(l) == p)).or(burns.first());
    if let Some(burn) = burn {
        // Two powers' burns read onto one line ("75% 8.4 gph 65% 7.0 gph"):
        // the figure after the cruise's own power, not the line's last.
        let after = cruise_pct.filter(|p| *p != 0.0).and_then(|p| burn_at_power(&chars(&bare(burn)), &js::number_string(p)));
        let v = match after {
            Some(a) => Some(number(&a)),
            None => figure(burn),
        };
        if bounded(v, "fuelBurnGph") {
            found.fuel_burn_gph = v.map(|value| Figure { value, words: (*burn).clone() });
        }
    }

    found
}

/// The figures found as the web app's PageFigures, `{"cruiseTasKt":
/// {"value", "words"}, ...}`, a figure not found left out.
pub fn to_json(f: &Figures) -> String {
    let mut out = String::from("{");
    let all = [
        ("serviceCeilingFt", &f.service_ceiling_ft),
        ("climbTasKt", &f.climb_tas_kt),
        ("usableFuelGal", &f.usable_fuel_gal),
        ("cruiseTasKt", &f.cruise_tas_kt),
        ("cruisePowerPct", &f.cruise_power_pct),
        ("fuelBurnGph", &f.fuel_burn_gph),
    ];
    for (name, fig) in all {
        if let Some(fig) = fig {
            if out.len() > 1 {
                out.push(',');
            }
            out.push_str(&format!("\"{name}\":{{\"value\":"));
            json::number(&mut out, fig.value);
            out.push_str(",\"words\":");
            json::string(&mut out, &fig.words);
            out.push('}');
        }
    }
    out.push('}');
    out
}
