use super::*;

/// Words for a place as it is looked up: a run of the ICAO alphabet's
/// words (with figures after them) is the letters it spells, "kilo delta
/// lima hotel" KDLH, "charlie eight one" C81.
pub fn place_words(toks: &[Token]) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut i = 0;
    while i < toks.len() {
        let mut j = i;
        let mut spelled = String::new();
        while j < toks.len() {
            let t = &toks[j];
            if let Some(l) = letter(&t.word) {
                spelled.push(l);
            } else if !spelled.is_empty() && t.num.as_deref().is_some_and(|n| !n.contains('.')) {
                spelled.push_str(t.num.as_deref().unwrap());
            } else {
                break;
            }
            j += 1;
        }
        if j - i >= 2 {
            out.push(spelled);
            i = j;
        } else {
            out.push(toks[i].num.clone().unwrap_or_else(|| toks[i].word.clone()));
            i += 1;
        }
    }
    out.join(" ")
}

/// The route's words into its parts.
pub(super) fn route_of(toks: &[Token]) -> (Vec<Item>, bool) {
    let mut route = Vec::new();
    let mut as_filed = false;
    let mut words: Vec<Token> = Vec::new();
    fn flush(words: &mut Vec<Token>, route: &mut Vec<Item>) {
        let said = place_words(words).trim().to_owned();
        if !said.is_empty() {
            route.push(Item::Places(said));
        }
        words.clear();
    }
    let word = |k: usize| toks.get(k).map(|t| t.word.as_str());
    let mut i = 0;
    while i < toks.len() {
        let t = &toks[i];
        let w = t.word.as_str();
        if w == "as" && word(i + 1) == Some("filed") {
            flush(&mut words, &mut route);
            as_filed = true;
            i += 1;
        } else if w == "radar" && word(i + 1) == Some("vectors") {
            flush(&mut words, &mut route);
            route.push(Item::Vectors);
            i += 1;
        } else if w == "vectors" {
            flush(&mut words, &mut route);
            route.push(Item::Vectors);
        } else if let (Some(l), Some(n)) = (airway_letter(w), toks.get(i + 1).and_then(|n| n.num.as_deref())) {
            if (1..=4).contains(&n.len()) && is_ascii_digits(n) && !words.iter().any(|x| letter(&x.word).is_some()) {
                flush(&mut words, &mut route);
                route.push(Item::Airway(format!("{l}{n}")));
                i += 1;
            } else {
                words.push(t.clone());
            }
        } else if w == "heading" && toks.get(i + 1).and_then(|n| n.num.as_deref()).is_some() {
            flush(&mut words, &mut route);
            let n = toks[i + 1].num.as_deref().unwrap();
            route.push(Item::Heading(n.parse::<f64>().unwrap_or(0.0) as i64));
            i += 1;
        } else if (w == "departure" || w == "arrival") && words.len() >= 2 && words.last().is_some_and(|x| x.num.is_some()) {
            let number = words.last().unwrap().num.clone().unwrap();
            let name = place_words(&words[..words.len() - 1]);
            words.clear();
            let mut transition = None;
            if let Some(end) = (i + 1..toks.len()).find(|&k| toks[k].word == "transition")
                && end - i <= 4
            {
                let said: Vec<Token> = toks[i + 1..end].iter().filter(|x| !BETWEEN.contains(&x.word.as_str())).cloned().collect();
                let said = place_words(&said);
                transition = (!said.is_empty()).then_some(said);
                i = end;
            }
            route.push(Item::Procedure { kind: if w == "departure" { "departure" } else { "arrival" }, name, number, transition });
        } else if BETWEEN.contains(&w) || w == "fly" || w == "after" {
            flush(&mut words, &mut route);
        } else {
            words.push(t.clone());
        }
        i += 1;
    }
    flush(&mut words, &mut route);
    (route, as_filed)
}

