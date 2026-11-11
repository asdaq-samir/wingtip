//! A field's lighting remarks read for a pilot (`lighting_read`): each
//! system its Chart Supplement entry names, by its name in AIM 2-1, the
//! runways it serves and how it is turned on, and what is not read said
//! as written. The remarks are the Chart Supplement's (NASR APT_RMK.csv,
//! the same text): LGT_SKED, the field's lights, and BCN_LGT_SKED, its
//! beacon's.
//!
//! What a pilot needs of a light is how to have it on. The legend: "Lights
//! are in operation sunset to sunrise. Lighting available by prior
//! arrangement only or operating part of the night and/or pilot
//! controlled lighting with specific operating hours are indicated under
//! airport or military remarks", and pilot control's systems "in the
//! Service section, e.g., LGT ACTIVATE HIRL Rwy 07-25, MALSR Rwy 07, and
//! VASI Rwy 07 - 122.8". AIM 2-1-8 (Pilot Control of Airport Lighting):
//! keying the mic, "7 times within 5 seconds: highest intensity
//! available; 5 times: medium or lower intensity; 3 times: lowest
//! intensity available", the lights on for 15 minutes from the last
//! keying -- the `standard_keying` where the remarks give no count of
//! their own.
//!
//! Each sentence is read by parse; one it cannot read in full is a note,
//! its contractions written out (crate::contractions) and any word it does
//! not know kept as written, never guessed.

mod lexicon;
mod parse;
#[cfg(test)]
mod tests;

use crate::contractions::{is_code, lighting_written};
use crate::json::{self, Value};
pub use parse::System;

/// A field's lights read.
#[derive(Debug, Default, PartialEq)]
pub struct LightingRead {
    pub systems: Vec<System>,
    /// What was not read: (its words written out, as written).
    pub notes: Vec<(String, String)>,
    pub standard_keying: bool,
}

/// The sentences of a remark, a stop between each; a stop between figures
/// (122.8) is a frequency's.
fn sentences(text: &str) -> Vec<String> {
    let text = text.replace('—', " - ").replace('–', "-");
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut cur = String::new();
    for (k, &c) in chars.iter().enumerate() {
        let decimal = k > 0 && chars[k - 1].is_ascii_digit() && chars.get(k + 1).is_some_and(char::is_ascii_digit);
        if c == '.' && !decimal {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
    }
    out.push(cur);
    out.into_iter().map(|s| s.split_whitespace().collect::<Vec<_>>().join(" ")).filter(|s| !s.is_empty()).collect()
}

/// The short words of plain English a remark uses, set in lower case
/// (any other of three letters or fewer is a code or an ident).
const PLAIN_SHORT: &str = "AND TO FOR ON AT OF THE IS ARE OR BY IN ALL LOW OFF";

/// A sentence not read, in words: each contraction written out, a code,
/// a figure and an ident as written, a longer word in lower case.
fn words(sentence: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    for word in sentence.split_whitespace() {
        let core = word.trim_end_matches([',', ';', ':']);
        let tail = &word[core.len()..];
        let said = if let Some(span) = lexicon::schedule(core) {
            span
        } else if let Some(full) = lighting_written(core) {
            full.to_owned()
        } else if is_code(core)
            || lexicon::is_designator(core)
            || core.bytes().any(|b| b.is_ascii_digit())
            || (core.len() <= 3 && !PLAIN_SHORT.split(' ').any(|w| w == core))
        {
            core.to_owned()
        } else {
            core.to_ascii_lowercase()
        };
        out.push(said + tail);
    }
    let mut text = out.join(" ");
    if let Some(first) = text.get(..1) {
        text = first.to_ascii_uppercase() + &text[1..];
    }
    text + "."
}

/// How a system is turned on, in a pilot's words: "Key the mic on CTAF
/// when the tower is closed", "Preset low, sunset to sunrise; key the mic
/// on CTAF for more", "On all the time". None where the remark says none.
fn how(s: &System) -> Option<String> {
    let key = s.pilot_controlled.then(|| {
        let times = s.clicks.map(|n| format!(" {n} times")).unwrap_or_default();
        match &s.frequency {
            Some(f) => format!("key the mic{times} on {f}"),
            None => "pilot-controlled".to_owned(),
        }
    });
    let mut parts: Vec<String> = Vec::new();
    if s.continuous {
        parts.push("on all the time".to_owned());
    } else if let Some(level) = s.preset {
        parts.push(format!("preset {level}{}", s.schedule.as_ref().map(|w| format!(", {w}")).unwrap_or_default()));
        parts.extend(key.map(|k| if s.brighter { format!("{k} for more") } else { k }));
    } else if let Some(k) = key {
        parts.push(format!("{k}{}", s.schedule.as_ref().map(|w| format!(", {w}")).unwrap_or_default()));
    } else if let Some(w) = &s.schedule {
        parts.push(if w.starts_with("after") { format!("on {w}") } else { format!("on from {w}") });
    }
    if parts.is_empty() {
        return None;
    }
    let said = match (s.tower_closed, parts.len()) {
        (false, _) => parts.join("; "),
        (true, 1) => format!("{} when the tower is closed", parts[0]),
        (true, _) => format!("when the tower is closed, {}", parts.join("; ")),
    };
    Some(said[..1].to_ascii_uppercase() + &said[1..])
}

/// "INCR INTST - CTAF." after the sentence of a preset light (O47's "MIRL
/// RWY 17/35 ON SS-SR, PRESET LOW INTST. INCR INTST - CTAF."): turning up
/// a light only means one on at a preset, so it is the sentence before's
/// preset lights', under the same condition. False where it is not so.
fn brightens(before: &mut [System], s: &parse::Sentence, as_written: &str) -> bool {
    let preset: Vec<&mut System> = before.iter_mut().filter(|x| x.preset.is_some() && !x.brighter).collect();
    let fits = s.brighter && s.freq.is_some() && s.schedule.is_none() && !preset.is_empty();
    if !fits || preset.iter().any(|x| x.tower_closed != s.tower_closed) {
        return false;
    }
    for x in preset {
        (x.brighter, x.pilot_controlled, x.frequency, x.clicks) = (true, true, s.freq.clone(), s.clicks);
        x.as_written = format!("{} {as_written}", x.as_written);
    }
    true
}

/// A count of clicks of the field's own (AIM 2-1-8's are then not it).
fn counts_clicks(text: &str) -> bool {
    let w: Vec<&str> = text.split(|c: char| !c.is_ascii_alphanumeric()).filter(|w| !w.is_empty()).collect();
    w.windows(2).any(|p| {
        matches!(p[1], "CLICK" | "CLICKS" | "TIMES") && (p[0].parse::<u32>().is_ok() || matches!(p[0], "THREE" | "FIVE" | "SEVEN"))
    })
}

/// The field's lighting remarks (`lighting`) and its beacon's (`beacon`),
/// as sent, read.
pub fn read(lighting: &[&str], beacon: &[&str]) -> LightingRead {
    let mut r = LightingRead::default();
    let remarks = lighting.iter().map(|t| (*t, false)).chain(beacon.iter().map(|t| (*t, true)));
    for (text, is_beacon) in remarks {
        // Words with any lower case are someone's own writing: as sent.
        if text.bytes().any(|b| b.is_ascii_lowercase()) {
            r.notes.push((text.trim().to_owned(), text.trim().to_owned()));
            continue;
        }
        let mut before: Vec<System> = Vec::new();
        for sentence in sentences(text) {
            let as_written = format!("{sentence}.");
            let mut read = parse::read(&sentence, is_beacon);
            if !read.ok || (read.systems.is_empty() && !brightens(&mut before, &read, &as_written)) {
                if read.ok && !read.brighter && read.freq.is_none() && read.schedule.is_none() && !read.tower_closed {
                    continue;
                }
                r.notes.push((words(&sentence), as_written));
                continue;
            }
            if read.systems.is_empty() {
                // Said of the lights before it (brightens).
                continue;
            }
            r.systems.append(&mut before);
            read.systems.iter_mut().for_each(|x| x.as_written = as_written.clone());
            before = read.systems;
        }
        r.systems.append(&mut before);
    }
    let pilot = r.systems.iter().any(|s| s.pilot_controlled);
    r.standard_keying = pilot && !lighting.iter().chain(beacon).any(|t| counts_clicks(&t.to_ascii_uppercase()));
    r
}

fn strings(out: &mut String, items: &[String]) {
    out.push('[');
    for (k, s) in items.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        json::string(out, s);
    }
    out.push(']');
}

