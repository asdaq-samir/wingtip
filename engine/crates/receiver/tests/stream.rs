//! The shared fixture's byte stream (apps/web/src/lib/fixtures/gdl90.json),
//! built here from the specification's own examples and the uplink a
//! ground station near Chicago would send, so the stream in the fixture is
//! what these builders give. `WRITE_GDL90=1 cargo test -p wingtip-receiver
//! --test stream -- --nocapture` prints it afresh.

use wingtip_receiver::frame::framed;
use wingtip_receiver::{dlac, fisb, nexrad, uplink};

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Each datagram of the stream, as a receiver sends them a second apart.
fn stream() -> Vec<Vec<u8>> {
    // ForeFlight's ID message: "Sentry", GPS heights MSL.
    let mut id = vec![0x65, 0x00, 0x01];
    id.extend([0xFF; 8]);
    id.extend(b"Sentry\0\0");
    id.extend(b"Sentry ADS-B\0\0\0\0");
    id.extend([0, 0, 0, 1]);
    // The specification's Heartbeat (2.2.4).
    let heartbeat = [0x00, 0x81, 0x41, 0xDB, 0xD0, 0x08, 0x02];
    // Own ship: N12345, ICAO A12345, 41.95 N 87.9 W, 3,000 ft pressure
    // altitude, airborne, NIC 8 NACp 9, 110 kt on 090 true, level.
    let lat = (41.95_f64 / (180.0 / 8_388_608.0)).round() as i32;
    let lon = (-87.9_f64 / (180.0 / 8_388_608.0)).round() as i32;
    let alt = ((3000 + 1000) / 25) as u16;
    let mut own = vec![0x0A, 0x00, 0xA1, 0x23, 0x45];
    own.extend(&lat.to_be_bytes()[1..]);
    own.extend(&lon.to_be_bytes()[1..]);
    own.extend([(alt >> 4) as u8, ((alt & 0x0F) as u8) << 4 | 0x09, 0x89, (110 >> 4) as u8, ((110 & 0x0F) << 4) as u8, 0x00, 0x40, 0x01]);
    own.extend(b"N12345  ");
    own.push(0x00);
    // Ownship Geometric Altitude: 3,200 ft, VFOM 10 m.
    let geo = [0x0B, (640u16 >> 8) as u8, 640u16 as u8, 0x00, 0x0A];
    // The specification's Traffic Report (3.5.4): N825V.
    let traffic = [
        0x14, 0x00, 0xAB, 0x45, 0x49, 0x1F, 0xEF, 0x15, 0xA8, 0x89, 0x78, 0x0F, 0x09, 0xA9, 0x07, 0xB0, 0x01, 0x20, 0x01, 0x4E, 0x38, 0x32,
        0x35, 0x56, 0x20, 0x20, 0x20, 0x00,
    ];
    // An uplink from a station at 41.9 N 87.9 W: O'Hare's METAR and TAF
    // (generic text, 413), a TFR's text (NOTAM, 8) and one regional
    // NEXRAD block over the field (63), levels 3 and 5 in its north row.
    let text =
        dlac::encode("METAR KORD 091453Z 27012KT 10SM FEW050 08/M02 A3012\u{1e}TAF KORD 091120Z 0912/1018 27012KT P6SM SCT050\u{1e}");
    let tfr = fisb::twgo_built("KZAU", 4321, true, "TFR 6/1234 CHICAGO IL SFC-3000FT");
    let mut bins = vec![0u8; nexrad::BINS];
    bins[0..4].copy_from_slice(&[3, 3, 5, 5]);
    let block = nexrad::built(628 * 450 + 340, 0, &bins);
    let payload = uplink::built(41.9, -87.9, &[(413, 14, 53, &text), (8, 14, 50, &tfr), (63, 14, 52, &block)]);
    let mut up = vec![0x07, 0xFF, 0xFF, 0xFF];
    up.extend(payload);

    let mut first = framed(&id);
    first.extend(framed(&heartbeat));
    first.extend(framed(&own));
    first.extend(framed(&geo));
    first.extend(framed(&traffic));
    let mut second = framed(&heartbeat);
    second.extend(framed(&up));
    // A frame damaged on the way, which is dropped.
    let mut hurt = framed(&traffic);
    hurt[5] ^= 0x10;
    second.extend(hurt);
    vec![first, second]
}

#[test]
fn the_fixtures_stream_is_what_the_builders_give() {
    let datagrams: Vec<String> = stream().iter().map(|d| hex(d)).collect();
    if std::env::var_os("WRITE_GDL90").is_some() {
        for d in &datagrams {
            println!("{d}");
        }
    }
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../apps/web/src/lib/fixtures/gdl90.json");
    let fixture = std::fs::read_to_string(path).unwrap();
    for d in &datagrams {
        assert!(fixture.contains(&format!("\"{d}\"")), "gdl90.json does not hold the datagram {d}");
    }
}
