//! The navaid kinds by NASR's NAV_BASE NAV_TYPE, one copy for the engine's
//! rules and the planner's readers (navaid_kinds): the VORs a pilot tunes
//! and steers by, and every kind a route may fly over. The maps' filter is
//! design/map-style.json's vorKinds, the same three.

use crate::json::Value;
use wingtip_core::ask::strings;

/// The navaids the sectional draws as a VOR, by NAV_TYPE: the VOR's
/// hexagon, the VOR/DME's in its box and the VORTAC's (FAA Aeronautical
/// Chart User's Guide, VFR Terms and Symbols, Radio Aids to Navigation).
pub const VOR_KINDS: &[&str] = &["VORTAC", "VOR/DME", "VOR"];

/// The navaids a route may fly over, by NAV_TYPE, in the order one is kept
/// over another of the same ident, the likelier to fly to first: not the VOR
/// test facilities (VOT), the fan markers or a marine beacon, which no
/// route flies to.
pub const NAVAID_KINDS: &[&str] = &["VORTAC", "VOR/DME", "VOR", "DME", "TACAN", "NDB/DME", "NDB"];

/// navaid_kinds: `{"vor": [...], "navaid": [...]}`, each in its order.
pub fn call(_name: &str, _v: &Value) -> Result<String, String> {
    let list = |kinds: &[&str]| kinds.iter().map(|k| (*k).to_owned()).collect::<Vec<_>>();
    let mut out = String::from("{\"vor\":");
    strings(&mut out, &list(VOR_KINDS));
    out.push_str(",\"navaid\":");
    strings(&mut out, &list(NAVAID_KINDS));
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_vors_lead_the_navaids_in_the_order_kept() {
        let answer = super::call("navaid_kinds", &crate::json::Value::Null).unwrap();
        assert_eq!(answer, r#"{"vor":["VORTAC","VOR/DME","VOR"],"navaid":["VORTAC","VOR/DME","VOR","DME","TACAN","NDB/DME","NDB"]}"#);
        assert_eq!(super::NAVAID_KINDS[..3], *super::VOR_KINDS);
    }
}