fn system_json(out: &mut String, s: &System) {
    out.push_str("{\"code\":");
    json::opt_string(out, s.code);
    out.push_str(",\"name\":");
    json::string(out, s.name);
    out.push_str(",\"runways\":");
    strings(out, &s.runways);
    out.push_str(&format!(",\"pilot_controlled\":{},\"frequency\":", s.pilot_controlled));
    json::opt_string(out, s.frequency.as_deref());
    out.push_str(&format!(",\"clicks\":{}", s.clicks.map_or("null".to_owned(), |n| n.to_string())));
    out.push_str(&format!(",\"tower_closed\":{},\"preset\":", s.tower_closed));
    json::opt_string(out, s.preset);
    out.push_str(&format!(",\"brighter\":{},\"schedule\":", s.brighter));
    json::opt_string(out, s.schedule.as_deref());
    out.push_str(&format!(",\"continuous\":{},\"nonstandard\":{},\"how\":", s.continuous, s.nonstandard));
    json::opt_string(out, how(s).as_deref());
    out.push_str(",\"as_written\":");
    json::string(out, &s.as_written);
    out.push('}');
}

/// `lighting_read`: `{"lighting": [...], "beacon"?: [...]}` to
/// `{"systems": [...], "notes": [{"words", "as_written"}],
/// "standard_keying"}`.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    if name != "lighting_read" {
        return Err(format!("{name}: not a rule of lighting_read"));
    }
    let list = |key: &str| -> Vec<&str> { v.get(key).and_then(Value::as_array).unwrap_or(&[]).iter().filter_map(Value::as_str).collect() };
    if v.get("lighting").and_then(Value::as_array).is_none() {
        return Err("lighting_read: \"lighting\" is missing".to_owned());
    }
    let r = read(&list("lighting"), &list("beacon"));
    let mut out = String::from("{\"systems\":[");
    for (k, s) in r.systems.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        system_json(&mut out, s);
    }
    out.push_str("],\"notes\":[");
    for (k, (words, as_written)) in r.notes.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        out.push_str("{\"words\":");
        json::string(&mut out, words);
        out.push_str(",\"as_written\":");
        json::string(&mut out, as_written);
        out.push('}');
    }
    out.push_str(&format!("],\"standard_keying\":{}}}", r.standard_keying));
    Ok(out)
}
