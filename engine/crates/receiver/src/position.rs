//! Own ship from the receiver's GPS: whether its Ownship Report is a fix
//! to fly the moving map by, and whether it or the device's own position
//! is the one to show. A Wi-Fi iPad has no GPS of its own, so in the air
//! the receiver's is the only position it has; a phone has its own, and
//! the better of the two is used, the other taken back the moment the one
//! in use goes stale.

use wingtip_core::json::{self, Value};
use wingtip_core::units::M_PER_NM;

/// A fix older than this, s, is not shown as own ship: AC 120-76D
/// 11.17.2.3 takes the airplane off an airport moving map once its
/// position is three seconds old, and a receiver sends its Ownship Report
/// once a second (GDL 90 Data Interface Specification, 560-1058-00 Rev A,
/// 3.4), so three is two reports missed. The same bar for the device's
/// fix when the two are weighed against each other.
pub const STALE_S: f64 = 3.0;

/// The Navigation Integrity Category and Navigation Accuracy Category for
/// Position (GDL 90 3.5.1.6, DO-260B's codes) a report must reach: the
/// floor 14 CFR 91.227(c)(1) sets for ADS-B Out itself, "The aircraft's
/// NACP must be less than 0.05 nautical miles" (NACp 8) and "The
/// aircraft's NIC must be less than 0.2 nautical miles" (NIC 7). A
/// receiver whose GPS cannot say as much of itself is no better than a
/// guess, and NIC 0 or NACp 0 is DO-260B's "unknown".
pub const MIN_NIC: u8 = 7;
pub const MIN_NACP: u8 = 8;

/// The bound, metres, on the 95% horizontal error a NACp gives (DO-260B's
/// Estimated Position Uncertainty): 8 under 0.05 nm (92.6 m), 9 under
/// 30 m, 10 under 10 m, 11 under 3 m. Only those 91.227's floor admits.
pub fn epu_m(nacp: u8) -> Option<f64> {
    match nacp {
        8 => Some(0.05 * M_PER_NM),
        9 => Some(30.0),
        10 => Some(10.0),
        11 => Some(3.0),
        _ => None,
    }
}

/// The device's accuracy, a radius of about 68% (Android's
/// Location.getAccuracy says so; Core Location's horizontalAccuracy says
/// no level, taken as the same), put on the EPU's 95%: twice it, a
/// design choice near the 2.45 a circular normal error gives, so the
/// device is not favoured for stating a smaller share of its errors.
pub const DEVICE_TO_95: f64 = 2.0;

/// The source in use stays until the other is better by this factor, so
/// two fixes of about the same accuracy do not swap the label and the
/// trail each second. A design choice.
pub const SWAP_FACTOR: f64 = 2.0;

/// Pressure altitude is shown as a flight level at and above 18,000 ft
/// MSL, where the altimeter is set to 29.92 (14 CFR 91.121(a)(2)) and a
/// flight level is "a level of constant atmospheric pressure related to a
/// reference datum of 29.92 inches of mercury" (14 CFR 1.1). Below it
/// the height shown is the GPS's, MSL.
pub const FLIGHT_LEVELS_FROM_FT: f64 = 18_000.0;

fn num(v: &Value, k: &str) -> Option<f64> {
    v.get(k).and_then(Value::as_f64)
}
fn flag(v: &Value, k: &str) -> bool {
    matches!(v.get(k), Some(Value::Bool(true)))
}

/// Why the receiver's fix is not used, or "good" where it is fit to be.
fn receiver_state(own: Option<&Value>, receiver: Option<&Value>, at: f64) -> &'static str {
    let Some(r) = receiver else { return "none" };
    if !flag(r, "live") {
        return "none";
    }
    // The Heartbeat's "GPS Pos Valid" (GDL 90 3.1.1, Status Byte 1 bit 7).
    if !flag(r, "gps") {
        return "no_gps";
    }
    let Some(own) = own else { return "no_gps" };
    let (lat, lon) = (num(own, "lat").unwrap_or(0.0), num(own, "lon").unwrap_or(0.0));
    if lat == 0.0 && lon == 0.0 {
        return "no_gps";
    }
    if flag(own, "extrapolated") || num(own, "at").is_none_or(|t| at - t > STALE_S) {
        return "stale";
    }
    let nic = num(own, "nic").unwrap_or(0.0) as u8;
    let nacp = num(own, "nacp").unwrap_or(0.0) as u8;
    if nic < MIN_NIC || nacp < MIN_NACP {
        return "weak";
    }
    "good"
}

