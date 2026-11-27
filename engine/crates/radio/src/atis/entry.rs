use super::*;

/// The broadcast read, as far as it was heard: a figure not said, or
/// not understood, is left out rather than guessed.
pub fn read(text: &str) -> Atis {
    let toks = tokens(text);
    let n = toks.len();
    let mut r = Read { toks: &toks, used: vec![false; n], out: Atis { raw: text.trim().to_owned(), ..Atis::default() } };
    // Where the first figure was taken: the words before it name the
    // field and are no remark.
    let mut first_taken = n;
    let mut i = 0;
    while i < n {
        if r.used[i] {
            i += 1;
            continue;
        }
        let w = r.word(i).to_owned();
        let next = match w.as_str() {
            // The closing line, with the letter said again.
            "advise" if r.word(i + 1) == "on" || r.word(i + 1) == "you" => {
                let mut j = i + 1;
                while j < n && j - i < 10 && !(r.word(j) == "information" && r.letter_at(j + 1).is_some()) {
                    j += 1;
                }
                let j = if j < n && j - i < 10 { j + 2 } else { i + 4 };
                r.take(i, j);
                j
            }
            "information" => match r.letter_at(i + 1) {
                Some(l) => {
                    r.out.information.get_or_insert(l);
                    r.take(i, i + 2);
                    i + 2
                }
                None => i + 1,
            },
            "zulu" | "z" | "utc" if i > 0 => {
                // The time before it: "one eight five two", or a recognizer's
                // "18:52" in two figures.
                let (digits, from) = match (r.num(i - 1), i.checked_sub(2).and_then(|k| r.num(k))) {
                    (Some(a), Some(b)) if a.len() == 2 && b.len() == 2 && !r.used[i - 2] => (format!("{b}{a}"), i - 2),
                    (Some(a), _) if (3..=4).contains(&a.len()) => (format!("{a:0>4}"), i - 1),
                    _ => (String::new(), i),
                };
                let ok = digits.len() == 4
                    && digits[..2].parse::<u32>().is_ok_and(|h| h < 24)
                    && digits[2..].parse::<u32>().is_ok_and(|m| m < 60);
                if ok && r.out.time_z.is_none() {
                    r.out.time_z = Some(format!("{digits}Z"));
                    let from = if from > 0 && r.word(from - 1) == "time" { from - 1 } else { from };
                    r.take(from, i + 1);
                }
                i + 1
            }
            "wind" | "winds" => r.wind(i),
            "visibility" => match r.visibility_at(i + 1) {
                Some((v, less, j)) => {
                    if r.out.visibility_sm.is_none() {
                        r.out.visibility_sm = Some(v);
                        r.out.visibility_minus = less;
                    }
                    r.take(i, j);
                    j
                }
                None => i + 1,
            },
            "few" | "scattered" | "broken" | "overcast" => r.sky_layer(i),
            "ceiling" => {
                // "ceiling one thousand two hundred broken"; said without its
                // cover, a ceiling is at least broken (14 CFR 1.1's "ceiling").
                let mut j = i + 1;
                if r.word(j) == "is" {
                    j += 1;
                }
                // "indefinite ceiling three hundred sky obscured" (AIM
                // 7-1-11): an obscuration's vertical visibility, a ceiling.
                let from = if i > 0 && r.word(i - 1) == "indefinite" { i - 1 } else { i };
                match r.int(j) {
                    Some(base) => {
                        let cover = cover_of(r.word(j + 1)).unwrap_or(if r.word(j + 1) == "sky" && r.word(j + 2) == "obscured" {
                            "obscured"
                        } else {
                            "broken"
                        });
                        let end = j
                            + 1
                            + if cover_of(r.word(j + 1)).is_some() {
                                1
                            } else if cover == "obscured" {
                                2
                            } else {
                                0
                            };
                        r.take(from, end);
                        r.out.sky.push(Layer { cover, base_ft: Some(base) });
                        end
                    }
                    None => i + 1,
                }
            }
            "clear"
                if matches!(r.word(i + 1), "below" | "skies" | "sky")
                    || (i > 0 && matches!(r.word(i - 1), "sky" | "skies" | "condition" | "conditions")) =>
            {
                let from = if i > 0 && matches!(r.word(i - 1), "sky" | "skies" | "condition" | "conditions") { i - 1 } else { i };
                let mut j = i + 1;
                if r.word(j) == "below" && r.int(j + 1).is_some() {
                    j += 2;
                } else if matches!(r.word(j), "skies" | "sky") {
                    j += 1;
                }
                r.take(from, j);
                r.out.sky.push(Layer { cover: "clear", base_ft: None });
                j
            }
            "temperature" => match r.celsius_at(i + 1) {
                Some((t, j)) => {
                    r.out.temp_c.get_or_insert(t);
                    r.take(i, j);
                    j
                }
                None => i + 1,
            },
            "dew" | "dewpoint" => {
                let from = i + if w == "dew" && r.word(i + 1) == "point" { 2 } else { 1 };
                match r.celsius_at(from) {
                    Some((t, j)) => {
                        r.out.dewpoint_c.get_or_insert(t);
                        r.take(i, j);
                        j
                    }
                    None => i + 1,
                }
            }
            "altimeter" => {
                let mut j = i + 1;
                while matches!(r.word(j), "setting" | "is") {
                    j += 1;
                }
                // Four figures, "two niner niner two", or the recognizer's
                // "29.92" or "29 92"; a setting outside 25 to 32 inches was
                // misheard (ASOS reports to 31.00 and is set on the ground
                // from 28.00).
                let (value, end) = match (r.num(j), r.num(j + 1)) {
                    (Some(a), _) if a.contains('.') => (a.parse::<f64>().ok(), j + 1),
                    (Some(a), _) if a.len() == 4 => (format!("{}.{}", &a[..2], &a[2..]).parse().ok(), j + 1),
                    (Some(a), Some(b)) if a.len() == 2 && b.len() == 2 => (format!("{a}.{b}").parse().ok(), j + 2),
                    _ => (None, j),
                };
                match value.filter(|v| (25.0..=32.0).contains(v)) {
                    Some(v) => {
                        r.out.altimeter_inhg.get_or_insert(v);
                        r.take(i, end);
                        end
                    }
                    None => i + 1,
                }
            }
            "approach" | "approaches" => r.approach(i),
            "landing" | "arriving" | "arrival" | "arrivals" | "departing" | "departure" | "departures" => r.runways(i),
            "runway" | "runways" if r.word(i + 1) == "in" && r.word(i + 2) == "use" => r.runways(i),
            "using" | "active" if r.word(i + 1) == "runway" || r.word(i + 1) == "runways" => r.runways(i),
            "remarks" | "remark" => {
                // Everything after it is remarks, to the closing line.
                let mut j = i + 1;
                while j < n && !(r.word(j) == "advise" && (r.word(j + 1) == "on" || r.word(j + 1) == "you")) {
                    j += 1;
                }
                r.take(i, i + 1);
                let words: Vec<&str> = r.toks[i + 1..j].iter().map(|t| t.num.as_deref().unwrap_or(&t.word)).collect();
                if !words.is_empty() {
                    r.out.remarks.push(words.join(" "));
                }
                r.take(i + 1, j);
                j
            }
            _ => i + 1,
        };
        if next > i + 1 || r.used[i] {
            first_taken = first_taken.min(i);
        }
        i = next.max(i + 1);
    }
    r.remarks(first_taken);
    r.out
}
