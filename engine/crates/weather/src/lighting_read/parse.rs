//! One sentence of a lighting remark read into the systems it names and
//! how each is turned on (lighting_read). The forms are the Chart
//! Supplement legend's ("PILOT CONTROL OF AIRPORT LIGHTING: Available
//! systems will be indicated in the Service section, e.g., LGT ACTIVATE
//! HIRL Rwy 07-25, MALSR Rwy 07, and VASI Rwy 07 - 122.8") and NASR's
//! APT_RMK.csv LGT_SKED and BCN_LGT_SKED remarks, which say it in these
//! parts:
//!
//! - a condition first: "WHEN ATCT CLSD" (AIM 2-1-8: pilot control "when
//!   the tower or FSS is closed (locations with a part-time tower)"), or a
//!   schedule ("SS-SR", "DUSK-0230", "AFTER 0000");
//! - "ACTVT" and the systems turned on, each its legend code and the
//!   runways or ends it serves ("REIL RWY 18 & 27", "HIRL RWY 09/27 &
//!   18/36"), a ";" or "," between them;
//! - a system's own state: "PRESET ON LOW INTST" with its schedule, "OPR
//!   CONSLY" (on all the time), "PILOT ACTVTD";
//! - "TO INCR INTST": the pilot turns a preset light up;
//! - the frequency last, "- CTAF" or "- 122.8", and a count of clicks
//!   where the field gives one ("7 CLICKS ON CTAF").
//!
//! A sentence with any word outside these is not read at all: it is said
//! as written (the caller's note), so that no system is given a way of
//! being turned on the remark does not say.

/// A lighting system a sentence names.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct System {
    /// The Chart Supplement legend's code (MALSR, HIRL, PAPI); None where
    /// the name says all (taxiway lights, the beacon).
    pub code: Option<&'static str>,
    pub name: &'static str,
    pub runways: Vec<String>,
    pub pilot_controlled: bool,
    pub frequency: Option<String>,
    pub clicks: Option<u32>,
    pub tower_closed: bool,
    pub preset: Option<&'static str>,
    pub brighter: bool,
    pub schedule: Option<String>,
    pub continuous: bool,
    pub nonstandard: bool,
    pub as_written: String,
    activated: bool,
}

/// A sentence read: its systems, or what it says of none (`brighter`,
/// `freq`), and whether every word of it was read.
#[derive(Debug, Default)]
pub struct Sentence {
    pub systems: Vec<System>,
    pub ok: bool,
    pub tower_closed: bool,
    pub brighter: bool,
    pub freq: Option<String>,
    pub clicks: Option<u32>,
    pub schedule: Option<String>,
}

use super::lexicon::{clicks, frequency, is_designator, is_runway_word, is_sep, schedule, schedule3, system_at, tokens};

