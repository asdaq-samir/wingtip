//! The FAA's contractions written out: the one table the engine reads a
//! contraction by, for a NOTAM's words (notam_read) and a D-ATIS's spoken
//! words (wingtip-radio's datis) alike.
//!
//! The contractions are FAA Order JO 7340.2 (Contractions), as FAA Order
//! JO 7930.2 (Notices to Air Missions) 3-3-1 says a NOTAM uses them, and
//! the NOTAM phrases of its TBL 3-3-1 (U/S, OBSC, UNREL, BTN, ADJ, ...);
//! its examples (Appendix A) are where each is seen in use. 3-3-1 also
//! says a contraction in the singular decodes to both singular and plural,
//! and one in the past tense to both tenses: the words below are the form
//! a pilot reads most often ("light", "closed"). Only contractions whose
//! meaning is one and the same in every NOTAM are here; a word that is
//! not is left as it was written, never guessed.
//!
//! The codes a pilot reads as written (ILS, PAPI, VOR, RNAV, LPV, CTAF,
//! MSL, ...) are kept as codes (`is_code`), as the app's faa_words keeps
//! them when it sets the FAA's capitals in sentence case.

/// The contractions, a line each: the contraction, a colon and its words
/// in lower case. One string rather than a table of pairs, which kept the
/// web's WebAssembly within its budget (scripts/ci/wasm_size.py).
const TABLE: &str = concat!(
    // Surfaces and the movement area (JO 7930.2 3-3-5, 3-3-6, 5-1).
    "RWY:runway\n", "RWYS:runways\n", "TWY:taxiway\n", "TWYS:taxiways\n", "APN:apron\n", "AP:airport\n", "THR:threshold\n",
    "PARL:parallel\n", "ADJ:adjacent\n", "BTN:between\n", "FST:first\n", "MOV:movement\n", "SFC:surface\n", "ASPH:asphalt\n",
    "CONC:concrete\n", "GRVL:gravel\n", "WID:width\n", "LEN:length\n", "DPT:depth\n", "HGT:height\n", "PSN:position\n", "HLDG:holding\n",
    "CL:centerline\n", "RCL:runway centerline\n", "STD:standard\n", "WIP:work in progress\n", "MAINT:maintenance\n",
    "FICON:field condition\n", "BA:braking action\n", "SN:snow\n", "ARST:arresting\n", // Lights (JO 7930.2 5-2-1).
    "LGT:light\n", "LGTS:lights\n", "LGTD:lighted\n", "FLG:flashing\n", "INTST:intensity\n", "REDL:runway edge lights\n",
    "RCLL:runway centerline lights\n", "RENL:runway end lights\n", "RTHL:runway threshold lights\n", "RTZL:touchdown zone lights\n",
    "PCL:pilot-controlled lighting\n", "ABN:airport beacon\n", "WDI:wind direction indicator\n", "BCN:beacon\n", "MKR:marker\n",
    "GP:glide path\n", "ID:identifier\n", // Status and conditions (JO 7930.2 TBL 3-3-1).
    "CLSD:closed\n", "U/S:out of service\n", "OTS:out of service\n", "INOP:inoperative\n", "RTS:returned to service\n", "AVBL:available\n",
    "UNREL:unreliable\n", "OBSC:obscured\n", "OPN:open\n", "OPR:operating\n", "OPS:operations\n", "NA:not authorized\n", "EXC:except\n",
    "UNL:unlimited\n", "PERM:permanent\n", "TEMPO:temporary\n", "UFN:until further notice\n", "PPR:prior permission required\n",
    "AUTH:authorized\n", "MNT:monitored\n", "ACT:active\n", "COND:condition\n", "CONS:continuous\n", "NML:normal\n", "DLA:delay\n",
    "CTN:caution\n", "EMERG:emergency\n", "BYD:beyond\n", "WI:within\n", "FM:from\n", "BLW:below\n", "OBST:obstacle\n", "PCT:percent\n",
    "DLY:daily\n", "SR:sunrise\n", "SS:sunset\n", "HR:hours\n", // Aircraft, operations and air traffic.
    "ACFT:aircraft\n", "TAX:taxiing\n", "TKOF:takeoff\n", "LDG:landing\n", "LNDG:landing\n", "TGL:touch-and-go landings\n",
    "XNG:crossing\n", "APCH:approach\n", "APCHS:approaches\n", "ARR:arrival\n", "ARRS:arrivals\n", "DEP:departure\n", "DEPS:departures\n",
    "DEPG:departing\n", "DEPTG:departing\n", "TFC:traffic\n", "TRG:training\n", "PJE:parachute jumping\n", "STNR:stationary\n",
    "FLT:flight\n", "ALT:altitude\n", "ALTN:alternate\n", "MNM:minimum\n", "VIS:visibility\n", "CATS:categories\n", "AMDT:amendment\n",
    "ORIG:original\n", "INT:intersection\n", "INTL:international\n", "SIMUL:simultaneous\n",
    // Facilities, services and radio.
    "TWR:tower\n", "APP:approach control\n", "GND:ground\n", "CTL:control\n", "CLR:clearance\n", "CD:clearance delivery\n",
    "FREQ:frequency\n", "COM:communications\n", "SER:service\n", "SVC:service\n", "BCST:broadcast\n", "AUNICOM:automated UNICOM\n",
    "CTC:contact\n", "INFO:information\n", "ADVS:advise\n", "WX:weather\n", "AUTO:automatic\n",
);

