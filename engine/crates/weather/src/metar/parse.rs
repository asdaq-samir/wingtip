use super::*;

impl Metar {
    /// The ceiling (sky_ceiling), None where there is none or it is not
    /// known (ceiling_unknown tells them apart).
    pub fn ceiling_ft(&self) -> Option<f64> {
        sky_ceiling(&self.layers).0
    }

    /// A broken, overcast or obscured layer is the lowest and was sent
    /// with no height: the ceiling is not known, not absent.
    pub fn ceiling_unknown(&self) -> bool {
        sky_ceiling(&self.layers).1
    }
}

/// A variable wind direction group, "250V310": the two bounds the
/// direction varied between, clockwise from the first, true as the wind
/// group is. A METAR sends it after the wind where the direction varies by
/// 60 degrees or more with the speed over 6 knots (FMH-1 chapter 12, the
/// wind group; AIM 7-1-28's METAR key, "dddVddd"): the wind may then blow
/// from anywhere between them, so the runways' crosswind and tailwind are
/// judged at the worst of them (wingtip_brief::runway::wind_variable).
pub fn variable_group(w: &str) -> Option<(f64, f64)> {
    let b = w.as_bytes();
    if b.len() != 7 || b[3] != b'V' || !b[..3].iter().chain(&b[4..]).all(u8::is_ascii_digit) {
        return None;
    }
    let (from, to) = (w[..3].parse::<f64>().ok()?, w[4..].parse::<f64>().ok()?);
    (from <= 360.0 && to <= 360.0).then_some((from, to))
}

/// The variable direction in a report's text, before its remarks; None
/// where it sends none.
pub fn variable_direction(raw: &str) -> Option<(f64, f64)> {
    raw.split_whitespace().take_while(|w| *w != "RMK").find_map(variable_group)
}

/// A report as sent, "METAR KDLH 021355Z ... RMK ...". None where the
/// station and time cannot be read; groups it does not know are passed
/// over, as the AWC passes them over.
pub fn parse(raw: &str) -> Option<Metar> {
    let mut words = raw.split_whitespace().peekable();
    let mut m = Metar::default();
    match words.peek().copied() {
        Some("METAR") => {
            words.next();
        }
        Some("SPECI") => {
            m.speci = true;
            words.next();
        }
        _ => {}
    }
    let station = words.next()?;
    if !(station.len() == 4 && station.bytes().all(|b| b.is_ascii_alphanumeric())) {
        return None;
    }
    m.station = station.to_string();
    let time = words.next()?.strip_suffix('Z')?;
    if time.len() != 6 || !time.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    (m.day, m.hour, m.minute) = (time[..2].parse().ok()?, time[2..4].parse().ok()?, time[4..].parse().ok()?);
    let words: Vec<&str> = words.collect();
    let mut i = 0;
    let mut remarks = false;
    let mut inches = false;
    while i < words.len() {
        let w = words[i];
        i += 1;
        if !w.is_ascii() {
            continue;
        }
        // The tenths remark wherever it is: a report with "RMK" mistyped
        // ("RMAO2") still carries it.
        if let Some((t, d)) = tenths(w).filter(|_| remarks || w.len() >= 5) {
            m.temp_c = Some(t);
            if d.is_some() {
                m.dewpoint_c = d;
            }
            continue;
        }
        if remarks {
            continue;
        }
        match w {
            "RMK" => remarks = true,
            "AUTO" | "COR" | "NOSIG" | "BECMG" | "TEMPO" => {
                // The trend that follows is a forecast, not the report.
                if matches!(w, "BECMG" | "TEMPO") {
                    while i < words.len() && words[i] != "RMK" {
                        i += 1;
                    }
                }
            }
            "CAVOK" => {
                // Ceiling and visibility OK: 10 km or more, no cloud below
                // 5,000 ft (WMO No. 306): the AWC writes it 6+.
                m.visibility_sm = Some(6.0);
                m.visibility_plus = true;
                m.sky_reported = true;
            }
            // Kilometres, as some states report ten or more ("18KM").
            _ if m.visibility_sm.is_none() && w.len() > 2 && w.ends_with("KM") && w[..w.len() - 2].bytes().all(|b| b.is_ascii_digit()) => {
                m.visibility_sm = Some(metric_sm(w[..w.len() - 2].parse::<f64>().unwrap() * 1000.0));
            }
            _ if m.wind.is_none() && m.visibility_sm.is_none() && wind(w).is_some() => m.wind = wind(w),
            _ if variable_group(w).is_some() => m.wind_variable_deg = variable_group(w),
            _ if m.visibility_sm.is_none()
                && w.len() == 1
                && w.as_bytes()[0].is_ascii_digit()
                && words.get(i).is_some_and(|n| n.contains('/') && n.ends_with("SM")) =>
            {
                let whole = w.parse::<f64>().ok();
                m.visibility_sm = statute_miles(words[i], whole).map(|(v, _)| v);
                i += 1;
            }
            _ if m.visibility_sm.is_none() && w.ends_with("SM") => {
                if let Some((v, plus)) = statute_miles(w, None) {
                    m.visibility_sm = Some(v);
                    m.visibility_plus = plus;
                }
            }
            // Metres (WMO No. 306): 9999 is 10 km or more.
            _ if m.visibility_sm.is_none() && w.len() == 4 && w.bytes().all(|b| b.is_ascii_digit()) => {
                let metres: f64 = w.parse().unwrap();
                m.visibility_sm = Some(metres_to_sm(metres));
                m.visibility_plus = metres >= 9999.0;
            }
            _ if w.starts_with('R') && w.contains('/') && w.len() > 4 => {} // runway visual range
            _ if layer(w).is_some() => {
                m.sky_reported = true;
                m.layers.extend(layer(w).unwrap());
            }
            _ if is_weather(w) => m.weather.push(w.to_string()),
            _ if w.len() >= 3 && w.contains('/') && !w.contains("SM") => {
                let (t, d) = w.split_once('/').unwrap();
                // The dewpoint a temperature, or missing ("29/", "29//"):
                // anything else run on to it is no temperature group.
                let dew_ok = d.is_empty() || d.bytes().all(|b| b == b'/') || temperature(d).is_some();
                if let Some(t) = temperature(t).filter(|_| dew_ok) {
                    m.temp_c = Some(t);
                    m.dewpoint_c = temperature(d);
                }
            }
            // The inches group where there is one: the setting itself, to a
            // hundredth; a Q group's hectopascals only where there is not.
            _ if w.len() == 5 && w.starts_with('A') && w[1..].bytes().all(|b| b.is_ascii_digit()) => {
                m.altimeter_inhg = Some(w[1..].parse::<f64>().unwrap() / 100.0);
                inches = true;
            }
            _ if w.len() == 5 && w.starts_with('Q') && w[1..].bytes().all(|b| b.is_ascii_digit()) && !inches => {
                m.altimeter_inhg = Some((w[1..].parse::<f64>().unwrap() / HPA_PER_INHG * 100.0).round() / 100.0);
            }
            _ => {}
        }
    }
    Some(m)
}
