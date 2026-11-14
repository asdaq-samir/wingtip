//! Who may use a field, and how far its data is to be trusted, in the
//! words every app shows: one copy, so the web, the iPhone and Android
//! say the same line on the airport card, in search and in the Brief.
//!
//! - The use, from NASR's APT_BASE.csv as the planner and the phone packs
//!   read it: FACILITY_USE_CODE PR is private (non-public use: the
//!   sectional's circled R, FAA Aeronautical Chart User's Guide, VFR Terms
//!   and Symbols, Airports), and a field the armed services own
//!   (OWNERSHIP_TYPE_CODE MA, MN, MR or CG) is "military" where it is not
//!   open to the public and "joint" where it is (FACILITY_USE_CODE PU, a
//!   civil airport on a military one, such as Sierra Vista Municipal-Libby
//!   AAF, where a civil pilot lands as at any public field). A private
//!   field is landed at with its owner's permission, a military one with
//!   the service's prior permission (PPR); in an emergency the pilot in
//!   command may deviate from any rule of part 91 to meet it (14 CFR
//!   91.3(b)), so the emergency list words them its own way (fields).
//! - Its data: NASR's INSPECT_METHOD_CODE 2 is the 5010-2 private-use
//!   mailout and 1 the 5010-1 mailout, the figures as the owner sent them
//!   and never inspected; F, S and C are an inspection by the FAA, a state
//!   or a contractor. The planner passes "owner-reported" or "inspected"
//!   and the date of the last response or inspection.
//! - NOTAMs: NASR's NOTAM_ID is empty for a private-use field, which is
//!   outside the NOTAM system, so "none heard" would suggest a check that
//!   cannot be made. (FAA JO 7930.2 could not be read to quote, faa.gov
//!   refusing automated reads on 2026-11-13, so the plainer words the
//!   owner chose are used: no NOTAMs are issued for it.)

use crate::json::{self, Value};

type R<T> = Result<T, String>;

/// Who may land at a field.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Use {
    #[default]
    Public,
    /// FACILITY_USE_CODE PR, not owned by the armed services.
    Private,
    /// Owned by the armed services and not open to the public.
    Military,
    /// Owned by the armed services and open to the public.
    Joint,
}

impl Use {
    /// From the hosts' two flags: `military` as the planner and the packs
    /// give it ("military", "joint" or none), `private` the planner's
    /// (which already leaves the services' fields out).
    pub fn of(private: bool, military: Option<&str>) -> Use {
        match military {
            Some("military") => Use::Military,
            Some("joint") => Use::Joint,
            _ if private => Use::Private,
            _ => Use::Public,
        }
    }

    pub fn word(self) -> &'static str {
        match self {
            Use::Public => "public",
            Use::Private => "private",
            Use::Military => "military",
            Use::Joint => "joint",
        }
    }

    /// The `military` member as the answers give it.
    pub fn military(self) -> Option<&'static str> {
        match self {
            Use::Military => Some("military"),
            Use::Joint => Some("joint"),
            _ => None,
        }
    }

    pub fn private(self) -> bool {
        self == Use::Private
    }

    /// Open to any civil pilot: neither private nor military-only (a joint
    /// field is public use). The search's "Public" filter.
    pub fn public_use(self) -> bool {
        matches!(self, Use::Public | Use::Joint)
    }

    /// "IL11 is private: land only with the owner's permission", "KMXF is
    /// military: prior permission required (PPR)" (use rather than land
    /// for the field departed from); None for a public or joint-use field.
    pub fn permission_line(self, ident: &str, departure: bool) -> Option<String> {
        let verb = if departure { "use" } else { "land" };
        match self {
            Use::Private => Some(format!("{ident} is private: {verb} only with the owner's permission")),
            Use::Military => Some(format!("{ident} is military: prior permission required (PPR)")),
            Use::Public | Use::Joint => None,
        }
    }

    /// The card's line, the owner's words (2026-11-13): none for a public
    /// or a joint-use field.
    pub fn card_words(self) -> Option<&'static str> {
        match self {
            Use::Private => Some("Private: permission required"),
            Use::Military => Some("Military: prior permission required"),
            _ => None,
        }
    }
}

/// Reads a field's `private` (true or false) and `military` ("military",
/// "joint" or null) members.
pub fn read(name: &str, v: &Value) -> R<Use> {
    let private = match v.get("private") {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(_) => return Err(format!("{name}: \"private\" is not true or false")),
    };
    let military = match v.get("military") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) if s == "military" || s == "joint" => Some(s.as_str()),
        Some(_) => return Err(format!("{name}: \"military\" is \"military\", \"joint\" or null")),
    };
    Ok(Use::of(private, military))
}

