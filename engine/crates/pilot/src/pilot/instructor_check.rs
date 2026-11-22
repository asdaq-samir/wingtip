//! Whether the instructor who signs an endorsement is a flight instructor
//! the FAA's airmen registry knows (the deep security review of
//! 2026-11-21, N1): until this, any account that typed a certificate
//! number could sign, so a student with a second account could endorse
//! themselves.
//!
//! An endorsement is given by an authorized instructor, "a person who
//! holds a flight instructor certificate issued under part 61 ... and is
//! in compliance with § 61.197" (14 CFR 61.1), who signs "the logbook of
//! each person to whom that instructor has given flight training"
//! (61.189(a)) with the signature line AC 61-65K asks of every
//! endorsement (signature, date, certificate number, recent experience or
//! expiration date). Here that instructor is looked for in the FAA's
//! Airmen Certification Releasable Database (registry.faa.gov,
//! CSmmyyyy.zip, PILOT_BASIC.csv and PILOT_CERT.csv; layout "Airman
//! Directory Releasable File, Comma Delimited", January 2020): a record
//! of certificate type F (flight instructor), active, as only active
//! certificates are in the file.
//!
//! What the file cannot tell, said so rather than guessed: it "does not
//! include airmen certificate number data, nor does it include the records
//! of those airmen who do not want their addresses released" (the FAA's
//! download page, November 2026). So the certificate number the
//! instructor gives is never checked, the match is by name, and a real
//! instructor who withheld their address reads Not verified. Every doubt
//! errs to Not verified, which is a label, never a refusal (the owner's
//! warn-never-limit rule): the endorsement is kept, and does not count
//! as signed (endorsements_in_force).
//!
//! A second account is caught where it signs as the student themselves
//! (the same name, or a name the matched record also fits), as a name no
//! flight instructor holds, or as an instructor whose record another
//! Wingtip account already signs as (`bound_elsewhere`, the gateway's
//! records). A real instructor's name taken by someone they never were
//! is not caught by the file alone.

use crate::json;

/// A flight instructor's record of the releasable file, as the planner
/// reads it (wingtip.airmen): its unique id, the two name fields as the
/// FAA writes them and the certificate's expiry (YYYY-MM-DD), given only
/// for a certificate issued before 1 Dec 2024 (14 CFR 61.19(d)).
pub struct Record<'a> {
    pub id: &'a str,
    pub first_middle: &'a str,
    pub last_suffix: &'a str,
    pub expires: Option<&'a str>,
}

/// The verdict: verified or not, the record matched, why, and the words.
pub struct Verdict {
    pub verified: bool,
    pub registry_id: Option<String>,
    pub reason: &'static str,
    pub words: String,
}

/// A name's suffixes, which the FAA writes after the last name
/// ("SMITH JR") and a pilot may or may not.
const SUFFIXES: [&str; 6] = ["JR", "SR", "II", "III", "IV", "V"];

/// A name's words, upper case, letters and digits only, suffixes dropped.
fn words(name: &str) -> Vec<String> {
    name.split(|c: char| c.is_whitespace() || c == ',' || c == '.' || c == '-')
        .map(|w| w.chars().filter(char::is_ascii_alphanumeric).collect::<String>().to_ascii_uppercase())
        .filter(|w| !w.is_empty() && !SUFFIXES.contains(&w.as_str()))
        .collect()
}

/// Whether `name` is the record's: the first name the same, the last
/// name (every word of it) the same, and any middle word given the
/// record's middle name or its initial, in order.
pub fn fits(name: &str, r: &Record) -> bool {
    let (given, first, last) = (words(name), words(r.first_middle), words(r.last_suffix));
    if first.is_empty() || last.is_empty() || given.len() <= last.len() || given[0] != first[0] {
        return false;
    }
    if given[given.len() - last.len()..] != last[..] {
        return false;
    }
    let middle = &given[1..given.len() - last.len()];
    middle.len() <= first.len() - 1 && middle.iter().zip(&first[1..]).all(|(m, f)| f.starts_with(m.as_str()))
}

