//! The endorsements a student meets on the way to a private pilot
//! certificate, in the order they meet them: AC 61-65K's sample for each
//! (its appendix A, November 2025), word for word, with the 14 CFR section
//! it answers. The one list of them -- the Checkride page lists them, a
//! student records the ones signed on paper, an instructor signs them in
//! the app from these words. It was the gateway's EndorsementKind (#482
//! phase 0); the gateway now asks for it through the planner
//! (GET /api/pilot/endorsement-kinds, POST /api/pilot/endorsement-fill),
//! and the apps get it from the gateway as before.
//!
//! A template names the student {student} and each blank the sample
//! leaves ("[M/M]", "[airport name]") by its field's key; `fill` fills
//! them in with endorsements::render. How long each is good for is
//! records.rs's (RUNS_OUT).

use super::endorsements::render;
use super::js;
use crate::json::{self, Value};

/// A blank in a sample, as the instructor's sheet asks for it: its key in
/// the template, its label, an example, and whether it must be filled.
pub struct Field {
    pub key: &'static str,
    pub label: &'static str,
    pub example: &'static str,
    pub required: bool,
}

const MM: Field = Field { key: "mm", label: "Make and model", example: "Cessna 172", required: true };
const CATEGORY: Field = Field { key: "category", label: "Aircraft category", example: "airplane", required: true };
const AIRPORT: Field = Field { key: "airport", label: "Airport", example: "Waukegan National (KUGN)", required: true };
const AIRPORTS: Field = Field { key: "airports", label: "Both airports", example: "KUGN and KENW", required: true };
const CLASS_B: Field = Field { key: "classB", label: "Class B airspace", example: "Chicago", required: true };
const TEST: Field = Field { key: "test", label: "Knowledge test", example: "Private Pilot Airplane", required: true };
const CERTIFICATE: Field = Field { key: "certificate", label: "Certificate", example: "a private pilot", required: true };
const PRACTICAL: Field =
    Field { key: "practical", label: "Practical test", example: "Private Pilot Airplane Single-Engine Land", required: true };
const FROM: Field = Field { key: "from", label: "From", example: "KUGN", required: true };
const TO: Field = Field { key: "to", label: "To", example: "KUGN", required: true };
const VIA: Field = Field { key: "via", label: "Via", example: "KRFD, KJVL", required: true };
const LANDINGS: Field = Field { key: "landings", label: "Landings at", example: "KRFD, KJVL and KUGN", required: true };
const DATE: Field = Field { key: "date", label: "Date of the flight", example: "10-14-2026", required: true };
// "[List any applicable conditions or limitations.]": nothing where there
// are none, except where the sample's own words lead into them ("subject
// to the following conditions:"), where they must be given.
const CONDITIONS: Field =
    Field { key: "conditions", label: "Conditions or limitations", example: "Winds 10 knots or less", required: false };
const CONDITIONS_LISTED: Field = Field { key: "conditions", label: "Conditions", example: "Winds 10 knots or less", required: true };

/// One of the endorsements: its code (the gateway's records keep it), AC
/// 61-65K's paragraph ("A.10"), the 14 CFR section it answers, its name,
/// the sample's words and its blanks.
pub struct Kind {
    pub code: &'static str,
    pub paragraph: &'static str,
    pub rule: &'static str,
    pub label: &'static str,
    pub template: &'static str,
    pub fields: &'static [Field],
}