/// The sentence read (the module's notes); `beacon`, a remark on the
/// beacon (BCN_LGT_SKED), whose sentence with no system is the beacon's.
pub fn read(sentence: &str, beacon: bool) -> Sentence {
    let t = tokens(sentence);
    let mut s = Sentence { ok: true, ..Sentence::default() };
    let (mut group, mut sep, mut activating, mut nonstandard) = (0, false, false, false);
    let mut pending_runways: Vec<String> = Vec::new();
    let (mut lead, mut lead_used): (Option<String>, bool) = (None, false);
    let mut i = 0;
    let at = |k: usize| t.get(k).map(String::as_str);
    while i < t.len() && s.ok {
        let w = t[i].as_str();
        let current = (s.systems.len() > group).then_some(group);
        let mut step = 1;
        match w {
            "," | "&" | "AND" | ":" => sep = true,
            ";" => (group, sep) = (s.systems.len(), false),
            // "ACTVT OR INCR INTST REIL ...": either, the same keying.
            "TO" | "ON" | "AT" | "ARE" | "IS" | "IN" | "OR" => {}
            "LGT" | "LGTS" if i == 0 && matches!(at(1), Some("ACTVT" | "ACTIVATE")) => {}
            "WHEN" => match (at(i + 1), at(i + 2), at(i + 3)) {
                (Some("ATCT" | "TWR"), Some("CLSD"), _) => (s.tower_closed, step) = (true, 3),
                (Some("ATCT" | "TWR"), Some("IS"), Some("CLSD")) => (s.tower_closed, step) = (true, 4),
                _ => s.ok = false,
            },
            "ACTVT" | "ACTIVATE" | "ATCTVT" | "ACTVTD" | "ACTIVATED" | "PILOT" => {
                if w == "PILOT" {
                    s.ok = matches!(at(i + 1), Some("ACTVTD" | "ACTIVATED"));
                    step = 2;
                }
                // After its systems ("LGTS ACTVT - 121.95") it turns those on.
                let ends = at(i + step).is_none_or(|n| matches!(n, "-" | ";" | "TO") || frequency(n).is_some());
                if ends && current.is_some() {
                    s.systems[group..].iter_mut().for_each(|x| x.activated = true);
                } else {
                    activating = true;
                }
            }
            "INCR" | "INCREASE" => {
                s.ok = matches!(at(i + 1), Some("INTST" | "INTS" | "INTENSITY"));
                (s.brighter, step) = (true, 2);
            }
            "PRESET" => {
                let mut k = i + 1;
                while matches!(at(k), Some("ON" | "AT" | "TO")) {
                    k += 1;
                }
                let level = match at(k) {
                    Some("LOW") => Some("low"),
                    Some("MED" | "MEDIUM") => Some("medium"),
                    Some("HIGH" | "HI") => Some("high"),
                    _ => None,
                };
                k += usize::from(matches!(at(k + 1), Some("INTST" | "INTS" | "INTENSITY")));
                s.ok = level.is_some() && current.is_some();
                s.systems[group..].iter_mut().for_each(|x| x.preset = level);
                step = k + 1 - i;
            }
            // "OPR DUSK TO DAWN": the schedule, read next.
            "OPR" | "OPER" | "OPRS" | "OPERATES" | "OPERATE"
                if at(i + 1).is_some_and(|n| schedule(n).is_some()) || schedule3(&t, i + 1).is_some() => {}
            "OPR" | "OPER" | "OPRS" | "OPERATES" | "OPERATE" | "H24" | "CONSLY" | "CONTINUOUSLY" => {
                let alone = matches!(w, "H24" | "CONSLY" | "CONTINUOUSLY");
                let on = alone || matches!(at(i + 1), Some("CONSLY" | "CONTINUOUSLY" | "CONTINUOUS"));
                s.ok = on && current.is_some();
                s.systems[group..].iter_mut().for_each(|x| x.continuous = true);
                step = if alone { 1 } else { 2 };
            }
            "NSTD" => nonstandard = true,
            // "- 7 CLICKS ON CTAF": the count's own words follow.
            "-" if at(i + 1).and_then(clicks).is_some() && matches!(at(i + 2), Some("CLICKS" | "CLICK")) => {}
            "-" => s.ok = at(i + 1).is_some_and(|n| n == "FREQ" || frequency(n).is_some()),
            "FREQ" => s.ok = at(i + 1).and_then(frequency).is_some(),
            _ if frequency(w).is_some() => {
                // The frequency, after a dash or none ("RY 14/32 122.9"; the
                // CTAF's own figure, "CTAF 122.8"), a count of clicks after
                // it, and the end.
                let figure = at(i + 1).filter(|n| w == "CTAF" && n.contains('.')).and_then(frequency);
                s.freq = Some(figure.map_or(w.to_owned(), |f| format!("{w} {f}")));
                let mut k = i + 1 + usize::from(s.freq.as_deref() != Some(w));
                if let (Some(n), Some("CLICKS" | "CLICK" | "TIMES")) = (at(k).and_then(clicks), at(k + 1)) {
                    (s.clicks, k) = (Some(n), k + 2);
                }
                s.ok = k >= t.len();
                step = k - i;
            }
            "KEY" => {
                // "KEY 122.85 5 TIMES", "KEY MIC 7 TIMES ON CTAF".
                let k = i + 1 + usize::from(matches!(at(i + 1), Some("MIC" | "MIKE")));
                match (at(k), at(k + 1), at(k + 2), at(k + 3), at(k + 4)) {
                    (Some(f), Some(n), Some("TIMES" | "CLICKS"), ..) if frequency(f).is_some() && clicks(n).is_some() => {
                        (s.freq, s.clicks, step) = (frequency(f), clicks(n), k + 3 - i);
                    }
                    (Some(n), Some("TIMES" | "CLICKS"), Some("ON"), Some(f), _) if frequency(f).is_some() && clicks(n).is_some() => {
                        (s.freq, s.clicks, step) = (frequency(f), clicks(n), k + 4 - i);
                    }
                    _ => s.ok = false,
                }
                activating = true;
            }
            _ if clicks(w).is_some() && matches!(at(i + 1), Some("CLICKS" | "CLICK")) => {
                // "7 CLICKS ON CTAF".
                s.clicks = clicks(w);
                s.ok = at(i + 2) == Some("ON") && at(i + 3).and_then(frequency).is_some();
                s.freq = at(i + 3).and_then(frequency);
                step = 4;
            }
            _ if is_runway_word(w) || (is_designator(w) && current.is_some()) => {
                // The runways, to the system before them, or the next.
                let mut k = i;
                let mut found = Vec::new();
                loop {
                    match at(k) {
                        Some(r) if is_designator(r) => found.push(r.to_owned()),
                        Some(r) if is_runway_word(r) => {}
                        Some(r) if is_sep(r) && at(k + 1).is_some_and(|n| is_designator(n) || is_runway_word(n)) => {}
                        _ => break,
                    }
                    k += 1;
                }
                match s.systems.last_mut().filter(|_| current.is_some()) {
                    Some(sys) => sys.runways.extend(found),
                    None => pending_runways.extend(found),
                }
                step = k - i;
                s.ok = step > 1 || is_designator(w);
            }
            _ if schedule(w).is_some()
                || schedule3(&t, i).is_some()
                || (matches!(w, "AFTER" | "AFT") && at(i + 1).is_some_and(|n| n.len() == 4 && n.bytes().all(|b| b.is_ascii_digit()))) =>
            {
                let three = schedule(w).is_none().then(|| schedule3(&t, i)).flatten();
                let span = schedule(w).or(three.clone()).unwrap_or_else(|| format!("after {}", at(i + 1).unwrap_or_default()));
                step = if three.is_some() {
                    3
                } else if matches!(w, "AFTER" | "AFT") {
                    2
                } else {
                    1
                };
                match current {
                    Some(g) => s.systems[g..].iter_mut().filter(|x| x.schedule.is_none()).for_each(|x| x.schedule = Some(span.clone())),
                    None => (lead, lead_used) = (Some(span), false),
                }
            }
            _ => match system_at(&t, i, !pending_runways.is_empty()) {
                Some((code, name, n)) => {
                    if sep {
                        group = s.systems.len();
                    }
                    let runways = std::mem::take(&mut pending_runways);
                    let nstd = std::mem::take(&mut nonstandard);
                    // A schedule before the systems is theirs ("SS-SR ACTVT MIRL").
                    let schedule = lead.clone();
                    lead_used |= lead.is_some();
                    s.systems.push(System { code, name, runways, schedule, activated: activating, nonstandard: nstd, ..System::default() });
                    (sep, step) = (false, n);
                }
                None => s.ok = false,
            },
        }
        i += step;
    }
    if beacon && s.systems.is_empty() && (activating || s.freq.is_some() || lead.is_some()) {
        lead_used = true;
        s.systems.push(System { name: "Rotating beacon", schedule: lead.clone(), activated: activating, ..System::default() });
    }
    // A schedule after the systems with none of its own to follow it
    // ("... ACTVT AFTER 0230 - CTAF") is not said of the ones before.
    s.ok &= pending_runways.is_empty() && !nonstandard && (lead_used || s.systems.is_empty() || lead.is_none());
    // A light with no way of its own in a sentence that gives others theirs
    // ("SS-SR, REIL RWY 09; HIRL RWY 09/27 OPR CONSLY, TO INCR INTST -
    // CTAF": is the REIL keyed, or on?) is not given one: the sentence is
    // said as written. With none given at all, a frequency is the legend's
    // pilot control ("LIRL RWY 17/35 - 123.0").
    let ways = activating || s.brighter || s.systems.iter().any(|x| x.activated || x.continuous || x.preset.is_some());
    let stated = |x: &System| x.activated || x.continuous || x.preset.is_some() || x.schedule.is_some();
    s.ok &= !ways || s.systems.iter().all(stated);
    for x in &mut s.systems {
        x.tower_closed = s.tower_closed;
        x.brighter = s.brighter && x.preset.is_some();
        x.pilot_controlled = !x.continuous && (x.activated || x.brighter || (s.freq.is_some() && !ways));
        if x.pilot_controlled {
            (x.frequency, x.clicks) = (s.freq.clone(), s.clicks);
        }
    }
    s.schedule = lead.filter(|_| s.systems.is_empty());
    s
}
