//! The receivers the app supports, each as a GDL 90 stream of the shape it
//! sends (apps/web/src/lib/fixtures/gdl90-receivers.json): who it says it
//! is (ForeFlight's ID message, or Stratux's own 0xCC), the datum of its
//! GPS heights, and its own ship with a good fix, a weak one and none.
//! Built here from the specification's layouts (GDL 90 Data Interface
//! Specification, 560-1058-00 Rev A, 3.1, 3.4, 3.8; ForeFlight's GDL 90
//! Extended Specification's ID message), not recorded from the units: each
//! receiver's datum is read from its ID message as the app runs, so the
//! samples hold both datums to the rules rather than vouching for a unit.
//! `WRITE_GDL90_RECEIVERS=1 cargo test -p wingtip-receiver --test
//! receivers` writes the fixture afresh.

use wingtip_receiver::frame::framed;

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// ForeFlight's ID message (0x65, sub-ID 0): its names, and capabilities
/// bit 0, "1: MSL", else "0: WGS-84 ellipsoid (as the GDL90 spec states)".
fn id(short: &str, long: &str, msl: bool) -> Vec<u8> {
    let mut m = vec![0x65, 0x00, 0x01];
    m.extend([0xFF; 8]);
    let mut name = short.as_bytes().to_vec();
    name.resize(8, 0);
    m.extend(name);
    let mut long = long.as_bytes().to_vec();
    long.resize(16, 0);
    m.extend(long);
    m.extend([0, 0, 0, u8::from(msl)]);
    m
}

/// A Heartbeat (3.1): GPS Pos Valid (Status Byte 1 bit 7) and UAT
/// initialised (bit 0); UTC OK; one uplink a second.
fn heartbeat(gps: bool) -> Vec<u8> {
    vec![0x00, if gps { 0x81 } else { 0x01 }, 0x41, 0xDB, 0xD0, 0x08, 0x02]
}

/// An Ownship Report (3.4, laid out as 3.5.1): N12345 airborne at 110 kt
/// on a true track of 090.
fn ownship(lat: f64, lon: f64, pressure_ft: i32, nic: u8, nacp: u8) -> Vec<u8> {
    let (kt, track_deg) = (110u16, 90.0_f64);
    let step = 180.0 / 8_388_608.0;
    let (la, lo) = ((lat / step).round() as i32, (lon / step).round() as i32);
    let alt = ((pressure_ft + 1000) / 25) as u16;
    let mut m = vec![0x0A, 0x00, 0xA1, 0x23, 0x45];
    m.extend(&la.to_be_bytes()[1..]);
    m.extend(&lo.to_be_bytes()[1..]);
    // Misc 0x9: airborne, true track; vertical rate 0.
    m.extend([(alt >> 4) as u8, ((alt & 0x0F) as u8) << 4 | 0x09, nic << 4 | nacp, (kt >> 4) as u8, ((kt & 0x0F) << 4) as u8, 0x00]);
    m.push((track_deg / (360.0 / 256.0)).round() as u8);
    m.push(0x01);
    m.extend(b"N12345  ");
    m.push(0x00);
    m
}

/// No fix: 0, 0 with NIC and NACp 0, as receivers send it.
fn no_fix() -> Vec<u8> {
    let mut m = vec![0x0A, 0x00, 0xA1, 0x23, 0x45, 0, 0, 0, 0, 0, 0, 0xFF, 0xF0, 0x00, 0xFF, 0xF8, 0x00, 0x00, 0x01];
    m.extend(b"N12345  ");
    m.push(0x00);
    m
}

/// The Ownship Geometric Altitude (3.8): 5 ft steps, VFOM in metres.
fn geometric(ft: i32, vfom_m: u16) -> Vec<u8> {
    let steps = (ft / 5) as i16;
    let [a, b] = steps.to_be_bytes();
    vec![0x0B, a, b, (vfom_m >> 8) as u8 & 0x7F, vfom_m as u8]
}

fn datagram(messages: &[Vec<u8>]) -> String {
    hex(&messages.iter().flat_map(|m| framed(m)).collect::<Vec<u8>>())
}