/// AC 61-65K appendix A's samples, in the order a student meets them.
pub const KINDS: [Kind; 15] = [
    Kind {
        code: "pre-solo-knowledge",
        paragraph: "A.3",
        rule: "61.87(b)",
        label: "Pre-solo aeronautical knowledge",
        template: "I certify that {student} has satisfactorily completed the pre-solo knowledge test of 14 CFR § 61.87(b) for the {mm} aircraft.",
        fields: &[MM],
    },
    Kind {
        code: "pre-solo-flight",
        paragraph: "A.4",
        rule: "61.87(c)(1) and (2)",
        label: "Pre-solo flight training",
        template: "I certify that {student} has received and logged pre-solo flight training for the maneuvers and procedures that are appropriate to the {mm} aircraft. I have determined they have demonstrated satisfactory proficiency and safety on the maneuvers and procedures required by 14 CFR § 61.87 in this or similar make and model of aircraft to be flown.",
        fields: &[MM],
    },
    // 61.87(n): "an endorsement ... by an authorized instructor who gave
    // the training within the 90 days preceding the date of the flight".
    Kind {
        code: "solo-first",
        paragraph: "A.6",
        rule: "61.87(n)",
        label: "Solo flight (first 90 days)",
        template: "I certify that {student} has received the required training to qualify for solo flying. I have determined they meet the applicable requirements of 14 CFR § 61.87(n) and are proficient to make solo flights in {mm}.",
        fields: &[MM],
    },
    // 61.87(p)(4): current "provided an authorized instructor updates the
    // student's logbook every 90 days thereafter". The code a student's own
    // record of either has kept since the gateway's V13.
    Kind {
        code: "solo-90",
        paragraph: "A.7",
        rule: "61.87(p)",
        label: "Solo flight (each further 90 days)",
        template: "I certify that {student} has received the required training to qualify for solo flying. I have determined that they meet the applicable requirements of 14 CFR § 61.87(p) and are proficient to make solo flights in {mm}.",
        fields: &[MM],
    },
    // 61.87(o)(3): from an instructor who gave the night training "within
    // the 90-day period preceding the date of the flight".
    Kind {
        code: "solo-night",
        paragraph: "A.5",
        rule: "61.87(o)",
        label: "Solo flight at night",
        template: "I certify that {student} has received flight training at night on night flying procedures that include takeoffs, approaches, landings, and go-arounds at night at the {airport} airport where the solo flight will be conducted; navigation training at night in the vicinity of the {airport} airport where the solo flight will be conducted. This endorsement expires 90 calendar days from the date the flight training at night was received.",
        fields: &[AIRPORT],
    },
    Kind {
        code: "solo-25nm",
        paragraph: "A.8",
        rule: "61.93(b)(1)",
        label: "Solo takeoffs and landings at another airport within 25 nm",
        template: "I certify that {student} has received the required training of 14 CFR § 61.93(b)(1). I have determined that they are proficient to practice solo takeoffs and landings at {airport}. The takeoffs and landings at {airport} are subject to the following conditions: {conditions}",
        fields: &[AIRPORT, CONDITIONS_LISTED],
    },
    Kind {
        code: "solo-xc-training",
        paragraph: "A.9",
        rule: "61.93(c)(1) and (2)",
        label: "Solo cross-country training",
        template: "I certify that {student} has received the required solo cross-country training. I find they have met the applicable requirements of 14 CFR § 61.93 and are proficient to make solo cross-country flights in a {mm} aircraft, {category}.",
        fields: &[MM, CATEGORY],
    },
    // 61.93(c)(3): one for each solo cross-country, from the instructor who
    // reviewed its planning (61.93(d)). The AC's sample reads "from
    // [origination airport] to [origination airport]", a flight that comes
    // back; {to} is the last airport, the same one for such a flight.
    Kind {
        code: "solo-xc-flight",
        paragraph: "A.10",
        rule: "61.93(c)(3)",
        label: "A solo cross-country's planning",
        template: "I have reviewed the cross-country planning of {student}. I find the planning and preparation to be correct to make the solo flight from {from} to {to} via {via} with landings at {landings} in a {mm} aircraft on {date}. {conditions}",
        fields: &[FROM, TO, VIA, LANDINGS, MM, DATE, CONDITIONS],
    },
    Kind {
        code: "solo-xc-50nm",
        paragraph: "A.11",
        rule: "61.93(b)(2)",
        label: "Repeated solo cross-country within 50 nm",
        template: "I certify that {student} has received the required training in both directions between and at both {airports}. I have determined that they are proficient of 14 CFR § 61.93(b)(2) to conduct repeated solo cross-country flights over that route, subject to the following conditions: {conditions}",
        fields: &[AIRPORTS, CONDITIONS_LISTED],
    },
    // 61.95(a)(2) and (b)(2): "dated within the 90-day period preceding the
    // date of the flight".
    Kind {
        code: "class-b",
        paragraph: "A.12",
        rule: "61.95(a)",
        label: "Solo flight in Class B airspace",
        template: "I certify that {student} has received the required training of 14 CFR § 61.95(a). I have determined they are proficient to conduct solo flights in {classB} airspace. {conditions}",
        fields: &[CLASS_B, CONDITIONS],
    },
    Kind {
        code: "class-b-airport",
        paragraph: "A.13",
        rule: "61.95(b) and 91.131(b)(1)",
        label: "Solo at an airport in Class B airspace",
        template: "I certify that {student} has received the required training of 14 CFR § 61.95(b)(1). I have determined that they are proficient to conduct solo flight operations at {airport}. {conditions}",
        fields: &[AIRPORT, CONDITIONS],
    },
    Kind {
        code: "knowledge-test",
        paragraph: "A.36",
        rule: "61.35(a)(1), 61.103(d) and 61.105",
        label: "Aeronautical knowledge test",
        template: "I certify that {student} has received the required training in accordance with 14 CFR § 61.105. I have determined they are prepared for the {test} knowledge test.",
        fields: &[TEST],
    },
    Kind {
        code: "knowledge-test-review",
        paragraph: "A.2",
        rule: "61.39(a)(6)(iii)",
        label: "Review of the knowledge test's deficient areas",
        template: "I certify that {student} has demonstrated satisfactory knowledge of the subject areas in which they were deficient on the {test} airman knowledge test.",
        fields: &[TEST],
    },
    Kind {
        code: "practical-test-prereq",
        paragraph: "A.1",
        rule: "61.39(a)(6)(i) and (ii)",
        label: "Prerequisites for the practical test",
        template: "I certify that {student} has received and logged training time within 2 calendar months preceding the month of application in preparation for the practical test and they are prepared for the required practical test for the issuance of {certificate} certificate.",
        fields: &[CERTIFICATE],
    },
    // A.37 is "required in addition to the 14 CFR § 61.39 endorsements"
    // (A.1, A.2). The code a student's own record of it has kept since V13.
    Kind {
        code: "practical-test",
        paragraph: "A.37",
        rule: "61.103(f), 61.107(b) and 61.109",
        label: "Flight proficiency and practical test",
        template: "I certify that {student} has received the required training in accordance with 14 CFR §§ 61.107 and 61.109. I have determined they are prepared for the {practical} practical test.",
        fields: &[PRACTICAL],
    },
];

