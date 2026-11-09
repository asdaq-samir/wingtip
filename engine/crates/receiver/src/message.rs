//! GDL 90's messages by their ID (Data Interface Specification,
//! 560-1058-00 Rev A, Table 2), and the one extension portable receivers
//! add that the app reads: ForeFlight's ID message (0x65, "GDL 90
//! Extended Specification"), which Stratux, Sentry and uAvionix's
//! receivers send with their names.

use crate::report::{self, Report};

/// The Heartbeat (ID 0, 3.1): the receiver's own state, once a second.
#[derive(Clone, Debug, PartialEq)]
pub struct Heartbeat {
    /// Status Byte 1, bit 7: its GPS position is valid.
    pub gps_valid: bool,
    /// Bit 6: it needs maintenance.
    pub maintenance: bool,
    /// Bit 3: its GPS battery is low.
    pub battery_low: bool,
    /// Bit 0: its UAT radio is initialised.
    pub uat_ok: bool,
    /// Status Byte 2, bit 0: its clock is set to UTC.
    pub utc_ok: bool,
    /// The time stamp, seconds since 0000Z (Status Byte 2's bit 7 is its
    /// 17th bit).
    pub seconds_of_day: u32,
    /// Uplink messages heard in the last second (Message Counts' top 5
    /// bits).
    pub uplinks: u8,
}

/// The Ownship Geometric Altitude (ID 11, 3.8): GPS height in 5 ft steps,
/// above the WGS-84 ellipsoid unless the receiver says it is MSL (the ID
/// message's capabilities), and its Vertical Figure of Merit.
#[derive(Clone, Debug, PartialEq)]
pub struct Geometric {
    pub altitude_ft: f64,
    pub vertical_warning: bool,
    /// The VFOM, metres; None where 0x7FFF, not available.
    pub vfom_m: Option<f64>,
}

/// The receiver's name and the datum of its GPS heights, from
/// ForeFlight's ID message (0x65, sub-ID 0).
#[derive(Clone, Debug, PartialEq)]
pub struct Identity {
    pub name: String,
    pub long_name: String,
    /// Capabilities bit 0: geometric altitudes are above mean sea level,
    /// else above the WGS-84 ellipsoid.
    pub msl: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Message {
    Heartbeat(Heartbeat),
    Ownship(Report),
    Geometric(Geometric),
    Traffic(Report),
    /// An Uplink Data message's 432-byte UAT uplink payload (ID 7, 3.3).
    Uplink(Vec<u8>),
    Identity(Identity),
    /// Stratux's own heartbeat (0xCC) or status (0x53): a Stratux, which
    /// may send no ID message.
    Stratux,
    /// One the app has no use for (Initialization, Height Above Terrain,
    /// the pass-through reports, AHRS) or too short: its ID.
    Other(u8),
}

/// The text of a fixed-width field: its bytes up to the first NUL, the
/// spaces either side taken off.
fn text(b: &[u8]) -> String {
    let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
    String::from_utf8_lossy(&b[..end]).trim().to_owned()
}

/// A clear message (ID and data) read.
pub fn read(m: &[u8]) -> Message {
    let Some((&id, d)) = m.split_first() else { return Message::Other(0) };
    match id {
        0x00 if d.len() >= 6 => Message::Heartbeat(Heartbeat {
            gps_valid: d[0] & 0x80 != 0,
            maintenance: d[0] & 0x40 != 0,
            battery_low: d[0] & 0x08 != 0,
            uat_ok: d[0] & 0x01 != 0,
            utc_ok: d[1] & 0x01 != 0,
            seconds_of_day: ((d[1] >> 7) as u32) << 16 | (d[3] as u32) << 8 | d[2] as u32,
            uplinks: d[4] >> 3,
        }),
        0x07 if d.len() >= 3 + 432 => Message::Uplink(d[3..3 + 432].to_vec()),
        0x0A => report::read(d).map_or(Message::Other(id), Message::Ownship),
        0x0B if d.len() >= 4 => {
            let metrics = u16::from_be_bytes([d[2], d[3]]);
            let vfom = metrics & 0x7FFF;
            Message::Geometric(Geometric {
                altitude_ft: i16::from_be_bytes([d[0], d[1]]) as f64 * 5.0,
                vertical_warning: metrics & 0x8000 != 0,
                vfom_m: (vfom != 0x7FFF).then_some(vfom as f64),
            })
        }
        0x14 => report::read(d).map_or(Message::Other(id), Message::Traffic),
        0x65 if d.len() >= 38 && d[0] == 0 => Message::Identity(Identity {
            name: text(&d[10..18]),
            long_name: text(&d[18..34]),
            msl: u32::from_be_bytes([d[34], d[35], d[36], d[37]]) & 1 == 1,
        }),
        0xCC | 0x53 => Message::Stratux,
        _ => Message::Other(id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_specifications_heartbeat() {
        let Message::Heartbeat(h) = read(&[0x00, 0x81, 0x41, 0xDB, 0xD0, 0x08, 0x02]) else { panic!() };
        assert!(h.gps_valid && h.uat_ok && h.utc_ok && !h.maintenance && !h.battery_low);
        // 0xD0DB s after 0000Z: 14:51:07Z.
        assert_eq!(h.seconds_of_day, 53_467);
        assert_eq!(h.uplinks, 1);
    }

    #[test]
    fn geometric_altitude_and_identity() {
        let Message::Geometric(g) = read(&[0x0B, 0x00, 0xC8, 0x00, 0x0A]) else { panic!() };
        assert_eq!((g.altitude_ft, g.vfom_m, g.vertical_warning), (1000.0, Some(10.0), false));
        let Message::Geometric(g) = read(&[0x0B, 0xFF, 0xFF, 0xFF, 0xFF]) else { panic!() };
        assert_eq!((g.altitude_ft, g.vfom_m, g.vertical_warning), (-5.0, None, true));
        let mut id = vec![0x65, 0x00, 0x01];
        id.extend([0xFF; 8]);
        id.extend(b"Sentry\0\0");
        id.extend(b"Sentry ADS-B\0\0\0\0");
        id.extend([0, 0, 0, 1]);
        let Message::Identity(i) = read(&id) else { panic!() };
        assert_eq!((i.name.as_str(), i.long_name.as_str(), i.msl), ("Sentry", "Sentry ADS-B", true));
        assert_eq!(read(&[0xCC, 0x03]), Message::Stratux);
        assert_eq!(read(&[0x0A, 0x00]), Message::Other(0x0A));
    }
}