/// "Owner-reported, last updated Aug 2023": said only where the figures
/// are the owner's own (an inspected field's need no line); the date's
/// month where it is a date ("2023-08-23" or NASR's "2023/08/23").
pub fn data_words(source: Option<&str>, date: Option<&str>) -> Option<String> {
    if source != Some("owner-reported") {
        return None;
    }
    Some(match date.and_then(month_year) {
        Some(when) => format!("Owner-reported, last updated {when}"),
        None => "Owner-reported, not inspected".to_owned(),
    })
}

fn month_year(date: &str) -> Option<String> {
    const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let mut parts = date.trim().split(['-', '/']);
    let year = parts.next().filter(|y| y.len() == 4 && y.chars().all(|c| c.is_ascii_digit()))?;
    let month: usize = parts.next()?.parse().ok()?;
    Some(format!("{} {year}", MONTHS.get(month.checked_sub(1)?)?))
}

/// What a field's empty NOTAM list says where NASR gives it no NOTAM_ID
/// and it is private: none are issued, rather than none heard. None where
/// the ordinary empty state is right.
pub fn notams_none_words(notam_id: Option<&str>, use_: Use) -> Option<&'static str> {
    (use_ == Use::Private && notam_id.is_none_or(|id| id.trim().is_empty())).then_some("No NOTAMs are issued for this private-use field.")
}

/// The rules by name (crates/brief/contract: airport_use_words,
/// public_use, airport_data_words, airport_notams_none).
pub fn call(name: &str, v: &Value) -> R<String> {
    let text = |key: &str| -> R<Option<&str>> {
        match v.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::String(s)) => Ok(Some(s.as_str())),
            Some(_) => Err(format!("{name}: \"{key}\" is not a string")),
        }
    };
    let mut out = String::new();
    match name {
        "airport_use_words" => {
            let u = read(name, v)?;
            out.push_str("{\"use\":");
            json::string(&mut out, u.word());
            out.push_str(",\"words\":");
            json::opt_string(&mut out, u.card_words());
            out.push_str(&format!(",\"public_use\":{}}}", u.public_use()));
        }
        "public_use" => out.push_str(&read(name, v)?.public_use().to_string()),
        "airport_data_words" => json::opt_string(&mut out, data_words(text("data_source")?, text("info_date")?).as_deref()),
        "airport_notams_none" => json::opt_string(&mut out, notams_none_words(text("notam_id")?, read(name, v)?)),
        _ => return Err(format!("the engine has no rule called {name:?}")),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_use_from_nasrs_codes() {
        // IL11 PR/PR, KMXF MA/PR, KFHU MR/PU (NASR 2026-10-29).
        assert_eq!(Use::of(true, None), Use::Private);
        assert_eq!(Use::of(false, Some("military")), Use::Military);
        assert_eq!(Use::of(false, Some("joint")), Use::Joint);
        assert_eq!(Use::of(false, None), Use::Public);
        assert_eq!(Use::Private.card_words(), Some("Private: permission required"));
        assert_eq!(Use::Military.card_words(), Some("Military: prior permission required"));
        assert_eq!(Use::Joint.card_words(), None);
        assert!(Use::Joint.public_use() && Use::Public.public_use());
        assert!(!Use::Private.public_use() && !Use::Military.public_use());
    }

    #[test]
    fn owner_reported_data_says_its_age() {
        // 3LL4: method 2, last info response 2023/08/23.
        assert_eq!(data_words(Some("owner-reported"), Some("2023/08/23")).as_deref(), Some("Owner-reported, last updated Aug 2023"));
        assert_eq!(data_words(Some("owner-reported"), Some("2026-03-18")).as_deref(), Some("Owner-reported, last updated Mar 2026"));
        assert_eq!(data_words(Some("owner-reported"), None).as_deref(), Some("Owner-reported, not inspected"));
        assert_eq!(data_words(Some("inspected"), Some("2025-07-30")), None);
        assert_eq!(data_words(None, None), None);
    }

    #[test]
    fn a_private_field_with_no_notam_id_gets_none_issued() {
        assert!(notams_none_words(None, Use::Private).is_some());
        assert!(notams_none_words(Some(""), Use::Private).is_some());
        // 3CK is public, its NOTAM_ID IKK: the ordinary empty state.
        assert_eq!(notams_none_words(Some("IKK"), Use::Public), None);
        assert_eq!(notams_none_words(None, Use::Public), None);
    }
}