/// The endorsement of `code`, None for no such one.
pub fn kind(code: &str) -> Option<&'static Kind> {
    KINDS.iter().find(|k| k.code == code)
}

/// Text as it is signed: every run of space one space, none at the ends.
fn tidy(text: &str) -> String {
    text.split(js::is_space).filter(|w| !w.is_empty()).collect::<Vec<_>>().join(" ")
}

/// What an instructor's sheet gives for `kind`, made ready to sign: each
/// field the endorsement takes, tidied ("" where not given), in its own
/// order, any it does not take left out; the labels of the required ones
/// still empty; and the words with the student and the fields in.
pub fn fill(
    kind: &Kind, student: &str, given: &dyn Fn(&str) -> Option<String>,
) -> (Vec<(&'static str, String)>, Vec<&'static str>, String) {
    let mut fields: Vec<(&'static str, String)> = Vec::new();
    for f in kind.fields {
        if !fields.iter().any(|(k, _)| *k == f.key) {
            fields.push((f.key, tidy(&given(f.key).unwrap_or_default())));
        }
    }
    let value = |key: &str| fields.iter().find(|(k, _)| *k == key).map(|(_, v)| v.clone());
    let missing = kind.fields.iter().filter(|f| f.required && value(f.key).is_none_or(|v| v.is_empty())).map(|f| f.label).collect();
    let text = render(kind.template, student, &value);
    (fields, missing, text)
}

/// 14 CFR 61.93(d)(1)-(3): what the instructor must determine of a solo
/// cross-country themselves before endorsing it (A.10); (4) and (5), the
/// student's endorsements, the record answers (records.rs's checks).
pub const DETERMINATIONS: [(&str, &str); 3] = [
    ("61.93(d)(1)", "The student's cross-country planning is correct for the flight"),
    ("61.93(d)(2)", "The current and forecast weather allow it to be completed under VFR"),
    ("61.93(d)(3)", "The student is proficient to conduct it safely"),
];

fn kind_json(out: &mut String, k: &Kind) {
    out.push_str("{\"code\":");
    json::string(out, k.code);
    out.push_str(",\"paragraph\":");
    json::string(out, k.paragraph);
    out.push_str(",\"rule\":");
    json::string(out, k.rule);
    out.push_str(",\"label\":");
    json::string(out, k.label);
    out.push_str(",\"template\":");
    json::string(out, k.template);
    out.push_str(",\"fields\":[");
    for (i, f) in k.fields.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"key\":");
        json::string(out, f.key);
        out.push_str(",\"label\":");
        json::string(out, f.label);
        out.push_str(",\"example\":");
        json::string(out, f.example);
        out.push_str(if f.required { ",\"required\":true}" } else { ",\"required\":false}" });
    }
    out.push_str("]}");
}