/// The verdict on `instructor` signing for `student` on `signed_on`
/// (YYYY-MM-DD), from the releasable file's flight instructors of that
/// last name (`registry`, None where the file is not loaded) and the
/// records other Wingtip accounts sign as.
pub fn verify(instructor: &str, student: &str, signed_on: &str, registry: Option<&[Record]>, bound_elsewhere: &[&str]) -> Verdict {
    let no = |reason, words: String| Verdict { verified: false, registry_id: None, reason, words };
    if !words(instructor).is_empty() && words(instructor) == words(student) {
        return no("same_person", "Not verified: an instructor signs another person's logbook (14 CFR 61.189(a)), never their own.".into());
    }
    let Some(registry) = registry else {
        return no("registry_unavailable", "Not verified: the FAA airmen registry could not be read.".into());
    };
    let matched: Vec<&Record> = registry.iter().filter(|r| fits(instructor, r)).collect();
    let r = match matched.as_slice() {
        [] => {
            return no(
                "no_match",
                "Not verified: no flight instructor of this name is in the FAA's releasable airmen file (an airman who withheld their address is not in it).".into(),
            )
        }
        [one] => *one,
        _ => return no("ambiguous", "Not verified: more than one flight instructor of this name is in the FAA's releasable airmen file.".into()),
    };
    let id = Some(r.id.to_owned());
    let refused = |reason, words: String| Verdict { verified: false, registry_id: id.clone(), reason, words };
    if fits(student, r) {
        return refused(
            "same_person",
            "Not verified: the student's own name fits this flight instructor's record (14 CFR 61.189(a)).".into(),
        );
    }
    if bound_elsewhere.contains(&r.id) {
        return refused("claimed", "Not verified: another Wingtip account already signs as this flight instructor.".into());
    }
    // A certificate issued before 1 Dec 2024 expires (14 CFR 61.19(d)(2));
    // once expired its privileges wait for reinstatement (61.197(e)).
    // Compared as YYYY-MM-DD text; the day itself is still within it.
    if let Some(expires) = r.expires.filter(|e| !e.is_empty() && *e < signed_on) {
        return refused(
            "expired",
            format!("Not verified: the FAA's file gives this flight instructor certificate as expired on {expires} (14 CFR 61.19(d)(2))."),
        );
    }
    Verdict {
        verified: true,
        registry_id: id,
        reason: "verified",
        words: "Verified: a flight instructor certificate of this name is in the FAA airmen registry.".into(),
    }
}

/// The verdict as the contract's answer.
pub fn to_json(v: &Verdict) -> String {
    let mut out = String::from("{\"verified\":");
    out.push_str(if v.verified { "true" } else { "false" });
    out.push_str(",\"registry_id\":");
    json::opt_string(&mut out, v.registry_id.as_deref());
    out.push_str(",\"reason\":");
    json::string(&mut out, v.reason);
    out.push_str(",\"words\":");
    json::string(&mut out, &v.words);
    out.push('}');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const JONES: Record = Record { id: "A1234567", first_middle: "JOHN JAMES", last_suffix: "JONES JR", expires: None };
    const OLD: Record = Record { id: "A7654321", first_middle: "MARY", last_suffix: "OAK", expires: Some("2026-11-20") };

    #[test]
    fn a_name_fits_with_its_middle_initial_suffix_and_case_aside() {
        assert!(fits("John Jones", &JONES));
        assert!(fits("john j. jones", &JONES));
        assert!(fits("John James Jones Jr.", &JONES));
        assert!(!fits("John K Jones", &JONES));
        assert!(!fits("Jon Jones", &JONES));
        assert!(!fits("Jones", &JONES));
    }

    #[test]
    fn one_record_of_the_name_is_verified() {
        let v = verify("John J. Jones", "Avery Pilot", "2026-11-21", Some(&[JONES][..]), &[]);
        assert!(v.verified);
        assert_eq!(v.registry_id.as_deref(), Some("A1234567"));
    }

    #[test]
    fn the_student_signing_as_themselves_is_not_verified() {
        // A second account under the student's own name.
        assert_eq!(verify("Avery Pilot", "avery pilot", "2026-11-21", Some(&[JONES][..]), &[]).reason, "same_person");
        // The student is the instructor the record names.
        assert_eq!(verify("John Jones", "John J Jones", "2026-11-21", Some(&[JONES][..]), &[]).reason, "same_person");
    }

    #[test]
    fn a_name_no_instructor_holds_or_two_hold_is_not_verified() {
        assert_eq!(verify("Made Up", "Avery Pilot", "2026-11-21", Some(&[JONES][..]), &[]).reason, "no_match");
        let twin = Record { id: "C0000001", ..JONES };
        assert_eq!(verify("John Jones", "Avery Pilot", "2026-11-21", Some(&[JONES, twin][..]), &[]).reason, "ambiguous");
        assert_eq!(verify("John Jones", "Avery Pilot", "2026-11-21", None, &[]).reason, "registry_unavailable");
    }

    #[test]
    fn a_record_another_account_signs_as_is_not_verified() {
        assert_eq!(verify("John Jones", "Avery Pilot", "2026-11-21", Some(&[JONES][..]), &["A1234567"]).reason, "claimed");
    }

    #[test]
    fn an_expired_certificate_is_verified_on_its_last_day_and_not_after() {
        assert!(verify("Mary Oak", "Avery Pilot", "2026-11-20", Some(&[OLD][..]), &[]).verified);
        assert_eq!(verify("Mary Oak", "Avery Pilot", "2026-11-21", Some(&[OLD][..]), &[]).reason, "expired");
    }
}