/// `word`'s line in a table of lines "WORD:words" (TABLE's form), its
/// words; None where it has none.
pub fn lookup(table: &'static str, word: &str) -> Option<&'static str> {
    table.lines().find_map(|line| line.split_once(':').filter(|(c, _)| *c == word).map(|(_, w)| w))
}

/// Whether `word` is one of a list of words a space apart.
pub fn listed(list: &str, word: &str) -> bool {
    list.split(' ').any(|w| w == word)
}

/// A contraction written out in lower case, or None where it is not one.
pub fn written(word: &str) -> Option<&'static str> {
    lookup(TABLE, word)
}

/// The lighting remarks' own contractions (lighting_read), a line each as
/// TABLE: the Chart Supplement's Abbreviations ("incr increase", "ints
/// intense, intensity", "med medium", "opr operate", "dalgt daylight",
/// "ngt night", "sked schedule", "ATCT Airport Traffic Control Tower"),
/// which defers to JO 7340.2 for the rest, and the NASR remarks' common
/// forms of them (ACTVT, INTST, CONSLY). A table of its own, read before
/// TABLE, so that the web's WebAssembly, whose NOTAMs read TABLE and
/// which has no lighting rule, carries none of it.
///
/// ATCTVT is no contraction: it is NASR's own misspelling of ACTVT in
/// APT_RMK.csv's LGT_SKED (UGN and MLJ, the 2026-10-29 cycle: "ATCTVT
/// MALSR RWY 23; ... - CTAF"), the remark's first word, before the
/// systems and the frequency of the legend's "LGT ACTIVATE HIRL Rwy
/// 07-25 ... - 122.8" form. Read letter by letter it became "Atctvt".
const LIGHTING: &str = concat!(
    "ACTVT:activate\n", "ACTVTD:activated\n", "ATCTVT:activate\n", "ACTIVATE:activate\n", "ATCT:the tower\n", "INTST:intensity\n",
    "INTS:intensity\n", "INCR:increase\n", "DECR:decrease\n", "MED:medium\n", "CONSLY:continuously\n", "OPER:operates\n",
    "OPRS:operates\n", "LGTG:lighting\n", "DALGT:daylight\n", "NGT:night\n", "SKED:schedule\n", "REQ:request\n", "OT:other times\n",
    "AFT:after\n", "HRS:hours\n", "ROTG:rotating\n", "RTG:rotating\n", "NSTD:non-standard\n", "TWYS:taxiways\n", "RY:runway\n",
    "RYS:runways\n", "PRESET:preset\n",
);

/// A word of a lighting remark written out: its own contractions first,
/// then the one table's.
pub fn lighting_written(word: &str) -> Option<&'static str> {
    lookup(LIGHTING, word).or_else(|| written(word))
}

/// The codes a pilot reads as written: the navaids and their parts, the
/// approach lights and approaches by their names on the chart (AIM 2-1,
/// 5-4-5), the services by their names in the Chart Supplement, and the
/// references. Words of three letters or fewer that are not contractions
/// are kept as written anyway (idents, designators); these are the longer.
const CODES: &str = concat!(
    "NOTAM NOTAMS VORTAC TACAN RNAV LNAV VNAV GBAS WAAS RAIM PAPI VASI ALSF ALSF-1 ALSF-2 MALS MALSF ",
    "MALSR SSALR SSALF SSALS ODALS REIL HIRL MIRL LIRL RLLS ATIS AWOS ASOS CTAF UNICOM ARFF ATCT TRACON ",
    "ARTCC CPDLC ADS-B ADS-R TIS-B FIS-B 100LL MOGAS SFAR",
);

/// A code kept as written.
pub fn is_code(word: &str) -> bool {
    listed(CODES, word)
}

/// The 16 points of the compass as JO 7930.2 3-3-9 abbreviates them, a
/// line each, as TABLE.
const POINTS: &str = "N:north\nNNE:north-northeast\nNE:northeast\nENE:east-northeast\nE:east\nESE:east-southeast\nSE:southeast\nSSE:south-southeast\nS:south\nSSW:south-southwest\nSW:southwest\nWSW:west-southwest\nW:west\nWNW:west-northwest\nNW:northwest\nNNW:north-northwest";

/// A compass point (3-3-9's abbreviation) written out.
pub fn compass(word: &str) -> Option<&'static str> {
    lookup(POINTS, word)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_phrases_of_jo_7930_2_are_written_out() {
        // TBL 3-3-1: "U/S (Out of Service/Unserviceable)", "ADJ (adjacent)".
        assert_eq!(written("U/S"), Some("out of service"));
        assert_eq!(written("ADJ"), Some("adjacent"));
        assert_eq!(written("CLSD"), Some("closed"));
        assert_eq!(written("ILS"), None);
        assert!(is_code("PAPI") && !is_code("CRANE"));
        assert_eq!(compass("SSW"), Some("south-southwest"));
    }
}
