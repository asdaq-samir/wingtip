use super::*;

// --- A flown track read from its file ---------------------------------------

pub(super) fn read(text: &str) -> Value {
    ask("read_track", json!({ "text": text }))
}

pub(super) fn gpx(points: &str) -> String {
    format!(
        r#"<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>{points}</trkseg></trk></gpx>"#
    )
}

#[test]
fn a_gpx_track_is_read_in_time_order_its_heights_in_feet() {
    let read = read(&gpx(concat!(
        r#"<trkpt lat="42.1" lon="-88.1"><ele>250.5</ele><time>2026-10-01T14:00:00Z</time></trkpt>"#,
        r#"<trkpt lat="42.2" lon="-88.2"><time>2026-10-01T14:00:05.250Z</time></trkpt>"#,
        // A second report at the same moment, a point at 0, 0 and one off
        // the earth: dropped.
        r#"<trkpt lat="42.3" lon="-88.3"><ele></ele><time>2026-10-01T14:00:05.250Z</time></trkpt>"#,
        r#"<trkpt lat="0" lon="0"><time>2026-10-01T14:00:07Z</time></trkpt>"#,
        r#"<trkpt lat="95" lon="1"><time>2026-10-01T14:00:08Z</time></trkpt>"#,
        // An offset: 13:59 an hour east of Greenwich is 12:59 UTC, first.
        r#"<trkpt lat="42.4" lon="-88.4"><ele>x</ele><time>2026-10-01T13:59:00+01:00</time></trkpt>"#,
    )));
    assert_eq!(
        read["points"],
        json!([
            { "t": 1790859540000.0, "lat": 42.4, "lon": -88.4, "alt_ft": null },
            { "t": 1790863200000.0, "lat": 42.1, "lon": -88.1, "alt_ft": 250.5 * FT_PER_M },
            { "t": 1790863205250.0, "lat": 42.2, "lon": -88.2, "alt_ft": null },
        ])
    );
}

#[test]
fn a_kml_track_log_is_read_from_its_whens_and_coords() {
    let read = read(concat!(
        r#"<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><Placemark><gx:Track>"#,
        "<when>2026-10-01T14:00:00Z</when><when>2026-10-01T14:00:04Z</when><when>2026-10-01T14:00:08Z</when>",
        "<gx:coord>-88.1 42.1 300</gx:coord><gx:coord>-88.2 42.2</gx:coord><gx:coord> -88.3   42.3 310.5 </gx:coord>",
        "</gx:Track></Placemark></Document></kml>",
    ));
    let points = read["points"].as_array().unwrap();
    assert_eq!(points.len(), 3);
    assert_eq!(norm(&points[0]), json!({ "t": 1790863200000.0, "lat": 42.1, "lon": -88.1, "alt_ft": 300.0 * FT_PER_M }));
    assert_eq!(points[1]["alt_ft"], Value::Null);
    assert_eq!(points[2]["lat"], json!(42.3));
}

#[test]
fn a_file_with_nothing_to_use_says_why() {
    let error = |text: &str| read(text)["error"].as_str().unwrap().to_owned();
    assert_eq!(
        error(&gpx(r#"<trkpt lat="42.1" lon="-88.1"><ele>250</ele></trkpt><trkpt lat="42.2" lon="-88.2"></trkpt>"#)),
        "The track's points have no times: export it with them (a GPX track, or ForeFlight's KML track log)."
    );
    assert_eq!(error(&gpx("")), "There is no track in this file.");
    assert_eq!(
        error(
            r#"<kml><Document><Placemark><LineString><coordinates>-88,42,0 -88.1,42.1,0</coordinates></LineString></Placemark></Document></kml>"#
        ),
        "There is no track in this file."
    );
    for not_a_track in ["<foo/>", "not xml at all", "<gpx><trk>"] {
        assert_eq!(error(not_a_track), "This file is not a GPX or KML track.");
    }
}

#[test]
fn times_are_read_as_iso_8601_in_utc() {
    use wingtip_engine::motion::track::iso_ms;
    assert_eq!(iso_ms("2026-10-01T14:00:00Z"), Some(1790863200000.0));
    assert_eq!(iso_ms("2026-10-01T14:00:00.5Z"), Some(1790863200500.0));
    assert_eq!(iso_ms("2026-10-01T14:00:02-05:00"), Some(1790863202000.0 + 5.0 * 3_600_000.0));
    assert_eq!(iso_ms("2026-10-02"), Some(1790899200000.0));
    // GPX 1.1 sets its times in UTC: one with no offset is UTC.
    assert_eq!(iso_ms("2026-10-01T14:00:00"), Some(1790863200000.0));
    for bad in ["", "yesterday", "2026-13-01T00:00:00Z", "2026-02-30", "2026-10-01T25:00Z", "2026-10-01T14:00:00.Z"] {
        assert_eq!(iso_ms(bad), None, "{bad}");
    }
}

#[test]
fn a_track_is_thinned_by_even_steps_keeping_its_ends() {
    let points: Vec<Value> = (0..9001).map(|i| json!({ "t": i * 1000, "lat": 42, "lon": -88, "altFt": null })).collect();
    let kept = ask("thin_track", json!({ "points": points }));
    let kept = kept.as_array().unwrap();
    assert_eq!(kept.len(), 4000);
    assert_eq!(norm(&kept[0]), norm(&points[0]));
    assert_eq!(norm(&kept[3999]), norm(&points[9000]));
    let few = ask("thin_track", json!({ "points": points[..10], "most": 4000 }));
    assert_eq!(few.as_array().unwrap().len(), 10);
    let three = ask("thin_track", json!({ "points": points[..100], "most": 3 }));
    assert_eq!(three.as_array().unwrap().iter().map(|p| n(&p["t"])).collect::<Vec<_>>(), [0.0, 50_000.0, 99_000.0]);
}
