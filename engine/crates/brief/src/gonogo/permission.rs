//! The Go / No-Go's finding for a departure, destination or stop that is
//! private or military-only: such a field is used only with its owner's
//! permission, or the service's prior permission (PPR), and 14 CFR 91.103
//! has the pilot in command become familiar with all available
//! information about the flight before it. NASR's FACILITY_USE_CODE PR is
//! non-public use (the sectional's circled R, FAA Aeronautical Chart
//! User's Guide); the services' own fields are OWNERSHIP_TYPE_CODE MA, MN,
//! MR and CG, joint use where open to the public (airport_use). The
//! phone is NASR APT_CON's, the manager's or else the owner's, as the
//! planner gives it.
//!
//! A row of its own after the seven (`gonogo_field_permission`), which
//! the hosts add to `gonogo_verdict_items`' list before its line; none
//! where every field is public use. A caution, never a stop: the pilot
//! may well have the permission already (the owner's "warn, never
//! limit").

use super::calls::In;
use super::verdict::{item_json, Item};
use crate::airport_use::{self, Use};
use crate::json::Value;

type R<T> = Result<T, String>;

/// A field the route uses, as the planner gives it.
#[derive(Clone, Debug, PartialEq)]
pub struct Used {
    pub ident: String,
    /// "departure", "destination" or "stop".
    pub role: String,
    pub usage: Use,
    pub phone: Option<String>,
}

fn words(f: &Used) -> Option<String> {
    let what = f.usage.permission_line(&f.ident, f.role == "departure")?;
    Some(match f.phone.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(phone) => format!("{what} (call {phone})"),
        None => what,
    })
}

/// The finding, None where every field is public use. It opens the tab
/// of the first field it names: Depart for the departure, else Arrive.
pub fn permission_item(fields: &[Used]) -> Option<Item> {
    let named: Vec<(&Used, String)> = fields.iter().filter_map(|f| words(f).map(|w| (f, w))).collect();
    let (first, _) = named.first()?;
    Some(Item {
        key: "permission".into(),
        label: "Permission".into(),
        tab: if first.role == "departure" { "depart" } else { "arrive" }.into(),
        section: None,
        finding: "caution".into(),
        detail: named.iter().map(|(_, w)| w.as_str()).collect::<Vec<_>>().join("; "),
    })
}

/// `gonogo_field_permission` by name.
pub fn call(name: &str, v: &Value) -> R<String> {
    let i = In { name };
    let fields = i
        .list(v, "fields")?
        .iter()
        .map(|f| {
            Ok(Used {
                ident: i.str(f, "ident")?,
                role: i.opt_str(f, "role")?.unwrap_or_else(|| "destination".into()),
                usage: airport_use::read(name, f)?,
                phone: i.opt_str(f, "phone")?,
            })
        })
        .collect::<R<Vec<_>>>()?;
    Ok(match permission_item(&fields) {
        Some(item) => {
            let mut out = String::new();
            item_json(&mut out, &item);
            out
        }
        None => "null".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn used(ident: &str, role: &str, usage: Use, phone: Option<&str>) -> Used {
        Used { ident: ident.into(), role: role.into(), usage, phone: phone.map(Into::into) }
    }

    #[test]
    fn a_private_destination_asks_for_the_owners_permission() {
        // C81 to IL11 (NASR 2026-10-29: IL11 PR/PR, APT_CON 847-323-8911).
        let item = permission_item(&[
            used("C81", "departure", Use::Public, None),
            used("IL11", "destination", Use::Private, Some("847-323-8911")),
        ])
        .unwrap();
        assert_eq!(item.finding, "caution");
        assert_eq!(item.tab, "arrive");
        assert_eq!(item.detail, "IL11 is private: land only with the owner's permission (call 847-323-8911)");
    }

    #[test]
    fn a_military_field_is_ppr_and_a_joint_one_is_nothing() {
        let item = permission_item(&[used("KMXF", "stop", Use::Military, None), used("KFHU", "destination", Use::Joint, None)]).unwrap();
        assert_eq!(item.detail, "KMXF is military: prior permission required (PPR)");
        assert!(permission_item(&[used("KFHU", "destination", Use::Joint, None), used("3CK", "departure", Use::Public, None)]).is_none());
    }

    #[test]
    fn a_private_departure_opens_depart() {
        let item =
            permission_item(&[used("IL02", "departure", Use::Private, None), used("IL11", "destination", Use::Private, None)]).unwrap();
        assert_eq!(item.tab, "depart");
        assert_eq!(
            item.detail,
            "IL02 is private: use only with the owner's permission; IL11 is private: land only with the owner's permission"
        );
    }
}
