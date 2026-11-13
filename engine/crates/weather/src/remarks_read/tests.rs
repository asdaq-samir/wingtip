//! Real remarks from NASR's APT_RMK.csv (the 2026-10-29 cycle), the fuel's,
//! the FBO's and a courtesy car's, each word worked by hand from the Chart
//! Supplement's Abbreviations (NE, 3 SEP 2026) and JO 7340.2R's decode,
//! not from the code.

use super::*;

#[test]
fn waukegans_customs_its_hours_of_notice_and_clearing_customs_before_the_fbo() {
    // CUST customs, CLNC clearance, TSNT transient (7340.2R); hr hour, PPR
    // prior permission required (the Chart Supplement); CLR before CUST.
    assert_eq!(
        read("CUST CLNC 2 HR PPR - 847-894-7292. TSNT UTILIZE FBO AFT CLR CUST. FBO CBP USER FEE."),
        "Customs clearance 2 hours prior permission required - 847-894-7292. Transient utilize FBO after clearing customs. \
         FBO CBP user fee."
    );
}

#[test]
fn the_fuels_codes_and_a_telephone_number_are_kept() {
    assert_eq!(read("A+ AND 100LL AVBL FOR FEE AFTER HRS, 920-236-7827."), "A+ and 100LL available for fee after hours, 920-236-7827.");
    // SER service (7340.2R); a figure run into its unit.
    assert_eq!(read("100LL SELF SER AVBL 24HR WITH CREDIT CARD."), "100LL self service available 24 hours with credit card.");
}

#[test]
fn a_word_of_two_meanings_is_kept_as_written() {
    // PRVDD, PRVD's past (7340.2R); FM is "fan marker" and "from" there and
    // "Fan Marker, Frequency Modulation" in the Chart Supplement: kept.
    assert_eq!(
        read("FUEL IS PRVDD BY A DOD CONTRACT. 100 LL AVBL 24HR WITH CREDIT CARD FM SELF SERVE PUMP ON TSNT RAMP."),
        "Fuel is provided by A DOD contract. 100 LL available 24 hours with credit card FM self serve pump on transient ramp."
    );
    // OPN, "open" and "operation" (7340.2R): kept.
    assert_eq!(
        read("FOR FBO HRS OF OPN CTC (785) 628-8881. FOR AFT HRS FUEL CTC FBO."),
        "For FBO hours of OPN contact (785) 628-8881. For after hours fuel contact FBO."
    );
}

#[test]
fn on_request_days_and_spans_of_hours() {
    // ATNDD, ATND's past; OTR other; O/R on request; thru through.
    assert_eq!(read("ARPT ATNDD OTR HRS O/R THRU FBO."), "Airport attended other hours on request through FBO.");
    assert_eq!(read("FUEL AVBL MON-FRI 0800-1700, 1 HR PN."), "Fuel available Monday-Friday 0800 to 1700, 1 hour prior notice.");
    assert_eq!(read("FUEL AVBL 24 HRS SELF SER W/CREDIT CARD."), "Fuel available 24 hours self service W/credit card.");
}

#[test]
fn brackets_a_courtesy_car_and_someones_own_writing() {
    assert_eq!(
        read("US CUST INTL AOE (NO FEES) AVBL H24 C218-720-5203 THEN PRESS 0. CUST CLEARING LCTD AT FBO."),
        "US customs international AOE (no fees) available H24 C218-720-5203 then press 0. Customs clearing located at FBO."
    );
    assert_eq!(read("CRS CAR AVBL."), "Courtesy car available.");
    assert_eq!(read("Call the FBO."), "Call the FBO.");
}

#[test]
fn the_rule_answers_a_line_for_each_remark() {
    let v = crate::json::parse(r#"{"remarks":["COURTESY CAR AVBL.","24 HR SELF SVC FUEL AVBL WITH CREDIT CARD."]}"#).unwrap();
    assert_eq!(
        call("remarks_read", &v).unwrap(),
        r#"{"lines":["Courtesy car available.","24 hours self service fuel available with credit card."]}"#
    );
    assert!(call("remarks_read", &crate::json::parse("{}").unwrap()).is_err());
}

#[test]
fn a_fuels_grade_and_auto_fuel_are_kept() {
    // BLV's (Scott AFB): A++ the military's grade; "ot other times", "rqr
    // require", PN prior notice (the Chart Supplement).
    assert_eq!(
        read("SERVICE-FUEL: A++(MIL). FUEL SVC AVBL 1100Z-0500Z, OT RQR 1 HR PN."),
        "Service-fuel: A++(MIL). Fuel service available 1100Z-0500Z, other times require 1 hour prior notice."
    );
    // 2C9's: AUTO is the legend's "automatic", here an automobile's fuel.
    assert_eq!(read("AUTO FUEL AVBL, PRIOR CDN RQRD 419-242-7575."), "AUTO fuel available, prior coordination required 419-242-7575.");
}

#[test]
fn the_radios_and_a_navaids_remarks() {
    // 3CK's weather on the CTAF (APT_RMK): ADZY advisory (7340.2R).
    assert_eq!(read("WX ADZY - CTAF 5 CLICKS OR 815-444-1729."), "Weather advisory - CTAF 5 clicks or 815-444-1729.");
    // A VOR's service volume restriction (NAV_RMK, AIM 1-1-8): UNUSBL
    // unusable, BYD beyond, BLW below; the radials and NM kept.
    assert_eq!(read("VOR UNUSBL 010-030 BYD 20 NM BLW 5000."), "VOR unusable 010-030 beyond 20 NM below 5000.");
    assert_eq!(read("DME UNUSBL 250-280 ABV 8000."), "DME unusable 250-280 above 8000.");
}
