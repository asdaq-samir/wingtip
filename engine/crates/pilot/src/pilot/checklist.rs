//! An airplane's checklist as the pilot writes it, in plain text: a line
//! starting "#" a section, every other line an item, its challenge and its
//! response split by a dash or a run of dots, as a printed checklist sets
//! them ("Fuel selector -- Both", "Mixture ..... Rich"). What the editor
//! shows and what each app keeps on the device (#220). An item before
//! any section is in "Checklist". Its limits, which the gateway's stored
//! copy had: 40 characters a section's title, 80 a challenge or a
//! response, counted in UTF-16 code units as Java counted them. The app writes none of its own:
//! the flight manual's is the airplane's.
//!
//! The web app's lib/checklist, moved here whole.

use super::js;
use crate::json;

/// The headings a list can start from, with nothing under them: the order
/// of a pilot's operating handbook's Normal Procedures (GAMA Specification
/// No. 1, Section 4), each phase a checklist is run at, as the FAA's
/// Airplane Flying Handbook (FAA-H-8083-3C, chapter 2) has a pilot fly by
/// checklist from preflight to securing. The items are the pilot's, from
/// their own airplane's handbook. The web's lib/checklists, the iPhone's
/// Checklists.swift and Android's Checklists.kt each kept a copy (#482).
pub const NORMAL_PHASES: [&str; 13] = [
    "Preflight inspection", "Before starting engine", "Starting engine", "Before takeoff", "Takeoff", "Climb", "Cruise", "Descent",
    "Before landing", "Landing", "After landing", "Shutdown", "Securing the airplane",
];

/// The emergencies a handbook's Emergency Procedures cover (GAMA
/// Specification No. 1, Section 3), in its order.
pub const EMERGENCY_PHASES: [&str; 12] = [
    "Engine failure on the takeoff roll", "Engine failure right after takeoff", "Engine failure in flight",
    "Emergency landing without engine power", "Precautionary landing with engine power", "Ditching", "Engine fire during start",
    "Engine fire in flight", "Electrical fire in flight", "Cabin fire", "Electrical power failure", "Inadvertent icing",
];

pub struct Item {
    pub challenge: String,
    pub response: Option<String>,
}

pub struct Section {
    pub title: String,
    pub items: Vec<Item>,
}

/// Where a challenge ends and its response begins, at `q`: the end of the
/// split there, as /\s+(?:-{1,2}|–|—|\.{2,})\s+|\s*\.{3,}\s*|\t+/ matches
/// -- a dash, two, an en or em dash or a run of dots with space either
/// side; three dots or more, spaced or not; or tabs.
fn split_at(c: &[char], q: usize) -> Option<usize> {
    let run = |from: usize, f: &dyn Fn(char) -> bool| c[from.min(c.len())..].iter().take_while(|&&x| f(x)).count();
    let spaces = |from: usize| run(from, &|x| js::is_space(x));
    // A mark between spaces: no shorter run of spaces or of marks leaves
    // a mark where a space must be, so only the longest can match.
    let lead = spaces(q);
    if lead > 0 {
        let p = q + lead;
        let mark = match c.get(p) {
            Some('-') => {
                let dashes = run(p, &|x| x == '-');
                (dashes <= 2).then_some(dashes)
            }
            Some('–' | '—') => Some(1),
            Some('.') => {
                let dots = run(p, &|x| x == '.');
                (dots >= 2).then_some(dots)
            }
            _ => None,
        };
        if let Some(m) = mark {
            let trail = spaces(p + m);
            if trail > 0 {
                return Some(p + m + trail);
            }
        }
    }
    // Three dots or more, with any space either side.
    let dots = run(q + lead, &|x| x == '.');
    if dots >= 3 {
        let end = q + lead + dots;
        return Some(end + spaces(end));
    }
    let tabs = run(q, &|x| x == '\t');
    (tabs > 0).then_some(q + tabs)
}

/// String.prototype.split by that pattern.
fn split(line: &str) -> Vec<String> {
    let c: Vec<char> = line.chars().collect();
    let mut parts = Vec::new();
    let (mut p, mut q) = (0, 0);
    while q < c.len() {
        match split_at(&c, q) {
            Some(e) => {
                parts.push(c[p..q].iter().collect());
                p = e;
                q = p;
            }
            None => q += 1,
        }
    }
    parts.push(c[p..].iter().collect());
    parts
}

