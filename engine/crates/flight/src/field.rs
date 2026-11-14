//! Whether a field is open: the one rule every list of fields, map mark,
//! search answer and landing candidate is held to (the owner's hard rule,
//! 2026-11-13, decision 0043: a field the FAA lists as closed is never
//! shown or offered as an open one).
//!
//! The FAA's word is NASR's APT_BASE.csv, ARPT_STATUS: "O" operational,
//! "CI" closed indefinitely, "CP" closed permanently (the NASR subscriber
//! files' APT_BASE layout). Only "O" is open. Any other code, a blank one
//! among them, is closed: a field NASR does not say is operational is not
//! offered as one, which errs toward the safe side. A field with no NASR
//! record at all (`None`: the host's own table has it, NASR has no row for
//! it, as in a test's airports file with no FAA file beside it) is not
//! judged here; the host's own source decides, as it did before.

/// NASR's operating status of a field.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    /// ARPT_STATUS "O".
    Open,
    /// ARPT_STATUS "CI".
    ClosedIndefinitely,
    /// ARPT_STATUS "CP".
    ClosedPermanently,
    /// Any other ARPT_STATUS, a blank one too: not said to be operational.
    Closed,
    /// No NASR record to read.
    Unknown,
}

/// The status of a field from NASR's ARPT_STATUS, `None` where NASR has
/// no record of it; the code is read trimmed and in capitals.
pub fn status(code: Option<&str>) -> Status {
    let Some(code) = code else { return Status::Unknown };
    match code.trim().to_ascii_uppercase().as_str() {
        "O" => Status::Open,
        "CI" => Status::ClosedIndefinitely,
        "CP" => Status::ClosedPermanently,
        _ => Status::Closed,
    }
}

/// Whether a field may be shown or offered as an open one: NASR's "O", or
/// no NASR record (the host's own source then decides).
pub fn is_open(code: Option<&str>) -> bool {
    matches!(status(code), Status::Open | Status::Unknown)
}

/// The words a closed field is labelled with wherever it appears at all
/// (a search for its ident, its card), in sentence case as the app sets
/// the FAA's own words; None for an open field.
pub fn closed_words(code: Option<&str>) -> Option<&'static str> {
    match status(code) {
        Status::Open | Status::Unknown => None,
        Status::ClosedIndefinitely => Some("Closed indefinitely"),
        Status::ClosedPermanently => Some("Closed permanently"),
        Status::Closed => Some("Closed"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // NASR APT_BASE's ARPT_STATUS codes, each side of the rule.
    #[test]
    fn only_operational_is_open() {
        assert!(is_open(Some("O")));
        assert!(is_open(Some(" o ")));
        assert!(!is_open(Some("CI")));
        assert!(!is_open(Some("CP")));
        assert!(!is_open(Some("")));
        assert!(!is_open(Some("X")));
    }

    #[test]
    fn closed_fields_are_labelled() {
        assert_eq!(closed_words(Some("O")), None);
        assert_eq!(closed_words(Some("CI")), Some("Closed indefinitely"));
        assert_eq!(closed_words(Some("CP")), Some("Closed permanently"));
        assert_eq!(closed_words(Some("")), Some("Closed"));
    }

    // No NASR record: not judged here, so not hidden and not labelled.
    #[test]
    fn no_record_is_the_hosts_to_decide() {
        assert_eq!(status(None), Status::Unknown);
        assert!(is_open(None));
        assert_eq!(closed_words(None), None);
    }
}
