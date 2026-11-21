//! The citations' cases (cite.rs).

use super::*;

fn cited(text: &str) -> Vec<(String, Option<String>)> {
    citations(text)
        .into_iter()
        .filter_map(|p| p.cite.map(|c| (p.text.to_owned(), Some(format!("{}@{}", c.doc, c.at.unwrap_or_default())))))
        .collect()
}

#[test]
fn the_pieces_are_the_text() {
    let text = "VFR needs 14 CFR 91.155's visibility; a briefer's (AIM 7-1-5) words, 121.5 and 61.5 hours.";
    assert_eq!(citations(text).iter().map(|p| p.text).collect::<String>(), text);
}

#[test]
fn a_title_then_its_list_each_a_link() {
    let got = cited("14 CFR 91.133, 91.137, 91.141");
    assert_eq!(got.len(), 3);
    assert_eq!(got[0], ("14 CFR 91.133".into(), Some("cfr-14-91@91.133".into())));
    assert_eq!(got[2], ("91.141".into(), Some("cfr-14-91@91.141".into())));
}

#[test]
fn a_paragraph_rides_with_its_section() {
    let pieces = citations("14 CFR 91.211(a)(1) asks it");
    let c = pieces[0].cite.clone().unwrap();
    assert_eq!(pieces[0].text, "14 CFR 91.211(a)(1)");
    assert_eq!((c.at.as_deref(), c.paragraph.as_deref()), (Some("91.211"), Some("(a)(1)")));
}

#[test]
fn a_bare_figure_is_not_a_section() {
    assert!(cited("Call 121.5 or squawk 7700; 61.5 hours logged").is_empty());
    // ... unless a paragraph follows, or a title came before.
    assert_eq!(cited("the flight review (61.56(c))")[0].1, Some("cfr-14-61@61.56".into()));
    assert_eq!(cited("by day (14 CFR 91.151); under IFR (91.167)")[1].1, Some("cfr-14-91@91.167".into()));
    // A frequency after a title is still a frequency.
    assert_eq!(cited("14 CFR 91.205; then 121.5").len(), 1);
}

#[test]
fn the_aim_circulars_parts_and_49_cfr() {
    assert_eq!(cited("AIM 7-1-5 and 7-1-6").len(), 2);
    assert_eq!(cited("AC 61-65K's endorsement")[0], ("AC 61-65K".into(), Some("ac-61-65@".into())));
    assert_eq!(cited("under Part 135")[0].1, Some("cfr-14-135@".into()));
    assert_eq!(cited("49 CFR 830.5")[0].1, Some("cfr-49-830@830.5".into()));
    assert_eq!(cited("§ 91.103 says")[0].1, Some("cfr-14-91@91.103".into()));
    assert!(cited("AIMING at AC power").is_empty());
}

/// Every entry rule's cite (wingtip-airspace's rules) reads as at least
/// one link, so none of the engine's own cites is left as words.
#[test]
fn every_entry_rules_cite_is_a_link() {
    for class in ['B', 'C', 'D'] {
        for (rule, cite) in crate::rules::entry_rules(class) {
            assert!(citations(cite).iter().any(|p| p.cite.is_some()), "{rule}: {cite}");
        }
    }
}