/// The clearance in what was heard: everything after "cleared" (the call
/// sign before it left out), its altitudes, frequency and code wherever
/// they were said -- a squawk alone, as flight following's, is one too.
pub fn read(text: &str) -> Clearance {
    let toks = tokens(text);
    let word = |k: usize| toks.get(k).map(|t| t.word.as_str());
    let mut out = Clearance::default();
    // Where the limit and the route were read, which the rest is not
    // looked for in: the altitudes, frequency and code are said before
    // "cleared" too.
    let (mut from, mut rest) = (toks.len(), 0);
    if let Some(cleared) = toks.iter().position(|t| t.word == "cleared" || t.word == "clear") {
        from = cleared;
        let mut i = cleared + 1;
        if matches!(word(i), Some("into") | Some("through")) {
            // A Class B's: "cleared into the Class Bravo airspace".
            out.class_b = toks[i..(i + 5).min(toks.len())].iter().any(|t| t.word == "bravo" || t.word == "b");
            i = match (i + 1..toks.len()).find(|&k| toks[k].word == "airspace") {
                Some(k) => k + 1,
                None => i + 4,
            };
        } else if word(i).is_some_and(|w| w == "for" || w == "on" || APPROACH_WORDS.contains(&w))
            || (word(i) == Some("to") && word(i + 1) == Some("land"))
        {
            // No route in it, the altitudes after it still read.
        } else {
            if word(i) == Some("to") || toks.get(i).and_then(|t| t.num.as_deref()) == Some("2") {
                i += 1;
            }
            let start = i;
            while i < toks.len() && !limit_ends(&toks[i].word) && !(toks[i].word == "departure" && is_facility(&toks, i)) {
                i += 1;
                if toks[i - 1].word == "airport" {
                    break;
                }
            }
            let limit: Vec<Token> = toks[start..i].iter().filter(|t| t.word != "the").cloned().collect();
            let limit = place_words(&limit);
            out.limit = (!limit.is_empty()).then_some(limit);
            let end = (i..toks.len()).find(|&k| after_route(&toks[k].word) || (toks[k].word == "departure" && is_facility(&toks, k)));
            let (route, as_filed) = route_of(&toks[i..end.unwrap_or(toks.len())]);
            out.route = route;
            out.as_filed = as_filed;
            i = end.unwrap_or(toks.len());
        }
        rest = i;
    }
    let mut i = 0;
    while i < toks.len() {
        if i >= from && i < rest {
            i = rest;
            if i >= toks.len() {
                break;
            }
        }
        let t = &toks[i];
        let w = t.word.as_str();
        if ["maintain", "cruise", "climb", "descend"].contains(&w) && out.maintain_ft.is_none() {
            // "Climb and maintain" is read at its "maintain"; "climb to
            // five thousand", "descend flight level seven zero" at the verb.
            let mut k = i + 1;
            while (w == "climb" || w == "descend") && word(k).is_some_and(|x| ["to", "initially", "altitude"].contains(&x)) {
                k += 1;
            }
            if word(k) == Some("vfr") {
                out.vfr = true;
                k += 1;
            }
            if word(k) == Some("at") && word(k + 1) == Some("or") && matches!(word(k + 2), Some("below") | Some("above")) {
                out.maintain_limit = Some(format!("at or {}", word(k + 2).unwrap()));
                k += 3;
            }
            if let Some((ft, used)) = altitude_at(&toks, k) {
                out.maintain_ft = Some(ft);
                i = k + used - 1;
            }
        } else if w == "expect" && out.expect_ft.is_none() {
            if let Some((ft, used)) = altitude_at(&toks, i + 1) {
                out.expect_ft = Some(ft);
                i += used;
                // "...one zero minutes after departure".
                let minutes = (i + 1..(i + 4).min(toks.len())).find(|&k| ["minutes", "minute", "min"].contains(&toks[k].word.as_str()));
                if let Some(m) = minutes
                    && m - i > 1
                {
                    out.expect_min = toks[m - 1].num.as_deref().and_then(|n| n.parse::<f64>().ok()).map(|n| n as i64);
                }
            }
        } else if w == "squawk" || w == "transponder" || w == "code" {
            let code = toks[i + 1..(i + 3).min(toks.len())].iter().find_map(|x| x.num.clone());
            if let Some(code) = code
                && is_squawk(&code)
                && out.squawk.is_none()
            {
                out.squawk = Some(code);
            }
        } else if let Some(num) = &t.num
            && out.frequency.is_none()
        {
            let said: Vec<&str> = toks[i.saturating_sub(4)..i].iter().map(|x| x.word.as_str()).collect();
            let facility = said.iter().rev().find(|w| FACILITIES.contains(w)).map(|w| (*w).to_owned());
            if let Some(frequency) = frequency_of(num)
                && (facility.is_some() || said.contains(&"contact") || said.contains(&"monitor") || said.contains(&"frequency"))
            {
                out.frequency = Some(frequency);
                out.facility = facility;
            }
        }
        i += 1;
    }
    out
}
