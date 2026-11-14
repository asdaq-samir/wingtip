//! spoken's places hold a pack's airports to wingtip_flight::field, the one
//! rule of whether a field is open (decision 0043).

use crate::pack::{tests::written, Pack};
use crate::spoken::places_of;

// NASR APT_BASE's ARPT_STATUS: only an operational field (O) is a place to
// name; one closed indefinitely (CI) or permanently (CP), or with no status
// at all, is not. C81 is open and 9II2 CI in the 2026-10-29 cycle; BFW, CP
// there, stands for a permanent closure.
#[test]
fn a_closed_field_is_no_place() {
    let table = r#"{"columns":["ARPT_ID","ICAO_ID","SITE_TYPE_CODE","ARPT_NAME","LAT_DECIMAL","LONG_DECIMAL","ARPT_STATUS"],"rows":[
        ["C81","","A","CAMPBELL","42.3246","-88.0741","O"],
        ["9II2","","A","NELUND FLD","41.6875","-86.1550","CI"],
        ["BFW","","A","CLOSED PERMANENTLY","41.0","-87.0","CP"],
        ["XX1","","A","NO STATUS","41.0","-87.5",""]]}"#;
    let bytes = written(&[("airports", table.as_bytes().to_vec())]);
    let idents: Vec<String> = places_of(&Pack::read(&bytes).unwrap()).into_iter().map(|p| p.ident).collect();
    assert_eq!(idents, vec!["C81".to_owned()]);
}