/// Which fix own ship is: the receiver's ("good" and either the device has
/// none fit to weigh, or it is the better), else the device's where there
/// is one, else none. `was` keeps the one in use until the other is
/// better by SWAP_FACTOR.
fn choose(state: &str, epu: f64, device: Option<&Value>, was: Option<&str>, at: f64) -> &'static str {
    let device_95 = device
        .filter(|d| num(d, "at").is_some_and(|t| at - t <= STALE_S))
        .and_then(|d| num(d, "accuracy_m"))
        .filter(|a| *a > 0.0)
        .map(|a| a * DEVICE_TO_95);
    if state != "good" {
        return if device.is_some() { "device" } else { "none" };
    }
    let Some(device_95) = device_95 else { return "receiver" };
    if was == Some("receiver") {
        if device_95 * SWAP_FACTOR < epu {
            "device"
        } else {
            "receiver"
        }
    } else if epu * SWAP_FACTOR < device_95 {
        "receiver"
    } else {
        "device"
    }
}

/// The rule `receiver_position`.
pub fn position(v: &Value) -> Result<String, String> {
    let at = num(v, "at").ok_or("receiver_position: \"at\" is missing")?;
    let own = v.get("ownship").filter(|o| !matches!(o, Value::Null));
    let receiver = v.get("receiver").filter(|r| !matches!(r, Value::Null));
    let device = v.get("device").filter(|d| !matches!(d, Value::Null));
    let was = v.get("was").and_then(Value::as_str);
    let state = receiver_state(own, receiver, at);
    let epu = own.and_then(|o| epu_m(num(o, "nacp").unwrap_or(0.0) as u8)).unwrap_or(f64::INFINITY);
    let source = choose(state, epu, device, was, at);

    let mut out = String::from("{\"source\":");
    json::string(&mut out, source);
    out.push_str(",\"receiver\":");
    json::string(&mut out, state);
    out.push_str(",\"fix\":");
    match own.filter(|_| source == "receiver") {
        None => out.push_str("null"),
        Some(o) => fix(&mut out, o, receiver.is_some_and(|r| flag(r, "msl")), epu),
    }
    out.push('}');
    Ok(out)
}

/// The receiver's fix as own ship takes it. Its height is the GPS's
/// (GDL 90 3.8's geometric altitude) where the receiver says that is MSL
/// (ForeFlight's ID message, capabilities bit 0: "0: WGS-84 ellipsoid (as
/// the GDL90 spec states)", "1: MSL"); above the ellipsoid it is given as
/// `ellipsoid_ft` alone, for a host with a geoid model to convert (over
/// the US the geoid is 30 to 115 ft below the ellipsoid, too much to show
/// as MSL), and none where its Vertical Warning is set. The track is the
/// report's only where it is a true track (3.5.1.5): a heading is not
/// where the airplane goes.
fn fix(out: &mut String, o: &Value, msl: bool, epu: f64) {
    let geometric = num(o, "geometric_ft").filter(|_| !flag(o, "vertical_warning"));
    let pressure = num(o, "pressure_ft");
    let altitude = geometric.filter(|_| msl);
    let true_track = o.get("track_kind").and_then(Value::as_str) == Some("track");
    let level_at = altitude.or(pressure);
    let flight_level = pressure.filter(|_| level_at.is_some_and(|ft| ft >= FLIGHT_LEVELS_FROM_FT)).map(|ft| (ft / 100.0).round());
    out.push_str("{\"lat\":");
    json::number(out, num(o, "lat").unwrap_or(0.0));
    out.push_str(",\"lon\":");
    json::number(out, num(o, "lon").unwrap_or(0.0));
    out.push_str(",\"altitude_ft\":");
    json::opt_number(out, altitude);
    out.push_str(",\"ellipsoid_ft\":");
    json::opt_number(out, geometric.filter(|_| !msl));
    out.push_str(",\"pressure_ft\":");
    json::opt_number(out, pressure);
    out.push_str(",\"flight_level\":");
    json::opt_number(out, flight_level);
    out.push_str(",\"track_deg\":");
    json::opt_number(out, num(o, "track_deg").filter(|_| true_track));
    out.push_str(",\"groundspeed_kt\":");
    json::opt_number(out, num(o, "speed_kt"));
    out.push_str(",\"vertical_fpm\":");
    json::opt_number(out, num(o, "vertical_fpm"));
    out.push_str(",\"accuracy_m\":");
    json::number(out, epu);
    out.push_str(",\"airborne\":");
    out.push_str(if flag(o, "airborne") { "true" } else { "false" });
    out.push_str(",\"at\":");
    json::number(out, num(o, "at").unwrap_or(0.0));
    out.push('}');
}

