//! The Ownship Report (ID 10) and the Traffic Report (ID 20), which share
//! one 27-byte layout (GDL 90 Data Interface Specification, 560-1058-00
//! Rev A, 3.4 and 3.5.1): who, where, how high, how fast and which way,
//! and how well its position is known.

/// One airplane as a report gives it. Heights are feet, the pressure
/// altitude's on 29.92 inHg (3.5.1.4), speeds knots, rates feet a minute.
#[derive(Clone, Debug, PartialEq)]
pub struct Report {
    /// The traffic alert status (3.5.1.1): 1 where the receiver's own
    /// alerting flags it.
    pub alert: bool,
    /// The address type (3.5.1.2): 0 ADS-B with an ICAO address, 1 ADS-B
    /// self-assigned, 2 TIS-B with an ICAO address, 3 TIS-B track file,
    /// 4 a surface vehicle, 5 a ground station beacon.
    pub address_type: u8,
    /// The 24-bit participant address (3.5.1.3).
    pub address: u32,
    pub lat: f64,
    pub lon: f64,
    /// Pressure altitude, ft; None where 0xFFF, "invalid or unavailable"
    /// (3.5.1.4).
    pub pressure_ft: Option<f64>,
    /// Airborne, else on the ground (3.5.1.5's Miscellaneous Indicators).
    pub airborne: bool,
    /// The report extrapolated rather than updated (3.5.1.5).
    pub extrapolated: bool,
    /// The track or heading, degrees; None where the indicators say it is
    /// not valid (3.5.1.5).
    pub track_deg: Option<f64>,
    /// What `track_deg` is: "track" (true track), "heading" (true) or
    /// "magnetic" (magnetic heading), 3.5.1.5.
    pub track_kind: &'static str,
    /// Navigation Integrity Category and Navigation Accuracy Category for
    /// Position (3.5.1.6), as DO-260B and DO-282B define them.
    pub nic: u8,
    pub nacp: u8,
    /// Horizontal velocity, kt; None where 0xFFF (3.5.1.7).
    pub speed_kt: Option<f64>,
    /// Vertical velocity, ft/min, in 64 ft/min steps; None where 0x800
    /// (3.5.1.8).
    pub vertical_fpm: Option<f64>,
    /// The emitter category (3.5.1.10).
    pub emitter: u8,
    /// The call sign or registration, its spaces taken off (3.5.1.11).
    pub callsign: Option<String>,
    /// The emergency or priority code (3.5.1.12): 0 none, 1 general,
    /// 2 medical, 3 minimum fuel, 4 no communication, 5 unlawful
    /// interference, 6 downed aircraft.
    pub emergency: u8,
}

/// A 24-bit two's-complement fraction of a half circle: latitude and
/// longitude, 180 / 2^23 degrees a step (3.5.1.4).
fn semicircles(b: &[u8]) -> f64 {
    let raw = ((b[0] as i32) << 16 | (b[1] as i32) << 8 | b[2] as i32) << 8 >> 8;
    raw as f64 * 180.0 / 8_388_608.0
}

/// The report in a message's 27 data bytes (the message less its ID), or
/// None where there are fewer.
pub fn read(d: &[u8]) -> Option<Report> {
    if d.len() < 27 {
        return None;
    }
    let altitude = (d[10] as u16) << 4 | (d[11] >> 4) as u16;
    let misc = d[11] & 0x0F;
    let track_kind = match misc & 0x03 {
        1 => "track",
        2 => "magnetic",
        3 => "heading",
        _ => "",
    };
    let speed = (d[13] as u16) << 4 | (d[14] >> 4) as u16;
    let vertical = ((d[14] & 0x0F) as u16) << 8 | d[15] as u16;
    let callsign: String = d[18..26].iter().map(|&b| b as char).collect::<String>().trim().to_owned();
    Some(Report {
        alert: d[0] >> 4 == 1,
        address_type: d[0] & 0x0F,
        address: (d[1] as u32) << 16 | (d[2] as u32) << 8 | d[3] as u32,
        lat: semicircles(&d[4..7]),
        lon: semicircles(&d[7..10]),
        pressure_ft: (altitude != 0xFFF).then(|| altitude as f64 * 25.0 - 1000.0),
        airborne: misc & 0x08 != 0,
        extrapolated: misc & 0x04 != 0,
        track_deg: (!track_kind.is_empty()).then(|| d[16] as f64 * 360.0 / 256.0),
        track_kind: if track_kind.is_empty() { "track" } else { track_kind },
        nic: d[12] >> 4,
        nacp: d[12] & 0x0F,
        speed_kt: (speed != 0xFFF).then_some(speed as f64),
        // 12-bit two's complement; 0x800 is "no vertical rate" (3.5.1.8).
        vertical_fpm: (vertical != 0x800).then(|| (((vertical << 4) as i16) >> 4) as f64 * 64.0),
        emitter: d[17],
        callsign: (!callsign.is_empty()).then_some(callsign),
        emergency: d[26] >> 4,
    })
}