/// The rule `name` worked on `v`.
#[cfg_attr(target_arch = "wasm32", inline(always))]
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        // `{}`: `[{"code", "paragraph", "rule", "label", "template", "fields": [{"key", "label", "example", "required"}]}]`,
        // the gateway's EndorsementKindDto list.
        "endorsement_kinds" => {
            let mut out = String::from("[");
            for (i, k) in KINDS.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                kind_json(&mut out, k);
            }
            out.push(']');
            Ok(out)
        }
        // `{"code", "student"?, "fields"?: {key: text}}`: `{"fields": {key:
        // text}, "missing": [label], "text"}`, or null for no such code.
        "endorsement_fill" => {
            let code = v.get("code").and_then(Value::as_str).ok_or_else(|| format!("{name}: \"code\" is not a string"))?;
            let student = match v.get("student") {
                None | Some(Value::Null) => "",
                Some(Value::String(s)) => s,
                Some(_) => return Err(format!("{name}: \"student\" is not a string")),
            };
            let given = match v.get("fields") {
                None | Some(Value::Null) => None,
                Some(f @ Value::Object(_)) => Some(f),
                Some(_) => return Err(format!("{name}: \"fields\" is not an object of names to words")),
            };
            let Some(k) = kind(code) else { return Ok("null".to_owned()) };
            let (fields, missing, text) =
                fill(k, student, &|key| given.and_then(|g| g.get(key)).and_then(Value::as_str).map(str::to_owned));
            let mut out = String::from("{\"fields\":{");
            for (i, (key, value)) in fields.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::string(&mut out, key);
                out.push(':');
                json::string(&mut out, value);
            }
            out.push_str("},\"missing\":[");
            for (i, m) in missing.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::string(&mut out, m);
            }
            out.push_str("],\"text\":");
            json::string(&mut out, &text);
            out.push('}');
            Ok(out)
        }
        // `{}`: `[{"rule", "label"}]`, 61.93(d)(1)-(3).
        "solo_xc_determinations" => {
            let mut out = String::from("[");
            for (i, (rule, label)) in DETERMINATIONS.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str("{\"rule\":");
                json::string(&mut out, rule);
                out.push_str(",\"label\":");
                json::string(&mut out, label);
                out.push('}');
            }
            out.push(']');
            Ok(out)
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

#[cfg(test)]
mod tests {
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
            "pre-solo-knowledge", "pre-solo-flight", "solo-90", "solo-night", "solo-xc-training", "solo-xc-flight", "solo-xc-50nm",
            "class-b", "class-b-airport", "knowledge-test", "knowledge-test-review", "practical-test",
        ] {
            assert!(kind(code).is_some(), "{code}");
        }
    }
}
