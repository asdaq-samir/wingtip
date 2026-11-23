//! 14 CFR part 91, appendix D, sections 3 and 4.
//!
//! Section 3: "Locations at which fixed-wing
//! Special VFR operations are prohibited. The Special VFR weather minimums
//! of § 91.157 do not apply to the following airports" (eCFR, current on
//! 2026-11-21). Each airport as the appendix names it, with its FAA
//! location identifier and its ICAO one (NASR APT_BASE.csv's ARPT_ID and
//! ICAO_ID), so a host may ask by either. The appendix's names are its own
//! and some are old ("Greater Buffalo International", "Port Columbus
//! International"); the idents are the fields those names are.
//!
//! Section 4: "Locations at which solo student, sport, and recreational
//! pilot activity is not permitted. Pursuant to § 91.131(b)(2), solo
//! student, sport, and recreational pilot operations are not permitted at
//! any of the following airports" (eCFR, current on 2026-11-19): 91.131(b)(2)
//! has no one take off or land there "unless the pilot in command holds at
//! least a private pilot certificate", whatever endorsement 61.95 gives.

/// One airport of appendix D, section 3.
pub struct Listed {
    /// NASR's ARPT_ID, the FAA location identifier.
    pub faa: &'static str,
    /// NASR's ICAO_ID.
    pub icao: &'static str,
    /// The appendix's own words: "Chicago, IL (Chicago-O'Hare International Airport)".
    pub listed: &'static str,
    /// The airport's name as the appendix writes it, in its parentheses.
    pub name: &'static str,
}

const fn at(faa: &'static str, icao: &'static str, listed: &'static str, name: &'static str) -> Listed {
    Listed { faa, icao, listed, name }
}

/// The 33 airports, in the appendix's order.
pub const NO_FIXED_WING_SVFR: [Listed; 33] = [
    at("ATL", "KATL", "Atlanta, GA", "Hartsfield-Jackson Atlanta International Airport"),
    at("BWI", "KBWI", "Baltimore, MD", "Baltimore/Washington International Thurgood Marshall Airport"),
    at("BOS", "KBOS", "Boston, MA", "General Edward Lawrence Logan International Airport"),
    at("BUF", "KBUF", "Buffalo, NY", "Greater Buffalo International Airport"),
    at("ADW", "KADW", "Camp Springs, MD", "Joint Base Andrews"),
    at("ORD", "KORD", "Chicago, IL", "Chicago-O'Hare International Airport"),
    at("CLE", "KCLE", "Cleveland, OH", "Cleveland-Hopkins International Airport"),
    at("CMH", "KCMH", "Columbus, OH", "Port Columbus International Airport"),
    at("CVG", "KCVG", "Covington, KY", "Cincinnati/Northern Kentucky International Airport"),
    at("DFW", "KDFW", "Dallas, TX", "Dallas/Fort Worth International Airport"),
    at("DAL", "KDAL", "Dallas, TX", "Dallas Love Field Airport"),
    at("DEN", "KDEN", "Denver, CO", "Denver International Airport"),
    at("DTW", "KDTW", "Detroit, MI", "Detroit Metropolitan Wayne County Airport"),
    at("HNL", "PHNL", "Honolulu, HI", "Honolulu International Airport"),
    at("IAH", "KIAH", "Houston, TX", "George Bush Intercontinental/Houston Airport"),
    at("IND", "KIND", "Indianapolis, IN", "Indianapolis International Airport"),
    at("LAX", "KLAX", "Los Angeles, CA", "Los Angeles International Airport"),
    at("SDF", "KSDF", "Louisville, KY", "Louisville International Airport-Standiford Field"),
    at("MEM", "KMEM", "Memphis, TN", "Memphis International Airport"),
    at("MIA", "KMIA", "Miami, FL", "Miami International Airport"),
    at("MSP", "KMSP", "Minneapolis, MN", "Minneapolis-St. Paul International/Wold-Chamberlain Airport"),
    at("EWR", "KEWR", "Newark, NJ", "Newark Liberty International Airport"),
    at("JFK", "KJFK", "New York, NY", "John F. Kennedy International Airport"),
    at("LGA", "KLGA", "New York, NY", "LaGuardia Airport"),
    at("MSY", "KMSY", "New Orleans, LA", "Louis Armstrong New Orleans International Airport"),
    at("PHL", "KPHL", "Philadelphia, PA", "Philadelphia International Airport"),
    at("PIT", "KPIT", "Pittsburgh, PA", "Pittsburgh International Airport"),
    at("PDX", "KPDX", "Portland, OR", "Portland International Airport"),
    at("SFO", "KSFO", "San Francisco, CA", "San Francisco International Airport"),
    at("SEA", "KSEA", "Seattle, WA", "Seattle-Tacoma International Airport"),
    at("STL", "KSTL", "St. Louis, MO", "Lambert-St. Louis International Airport"),
    at("TPA", "KTPA", "Tampa, FL", "Tampa International Airport"),
    at("DCA", "KDCA", "Washington, DC", "Ronald Reagan Washington National Airport"),
];

/// Section 4's 12 airports, in the appendix's order.
pub const NO_SOLO_STUDENT: [Listed; 12] = [
    at("ATL", "KATL", "Atlanta, GA", "Hartsfield-Jackson Atlanta International Airport"),
    at("BOS", "KBOS", "Boston, MA", "General Edward Lawrence Logan International Airport"),
    at("ADW", "KADW", "Camp Springs, MD", "Joint Base Andrews"),
    at("ORD", "KORD", "Chicago, IL", "Chicago-O'Hare International Airport"),
    at("DFW", "KDFW", "Dallas, TX", "Dallas/Fort Worth International Airport"),
    at("LAX", "KLAX", "Los Angeles, CA", "Los Angeles International Airport"),
    at("MIA", "KMIA", "Miami, FL", "Miami International Airport"),
    at("EWR", "KEWR", "Newark, NJ", "Newark Liberty International Airport"),
    at("JFK", "KJFK", "New York, NY", "John F. Kennedy International Airport"),
    at("LGA", "KLGA", "New York, NY", "LaGuardia Airport"),
    at("SFO", "KSFO", "San Francisco, CA", "San Francisco International Airport"),
    at("DCA", "KDCA", "Washington, DC", "Ronald Reagan Washington National Airport"),
];

fn find(list: &'static [Listed], ident: &str) -> Option<&'static Listed> {
    let ident = ident.trim().to_ascii_uppercase();
    if ident.is_empty() {
        return None;
    }
    list.iter().find(|a| a.faa == ident || a.icao == ident)
}

/// Section 3's entry for an airport asked by its FAA or ICAO ident, any
/// case, or None where it is not listed.
pub fn listed(ident: &str) -> Option<&'static Listed> {
    find(&NO_FIXED_WING_SVFR, ident)
}

/// Section 4's entry for an airport asked by its FAA or ICAO ident, any
/// case: one where a student, sport or recreational pilot may not take off
/// or land solo (91.131(b)(2)). None where it is not listed.
pub fn class_b_solo_barred(ident: &str) -> Option<&'static Listed> {
    find(&NO_SOLO_STUDENT, ident)
}