#[cfg(test)]
mod tests {
    use super::*;
    use wingtip_core::json::parse;

    fn ask(input: &str) -> Value {
        parse(&position(&parse(input).unwrap()).unwrap()).unwrap()
    }

    const LIVE: &str = r#"{"live":true,"gps":true,"msl":true}"#;

    fn own(nic: u8, nacp: u8, at: f64) -> String {
        format!(
            r#"{{"lat":41.95,"lon":-87.9,"nic":{nic},"nacp":{nacp},"at":{at},"pressure_ft":3000,"geometric_ft":3200,
            "track_deg":90,"track_kind":"track","speed_kt":110,"vertical_fpm":0,"airborne":true,"extrapolated":false}}"#
        )
    }

    #[test]
    fn the_floor_is_91_227s() {
        // NIC 7 and NACp 8 are 91.227(c)(1)'s 0.2 nm and 0.05 nm: in; one
        // below either: out.
        let at = 100.0;
        let good = ask(&format!(r#"{{"at":{at},"receiver":{LIVE},"ownship":{}}}"#, own(7, 8, at)));
        assert_eq!((good.get("source").unwrap().as_str(), good.get("receiver").unwrap().as_str()), (Some("receiver"), Some("good")));
        let fix = good.get("fix").unwrap();
        assert!((fix.get("accuracy_m").unwrap().as_f64().unwrap() - 92.6).abs() < 1e-9);
        assert_eq!(fix.get("altitude_ft").unwrap().as_f64(), Some(3200.0));
        assert_eq!(fix.get("flight_level").unwrap().as_f64(), None);
        for (nic, nacp) in [(6, 8), (7, 7), (0, 0)] {
            let weak = ask(&format!(r#"{{"at":{at},"receiver":{LIVE},"ownship":{}}}"#, own(nic, nacp, at)));
            assert_eq!(weak.get("receiver").unwrap().as_str(), Some("weak"), "NIC {nic} NACp {nacp}");
            assert_eq!(weak.get("source").unwrap().as_str(), Some("none"));
        }
    }

    #[test]
    fn three_seconds_and_it_hands_back() {
        // 3 s old is still the receiver's (AC 120-76D 11.17.2.3's three
        // seconds); 3.1 s and the device's fix is taken back.
        let device = r#"{"accuracy_m":5,"at":0}"#;
        let fresh = ask(&format!(r#"{{"at":103,"receiver":{LIVE},"ownship":{},"device":{device},"was":"receiver"}}"#, own(8, 10, 100.0)));
        assert_eq!(fresh.get("source").unwrap().as_str(), Some("receiver"));
        let stale = ask(&format!(r#"{{"at":103.1,"receiver":{LIVE},"ownship":{},"device":{device},"was":"receiver"}}"#, own(8, 10, 100.0)));
        assert_eq!((stale.get("source").unwrap().as_str(), stale.get("receiver").unwrap().as_str()), (Some("device"), Some("stale")));
        assert!(matches!(stale.get("fix"), Some(Value::Null)));
        // No GPS by the Heartbeat, or the receiver not heard.
        let no_gps = ask(&format!(r#"{{"at":100,"receiver":{{"live":true,"gps":false}},"ownship":{}}}"#, own(8, 10, 100.0)));
        assert_eq!(no_gps.get("receiver").unwrap().as_str(), Some("no_gps"));
        let gone = ask(&format!(r#"{{"at":100,"receiver":{{"live":false,"gps":true}},"ownship":{}}}"#, own(8, 10, 100.0)));
        assert_eq!(gone.get("receiver").unwrap().as_str(), Some("none"));
    }

    #[test]
    fn the_better_fix_with_a_margin() {
        let own = own(8, 9, 100.0); // EPU under 30 m
        let with = |acc: f64, was: &str| {
            let v =
                ask(&format!(r#"{{"at":100,"receiver":{LIVE},"ownship":{own},"device":{{"accuracy_m":{acc},"at":99.5}},"was":{was}}}"#));
            v.get("source").unwrap().as_str().unwrap().to_owned()
        };
        // A Wi-Fi iPad's position from the network, 65 m (130 m at 95%):
        // the receiver's 30 m is better by more than twice.
        assert_eq!(with(65.0, "\"device\""), "receiver");
        // A phone's 10 m (20 m at 95%) against 30 m: the phone's kept,
        // and the receiver's kept once in use too, within the margin.
        assert_eq!(with(10.0, "\"device\""), "device");
        assert_eq!(with(10.0, "\"receiver\""), "receiver");
        // 5 m (10 m at 95%) is three times better: the phone's.
        assert_eq!(with(5.0, "\"receiver\""), "device");
        // A device fix too old to weigh: the receiver's.
        let v = ask(&format!(r#"{{"at":100,"receiver":{LIVE},"ownship":{own},"device":{{"accuracy_m":5,"at":90}}}}"#));
        assert_eq!(v.get("source").unwrap().as_str(), Some("receiver"));
    }

    #[test]
    fn heights_by_their_datum() {
        // Above the ellipsoid: no MSL height, the ellipsoid's for a geoid.
        let at = 100.0;
        let v = ask(&format!(r#"{{"at":{at},"receiver":{{"live":true,"gps":true,"msl":false}},"ownship":{}}}"#, own(8, 9, at)));
        let fix = v.get("fix").unwrap();
        assert_eq!(fix.get("altitude_ft").unwrap().as_f64(), None);
        assert_eq!(fix.get("ellipsoid_ft").unwrap().as_f64(), Some(3200.0));
        // A Vertical Warning: no GPS height at all.
        let warned = own(8, 9, at).replace("\"airborne\"", "\"vertical_warning\":true,\"airborne\"");
        let v = ask(&format!(r#"{{"at":{at},"receiver":{LIVE},"ownship":{warned}}}"#));
        assert_eq!(v.get("fix").unwrap().get("altitude_ft").unwrap().as_f64(), None);
        // At 18,000 ft MSL and above, the pressure altitude as a flight
        // level (91.121(a)(2)); 17,999 ft, none.
        let high = own(8, 9, at).replace("\"pressure_ft\":3000,\"geometric_ft\":3200", "\"pressure_ft\":18450,\"geometric_ft\":18000");
        let v = ask(&format!(r#"{{"at":{at},"receiver":{LIVE},"ownship":{high}}}"#));
        assert_eq!(v.get("fix").unwrap().get("flight_level").unwrap().as_f64(), Some(185.0));
        let below = high.replace("\"geometric_ft\":18000", "\"geometric_ft\":17999");
        let v = ask(&format!(r#"{{"at":{at},"receiver":{LIVE},"ownship":{below}}}"#));
        assert_eq!(v.get("fix").unwrap().get("flight_level").unwrap().as_f64(), None);
        // A magnetic heading is not a track.
        let heading = own(8, 9, at).replace("\"track_kind\":\"track\"", "\"track_kind\":\"magnetic\"");
        let v = ask(&format!(r#"{{"at":{at},"receiver":{LIVE},"ownship":{heading}}}"#));
        assert_eq!(v.get("fix").unwrap().get("track_deg").unwrap().as_f64(), None);
    }
}
