//! Alaska's AIRMETs, from the Aviation Weather Center's data API
//! (aviationweather.gov/api/data/airmet, "Decoded domestic AIRMETs (Alaska
//! only)", its OpenAPI document read 2026-11-21). Over the CONUS the
//! text AIRMETs ended in January 2025 and the G-AIRMETs replaced them
//! (`gairmets`); Alaska's Aviation Weather Unit still issues AIRMETs by
//! forecast zone, and no cache file carries them since the combined SIGMET
//! file replaced the airsigmets one (the data API's v4.34, 2026-10-08).
//!
//! Read from the GeoJSON answer, the one format with each zone's polygon.
//! The decoded altitudes are left out on purpose: in the JSON and IWXXM
//! answers of 2026-11-21 they misread the forecaster's text (an icing
//! AIRMET's "ICEIC 060-140. FZLVL BLW 010" decoded as 6,000 ft to 1,000
//! ft, an IFR one's "CIGS BLW 010" as a top of 1,000 ft), so an AIRMET
//! here is told at every altitude, which over-warns and never under-warns.

use super::*;

/// The API's hazard codes as the store's other advisories name them (the
/// airsigmets file's, which every reader of the store and the wording
/// crate's sigmet_hazard know); the rest (IFR, TURB, ICE, LLWS) are the
/// same in both.
const HAZARD_CODES: [(&str, &str); 2] = [("MT-OBSC", "MTN OBSCN"), ("SFC-WIND", "SFC WND")];

/// "2026-11-21 21:14:12", the API's receipt time, as Unix seconds.
fn receipt(text: Option<&str>) -> Option<i64> {
    text.and_then(|t| time::parse_iso(&format!("{}Z", t.trim().replacen(' ', "T", 1))))
}

fn rings(geometry: Option<&Value>) -> Vec<&Value> {
    let Some(g) = geometry else { return Vec::new() };
    let coords = g.get("coordinates").and_then(Value::as_array).unwrap_or(&[]);
    match g.get("type").and_then(Value::as_str) {
        // The exterior ring alone: a zone's AIRMET has no holes.
        Some("Polygon") => coords.first().into_iter().collect(),
        Some("MultiPolygon") => coords.iter().filter_map(|p| p.as_array().and_then(|r| r.first())).collect(),
        _ => Vec::new(),
    }
}

