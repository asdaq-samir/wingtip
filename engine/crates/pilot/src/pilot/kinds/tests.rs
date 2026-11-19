use super::*;

/// Every blank a template leaves is the student or one of its fields,
/// every field is a blank, and the codes are each once (the gateway's
/// EndorsementKindTest, moved here).
#[test]
fn every_blank_is_the_student_or_a_field_and_every_field_a_blank() {
    for k in &KINDS {
        let mut blanks: Vec<String> = Vec::new();
        let mut rest = k.template;
        while let Some(open) = rest.find('{') {
            let close = rest[open..].find('}').unwrap() + open;
            blanks.push(rest[open + 1..close].to_owned());
            rest = &rest[close + 1..];
        }
        crate::sort::StableSort::stable_sort(&mut blanks[..]);
        blanks.dedup();
        let mut fields: Vec<String> = k.fields.iter().map(|f| f.key.to_owned()).chain(["student".to_owned()]).collect();
        crate::sort::StableSort::stable_sort(&mut fields[..]);
        fields.dedup();
        assert_eq!(blanks, fields, "{}", k.code);
    }
    let mut codes: Vec<_> = KINDS.iter().map(|k| k.code).collect();
    crate::sort::StableSort::stable_sort(&mut codes[..]);
    codes.dedup();
    assert_eq!(codes.len(), KINDS.len());
}

/// AC 61-65K A.10 with its blanks filled; no conditions leave nothing.
#[test]
fn a_solo_cross_country_reads_as_the_acs_sample() {
    let given = |k: &str| {
        [
            ("from", "KUGN"),
            ("to", "KUGN"),
            ("via", "KRFD,  KJVL"),
            ("landings", "KRFD, KJVL and KUGN"),
            ("mm", "Cessna 172"),
            ("date", "10-14-2026"),
            ("extra", "x"),
        ]
        .iter()
        .find(|(n, _)| *n == k)
        .map(|(_, v)| (*v).to_owned())
    };
    let (fields, missing, text) = fill(kind("solo-xc-flight").unwrap(), "Avery B. Student", &given);
    assert!(!fields.iter().any(|(k, _)| *k == "extra"));
    assert!(fields.contains(&("conditions", String::new())));
    assert!(fields.contains(&("via", "KRFD, KJVL".to_owned())));
    assert!(missing.is_empty());
    assert_eq!(
        text,
        "I have reviewed the cross-country planning of Avery B. Student. I find the planning and preparation to be correct to make the solo flight from KUGN to KUGN via KRFD, KJVL with landings at KRFD, KJVL and KUGN in a Cessna 172 aircraft on 10-14-2026."
    );
}

#[test]
fn conditions_the_samples_words_lead_into_must_be_given() {
    let airport = |k: &str| (k == "airport").then(|| "KENW".to_owned());
    assert_eq!(fill(kind("solo-25nm").unwrap(), "A", &airport).1, vec!["Conditions"]);
    let class_b = |k: &str| (k == "classB").then(|| "Chicago".to_owned());
    assert!(fill(kind("class-b").unwrap(), "A", &class_b).1.is_empty());
}

#[test]
fn the_codes_a_students_own_record_kept_since_v13_are_still_here() {
    for code in [
        "pre-solo-knowledge", "pre-solo-flight", "solo-90", "solo-night", "solo-xc-training", "solo-xc-flight", "solo-xc-50nm", "class-b",
        "class-b-airport", "knowledge-test", "knowledge-test-review", "practical-test",
    ] {
        assert!(kind(code).is_some(), "{code}");
    }
}
