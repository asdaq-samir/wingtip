//! A UAT ground station's uplink, as GDL 90's Uplink Data message carries
//! it (RTCA DO-282B, 2.2.3.2): an 8-byte header saying where the station
//! is, then Information Frames, each a FIS-B APDU (DO-358B's Application
//! Protocol Data Units) or another frame type the app does not read. The
//! layout is the one the open decoders read (FlightAware's dump978,
//! uat_decode.c), checked against the frames a Stratux records.

/// One FIS-B product as an APDU carries it (DO-358B, 2.2.2): the product
/// ID, the time its data is of, and its payload.
#[derive(Clone, Debug, PartialEq)]
pub struct Apdu {
    pub product: u16,
    pub hours: u8,
    pub minutes: u8,
    /// The segmentation flag: a product cut into pieces across APDUs,
    /// which the app does not join (text products fit one).
    pub segmented: bool,
    pub payload: Vec<u8>,
}

/// The ground station that sent an uplink, and the APDUs in it.
#[derive(Clone, Debug, PartialEq)]
pub struct Uplink {
    pub station_lat: f64,
    pub station_lon: f64,
    pub apdus: Vec<Apdu>,
}

/// The FIS-B frame type (DO-282B, Information Frame's type 0); the others
/// (TIS-B site and developmental frames) are passed over.
const FISB: u8 = 0;

/// The uplink in a 432-byte payload; None where the header says its
/// application data is not valid.
pub fn read(p: &[u8]) -> Option<Uplink> {
    if p.len() < 8 {
        return None;
    }
    // 23 bits of latitude and 24 of longitude, 360 / 2^24 degrees a step.
    let raw_lat = (p[0] as u32) << 15 | (p[1] as u32) << 7 | (p[2] >> 1) as u32;
    let raw_lon = ((p[2] & 1) as u32) << 23 | (p[3] as u32) << 15 | (p[4] as u32) << 7 | (p[5] >> 1) as u32;
    let step = 360.0 / 16_777_216.0;
    let mut station_lat = raw_lat as f64 * step;
    if station_lat > 90.0 {
        station_lat -= 180.0;
    }
    let mut station_lon = raw_lon as f64 * step;
    if station_lon > 180.0 {
        station_lon -= 360.0;
    }
    let app_data_valid = p[6] & 0x20 != 0;
    if !app_data_valid {
        return None;
    }
    let mut apdus = Vec::new();
    let data = &p[8..];
    let mut at = 0;
    while at + 2 <= data.len() {
        let length = (data[at] as usize) << 1 | (data[at + 1] >> 7) as usize;
        let kind = data[at + 1] & 0x0F;
        // Length and type both zero: the rest is padding.
        if length == 0 && kind == 0 {
            break;
        }
        let end = at + 2 + length;
        if end > data.len() {
            break;
        }
        if kind == FISB {
            if let Some(apdu) = apdu(&data[at + 2..end]) {
                apdus.push(apdu);
            }
        }
        at = end;
    }
    Some(Uplink { station_lat, station_lon, apdus })
}

/// An APDU's header and payload (DO-358B, 2.2.2): the A, G, P and S
/// flags, an 11-bit product ID, and the time options that say whether
/// the month and day and the seconds are sent.
fn apdu(f: &[u8]) -> Option<Apdu> {
    if f.len() < 4 {
        return None;
    }
    let product = ((f[0] & 0x1F) as u16) << 6 | (f[1] >> 2) as u16;
    let segmented = f[1] & 0x02 != 0;
    let t_opt = (f[1] & 0x01) << 1 | f[2] >> 7;
    let (hours, minutes, start) = match t_opt {
        0 => ((f[2] & 0x7C) >> 2, (f[2] & 0x03) << 4 | f[3] >> 4, 4),
        1 => ((f[2] & 0x7C) >> 2, (f[2] & 0x03) << 4 | f[3] >> 4, 5),
        2 => ((f[3] & 0x3E) >> 1, (f[3] & 0x01) << 5 | f.get(4)? >> 3, 5),
        _ => ((f[3] & 0x3E) >> 1, (f[3] & 0x01) << 5 | f.get(4)? >> 3, 6),
    };
    let payload = f.get(start..)?.to_vec();
    Some(Apdu { product, hours, minutes, segmented, payload })
}

/// An uplink payload built as a ground station sends one, for the tests
/// and fixtures: a station at a point and FIS-B frames with an hours-
/// and-minutes time (t_opt 0).
pub fn built(lat: f64, lon: f64, apdus: &[(u16, u8, u8, &[u8])]) -> Vec<u8> {
    let step = 360.0 / 16_777_216.0;
    let raw_lat = ((if lat < 0.0 { lat + 180.0 } else { lat }) / step).round() as u32;
    let raw_lon = ((if lon < 0.0 { lon + 360.0 } else { lon }) / step).round() as u32;
    let mut p = vec![
        (raw_lat >> 15) as u8,
        (raw_lat >> 7) as u8,
        ((raw_lat << 1) as u8) | (raw_lon >> 23) as u8 & 1,
        (raw_lon >> 15) as u8,
        (raw_lon >> 7) as u8,
        ((raw_lon << 1) as u8) | 1,
        0x20,
        0,
    ];
    for &(product, hours, minutes, payload) in apdus {
        let mut f = vec![(product >> 6) as u8 & 0x1F, ((product & 0x3F) << 2) as u8, hours << 2 | minutes >> 4, minutes << 4];
        f.extend_from_slice(payload);
        p.push((f.len() >> 1) as u8);
        p.push(((f.len() & 1) << 7) as u8 | FISB);
        p.extend(f);
    }
    p.resize(432, 0);
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_station_and_its_products() {
        let p = built(41.9, -87.9, &[(413, 14, 53, b"abc"), (63, 14, 50, &[1, 2, 3, 4])]);
        let u = read(&p).unwrap();
        assert!((u.station_lat - 41.9).abs() < 1e-4 && (u.station_lon + 87.9).abs() < 1e-4);
        assert_eq!(u.apdus.len(), 2);
        assert_eq!((u.apdus[0].product, u.apdus[0].hours, u.apdus[0].minutes), (413, 14, 53));
        assert_eq!(u.apdus[0].payload, b"abc");
        assert_eq!((u.apdus[1].product, u.apdus[1].payload.len()), (63, 4));
        let mut off = p.clone();
        off[6] = 0;
        assert!(read(&off).is_none());
    }
}