/// `[{"hazard", "type": "AIRMET", "altitude_low_ft": null,
/// "altitude_high_ft": null, "raw", "valid_from", "valid_to", "issued",
/// "zone", "coords"}]`, the shape of the store's airsigmets, one an area
/// (a MultiPolygon's each its own, as a SIGMET's multiarea). Coordinates
/// [lat, lon] as the file gives them, which west of 180° is past -180 (the
/// Aleutians at -190.7), so a ring stays whole across the antimeridian.
/// `raw` is the hazard and zone: the GeoJSON carries no text.
pub fn airmets(text: &str) -> Result<String, String> {
    let doc = json::parse(text).map_err(|e| format!("not JSON: {e}"))?;
    let features = doc.get("features").and_then(Value::as_array).ok_or_else(|| "no features".to_owned())?;
    let mut items = Vec::new();
    for f in features {
        let Some(p) = f.get("properties") else { continue };
        let words = |k: &str| p.get(k).and_then(Value::as_str);
        let hazard = words("hazard").map(|h| HAZARD_CODES.iter().find(|(c, _)| *c == h).map_or(h, |(_, s)| *s));
        let zone = words("zone");
        for ring in rings(f.get("geometry")) {
            let mut a = String::from("{\"hazard\":");
            opt_text(&mut a, hazard);
            a.push_str(",\"type\":\"AIRMET\",\"altitude_low_ft\":null,\"altitude_high_ft\":null,\"raw\":");
            let said: Vec<&str> = ["AIRMET"].into_iter().chain(hazard).chain(zone).collect();
            json::string(&mut a, &said.join(" "));
            a.push_str(",\"valid_from\":");
            opt_int(&mut a, unix(words("validTimeFrom")));
            a.push_str(",\"valid_to\":");
            opt_int(&mut a, unix(words("validTimeTo")));
            a.push_str(",\"issued\":");
            opt_text(&mut a, receipt(words("receiptTime")).map(time::iso).as_deref());
            a.push_str(",\"zone\":");
            opt_text(&mut a, zone);
            a.push_str(",\"coords\":[");
            let points = ring.as_array().unwrap_or(&[]).iter().filter_map(|pt| {
                let pt = pt.as_array()?;
                Some((pt.get(1)?.as_f64()?, pt.first()?.as_f64()?))
            });
            for (i, (lat, lon)) in points.enumerate() {
                if i > 0 {
                    a.push(',');
                }
                a.push('[');
                json::number(&mut a, lat);
                a.push(',');
                json::number(&mut a, lon);
                a.push(']');
            }
            a.push_str("]}");
            items.push(a);
        }
    }
    Ok(format!("[{}]", items.join(",")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The API's answer of 2026-11-21 21:14Z, one feature of each hazard.
    const SAMPLE: &str = include_str!("samples/airmet.geojson");

    fn read() -> Vec<Value> {
        json::parse(&airmets(SAMPLE).unwrap()).unwrap().as_array().unwrap().to_vec()
    }

    #[test]
    fn each_zone_is_an_airmet_in_the_stores_shape() {
        let all = read();
        assert_eq!(all.len(), 6);
        let hazards: Vec<_> = all.iter().map(|a| a.get("hazard").and_then(Value::as_str).unwrap()).collect();
        assert_eq!(hazards, ["SFC WND", "TURB", "ICE", "IFR", "MTN OBSCN", "LLWS"]);
        let first = &all[0];
        assert_eq!(first.get("type").and_then(Value::as_str), Some("AIRMET"));
        assert_eq!(first.get("zone").and_then(Value::as_str), Some("Adak to Attu"));
        assert_eq!(first.get("raw").and_then(Value::as_str), Some("AIRMET SFC WND Adak to Attu"));
        assert_eq!(first.get("valid_from").and_then(Value::as_f64), time::parse_iso("2026-11-21T21:13:00Z").map(|t| t as f64));
        assert_eq!(first.get("valid_to").and_then(Value::as_f64), time::parse_iso("2026-11-22T09:00:00Z").map(|t| t as f64));
        assert_eq!(first.get("issued").and_then(Value::as_str), Some(time::iso(time::parse_iso("2026-11-21T21:14:12Z").unwrap()).as_str()));
    }

    #[test]
    fn a_ring_is_lat_lon_and_stays_whole_past_the_antimeridian() {
        let all = read();
        let ring = all[0].get("coords").and_then(Value::as_array).unwrap();
        assert_eq!(ring.len(), 7);
        let first = ring[0].as_array().unwrap();
        assert_eq!((first[0].as_f64(), first[1].as_f64()), (Some(53.1), Some(-178.0)));
        assert!(ring.iter().any(|p| p.as_array().unwrap()[1].as_f64().unwrap() < -180.0));
    }

    #[test]
    fn no_altitude_is_taken_from_the_decoding() {
        for a in read() {
            assert_eq!(a.get("altitude_low_ft"), Some(&Value::Null));
            assert_eq!(a.get("altitude_high_ft"), Some(&Value::Null));
        }
    }

    #[test]
    fn a_multipolygon_is_an_advisory_an_area_and_no_geometry_none() {
        let text = r#"{"type":"FeatureCollection","features":[
          {"type":"Feature","properties":{"hazard":"IFR","zone":"Z","validTimeFrom":"2026-11-21T21:13:00.000Z","validTimeTo":"2026-11-22T09:00:00.000Z"},
           "geometry":{"type":"MultiPolygon","coordinates":[[[[-150,60],[-149,60],[-149,61],[-150,60]]],[[[-140,60],[-139,60],[-139,61],[-140,60]]]]}},
          {"type":"Feature","properties":{"hazard":"ICE"},"geometry":null}]}"#;
        let all = json::parse(&airmets(text).unwrap()).unwrap();
        assert_eq!(all.as_array().unwrap().len(), 2);
        assert!(airmets("<xml/>").is_err());
    }

    #[test]
    fn a_copy_is_held_to_its_latest_valid_until() {
        let data = json::parse(&airmets(SAMPLE).unwrap()).unwrap();
        let until = held_until("airmets", &data, 0).unwrap();
        assert_eq!(until, time::parse_iso("2026-11-22T09:00:00Z"));
    }
}