/// Each sample: the receiver, its datagram, and what the rules must say.
fn samples() -> Vec<(&'static str, String, &'static str)> {
    let own = ownship(41.95, -87.9, 3000, 8, 10);
    vec![
        // Stratux: its own heartbeat (0xCC), the ID message as "Stratux"
        // with MSL heights, a fix of NIC 8 and NACp 10.
        (
            "stratux",
            datagram(&[vec![0xCC, 0x02, 0x00], id("Stratux", "Stratux", true), heartbeat(true), own.clone(), geometric(3200, 10)]),
            r#"{"name":"Stratux","source":"receiver","receiver":"good","altitude_ft":3200,"accuracy_m":10}"#,
        ),
        // Sentry: the ID message, MSL heights.
        (
            "sentry",
            datagram(&[id("Sentry", "Sentry ADS-B", true), heartbeat(true), own.clone(), geometric(3200, 10)]),
            r#"{"name":"Sentry","source":"receiver","receiver":"good","altitude_ft":3200,"accuracy_m":10}"#,
        ),
        // SkyEcho: the ID message with heights above the ellipsoid, GDL
        // 90's own datum: a position, and the height left for a geoid.
        (
            "skyecho",
            datagram(&[id("SkyEcho", "uAvionix SkyEcho", false), heartbeat(true), own.clone(), geometric(3100, 10)]),
            r#"{"name":"SkyEcho","source":"receiver","receiver":"good","altitude_ft":null,"ellipsoid_ft":3100}"#,
        ),
        // A Stratus in its open GDL 90 mode, which sends no ID message:
        // no name, the specification's ellipsoid.
        (
            "stratus-open",
            datagram(&[heartbeat(true), own.clone(), geometric(3100, 10)]),
            r#"{"name":null,"source":"receiver","receiver":"good","altitude_ft":null,"ellipsoid_ft":3100}"#,
        ),
        // A Stratux with no GPS fix yet: the Heartbeat says so, own ship
        // is sent at 0, 0.
        (
            "stratux-no-fix",
            datagram(&[vec![0xCC, 0x02, 0x00], id("Stratux", "Stratux", true), heartbeat(false), no_fix()]),
            r#"{"name":"Stratux","source":"none","receiver":"no_gps"}"#,
        ),
        // A fix under 91.227's floor: NACp 7 (under 0.1 nm, not 0.05).
        (
            "sentry-weak",
            datagram(&[id("Sentry", "Sentry ADS-B", true), heartbeat(true), ownship(41.95, -87.9, 3000, 8, 7)]),
            r#"{"name":"Sentry","source":"none","receiver":"weak"}"#,
        ),
    ]
}

#[test]
fn the_fixtures_receivers_are_what_the_builders_give() {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../apps/web/src/lib/fixtures/gdl90-receivers.json");
    let samples = samples();
    if std::env::var_os("WRITE_GDL90_RECEIVERS").is_some() {
        let mut out = String::from(
            "{\n  \"about\": \"The receivers the app supports, each as a GDL 90 datagram of the shape it sends, built by engine/crates/receiver/tests/receivers.rs from the specification's layouts (560-1058-00 Rev A 3.1, 3.4, 3.8; ForeFlight's ID message), not recorded from the units. Each is read by receiver_read at 'at' and own ship asked of receiver_position with no device fix; 'expect' is what the rules must answer, from 14 CFR 91.227(c)(1)'s NIC 7 and NACp 8 and the ID message's datum bit.\",\n  \"at\": 1763740800,\n  \"receivers\": [\n",
        );
        for (i, (name, data, expect)) in samples.iter().enumerate() {
            out.push_str(&format!("    {{ \"receiver\": \"{name}\", \"hex\": \"{data}\", \"expect\": {expect} }}"));
            out.push_str(if i + 1 < samples.len() { ",\n" } else { "\n" });
        }
        out.push_str("  ]\n}\n");
        std::fs::write(&path, out).unwrap();
    }
    let fixture = std::fs::read_to_string(&path).unwrap();
    for (name, data, _) in &samples {
        assert!(fixture.contains(&format!("\"{data}\"")), "gdl90-receivers.json does not hold {name}'s datagram");
    }
}