/// The checklist in the text.
pub fn read(text: &str) -> Vec<Section> {
    let mut sections: Vec<Section> = Vec::new();
    // Lines end at "\n" or "\r\n" (/\r?\n/); a lone "\r" is in the line.
    for raw in text.split('\n') {
        let line = js::trim(raw.strip_suffix('\r').unwrap_or(raw));
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix('#') {
            let title = js::slice_units(rest.trim_start_matches('#').trim_start_matches(js::is_space), 40);
            sections.push(Section { title: if title.is_empty() { "Checklist".to_owned() } else { title.to_owned() }, items: Vec::new() });
            continue;
        }
        if sections.is_empty() {
            sections.push(Section { title: "Checklist".to_owned(), items: Vec::new() });
        }
        let parts = split(line);
        let response = parts[1..].join(" ");
        let response = js::trim(&response);
        let item = Item {
            challenge: js::slice_units(js::trim(&parts[0]), 80).to_owned(),
            response: (!response.is_empty()).then(|| js::slice_units(response, 80).to_owned()),
        };
        if let Some(last) = sections.last_mut() {
            last.items.push(item);
        }
    }
    sections.retain(|s| !s.items.is_empty());
    sections
}

/// The checklist as JSON, `{"sections": [{"title", "items":
/// [{"challenge", "response"}]}]}`, a response null where there is none.
pub fn to_json(sections: &[Section]) -> String {
    let mut out = String::from("{\"sections\":[");
    for (i, s) in sections.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"title\":");
        json::string(&mut out, &s.title);
        out.push_str(",\"items\":[");
        for (j, item) in s.items.iter().enumerate() {
            if j > 0 {
                out.push(',');
            }
            out.push_str("{\"challenge\":");
            json::string(&mut out, &item.challenge);
            out.push_str(",\"response\":");
            json::opt_string(&mut out, item.response.as_deref());
            out.push('}');
        }
        out.push_str("]}");
    }
    out.push_str("]}");
    out
}

/// The checklist written back as text: each section its "# title" line
/// and its items, "challenge -- response", a blank line between sections.
pub fn write(sections: &[Section]) -> String {
    sections
        .iter()
        .map(|s| {
            let mut lines = vec![format!("# {}", s.title)];
            lines.extend(s.items.iter().map(|i| match i.response.as_deref() {
                Some(r) if !r.is_empty() => format!("{} -- {r}", i.challenge),
                _ => i.challenge.clone(),
            }));
            lines.join("\n")
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}
/// Words that say nothing of which emergency a heading is.
const FILLER: [&str; 9] = ["in", "the", "on", "a", "an", "of", "with", "without", "after"];

/// The words of a heading as compared: lowercase, the filler left out,
/// each cut to its first four letters so "failure" meets "fail" and
/// "fires" "fire".
fn keys(title: &str) -> Vec<String> {
    title
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty() && !FILLER.contains(w))
        .map(|w| w.chars().take(4).collect::<String>())
        .collect()
}

/// Which of a checklist's section `titles` is the one for `want` (one of
/// EMERGENCY_PHASES, say, "Engine failure in flight"), as the pilot may
/// have written it ("ENGINE FAILURE DURING FLIGHT", "Engine fail -
/// in flight"): one with the phase's first two words, what the emergency
/// is ("engine failure", not "engine fire"), and of those the one sharing
/// the most of the rest, the first of equals; None where none has them. A
/// heading is the pilot's own, from their airplane's handbook, so it is
/// matched, not required.
pub fn section_for(titles: &[String], want: &str) -> Option<usize> {
    let wanted = keys(want);
    let head = &wanted[..wanted.len().min(2)];
    if head.is_empty() {
        return None;
    }
    let mut best: Option<(usize, usize)> = None;
    for (index, title) in titles.iter().enumerate() {
        let have = keys(title);
        if !head.iter().all(|w| have.contains(w)) {
            continue;
        }
        let shared = wanted.iter().filter(|w| have.contains(w)).count();
        if best.is_none_or(|(_, b)| shared > b) {
            best = Some((index, shared));
        }
    }
    best.map(|(index, _)| index)
}