/// The ADS-B emitter category as DO-260B's sets write it (A1 light ... A7
/// rotorcraft, B1 glider ... B7 space vehicle, C1 emergency vehicle ... C5
/// line obstacle), the letter the internet's traffic sends (adsb.lol's
/// `category`): GDL 90's codes 1 to 7, 9 to 15 and 17 to 23 are those
/// three sets in order (3.5.1.10), 0, 8 and 16 their "no information".
pub fn category(emitter: u8) -> Option<String> {
    let (set, n) = match emitter {
        1..=7 => ('A', emitter),
        9..=15 => ('B', emitter - 8),
        17..=23 => ('C', emitter - 16),
        _ => return None,
    };
    Some(format!("{set}{n}"))
}

/// The emergency code as the internet's traffic names it (adsb.lol's
/// `emergency`, readsb's words for DO-260B's codes), None for none.
pub fn emergency_word(code: u8) -> Option<&'static str> {
    match code {
        1 => Some("general"),
        2 => Some("lifeguard"),
        3 => Some("minfuel"),
        4 => Some("nordo"),
        5 => Some("unlawful"),
        6 => Some("downed"),
        _ => None,
    }
}

/// Where the report came from, by its address type (3.5.1.2): ADS-B
/// heard from the airplane itself, TIS-B (radar traffic a ground station
/// sends, AIM 4-5-8), or ADS-R (ADS-B on the other link, rebroadcast, AIM
/// 4-5-7 c), which GDL 90 sends as ADS-B.
pub fn source(address_type: u8) -> &'static str {
    match address_type {
        2 | 3 => "TIS-B",
        4 => "vehicle",
        5 => "beacon",
        _ => "ADS-B",
    }
}

/// The address as the internet's traffic writes it: six lower-case hex
/// digits, a `~` before one that is not an ICAO address (self-assigned, a
/// track file's), as readsb and adsb.lol do, so the two lists merge only
/// on real ICAO addresses.
pub fn hex(address_type: u8, address: u32) -> String {
    let icao = matches!(address_type, 0 | 2);
    format!("{}{address:06x}", if icao { "" } else { "~" })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The specification's Traffic Report example (3.5.4): N825V, ICAO
    /// 52642511 octal, 44.90708 N 122.99488 W, 5,000 ft, airborne, NIC 10,
    /// NACp 9, 123 kt on a true track of 45 degrees, 64 ft/min up, light.
    pub const EXAMPLE: [u8; 28] = [
        0x14, 0x00, 0xAB, 0x45, 0x49, 0x1F, 0xEF, 0x15, 0xA8, 0x89, 0x78, 0x0F, 0x09, 0xA9, 0x07, 0xB0, 0x01, 0x20, 0x01,
        0x4E, 0x38, 0x32, 0x35, 0x56, 0x20, 0x20, 0x20, 0x00,
    ];

    #[test]
    fn the_specifications_traffic_report() {
        let r = read(&EXAMPLE[1..]).unwrap();
        assert_eq!(r.address, 0o52642511);
        assert_eq!(hex(r.address_type, r.address), "ab4549");
        // Within one step of 180 / 2^23 degrees, as the example rounds.
        assert!((r.lat - 44.90708).abs() < 2.2e-5, "{}", r.lat);
        assert!((r.lon + 122.99488).abs() < 2.2e-5, "{}", r.lon);
        assert_eq!(r.pressure_ft, Some(5000.0));
        assert!(r.airborne && !r.extrapolated && !r.alert);
        assert_eq!((r.nic, r.nacp), (10, 9));
        assert_eq!((r.speed_kt, r.vertical_fpm, r.track_deg), (Some(123.0), Some(64.0), Some(45.0)));
        assert_eq!(r.track_kind, "track");
        assert_eq!(category(r.emitter).as_deref(), Some("A1"));
        assert_eq!(r.callsign.as_deref(), Some("N825V"));
        assert_eq!(r.emergency, 0);
    }

    #[test]
    fn edges_of_the_fields() {
        let mut d = EXAMPLE;
        d[11] = 0xFF;
        d[12] = 0xF0; // altitude 0xFFF, on the ground, no track
        d[14] = 0xFF;
        d[15] = 0xFF;
        d[16] = 0xF0; // speed 0xFFF; vertical 0xFF0 = -16 * 64
        d[27] = 0x60;
        let r = read(&d[1..]).unwrap();
        assert_eq!(r.pressure_ft, None);
        assert!(!r.airborne);
        assert_eq!(r.track_deg, None);
        assert_eq!(r.speed_kt, None);
        assert_eq!(r.vertical_fpm, Some(-1024.0));
        assert_eq!(emergency_word(r.emergency), Some("downed"));
        d[15] = 0xF8;
        d[16] = 0x00;
        assert_eq!(read(&d[1..]).unwrap().vertical_fpm, None);
        assert_eq!(category(9).as_deref(), Some("B1"));
        assert_eq!(category(8), None);
        assert_eq!(hex(1, 0xABC), "~000abc");
        assert!(read(&d[1..20]).is_none());
    }
}
