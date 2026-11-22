use super::*;

const FPL: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<flight-plan xmlns="http://www8.garmin.com/xmlschemas/FlightPlan/v1">
  <created>20261121T12:00:00Z</created>
  <waypoint-table>
    <waypoint><identifier>KMSN</identifier><type>AIRPORT</type><country-code>K5</country-code><lat>43.139858</lat><lon>-89.337514</lon><comment>DANE CO RGNL/TRUAX FLD</comment></waypoint>
    <waypoint><identifier>MSN</identifier><type>VOR</type><country-code>K5</country-code><lat>43.144772</lat><lon>-89.338661</lon></waypoint>
    <waypoint><identifier>USR001</identifier><type>USER WAYPOINT</type><lat>43.5</lat><lon>-88.9</lon></waypoint>
    <waypoint><identifier>KOSH</identifier><type>AIRPORT</type><country-code>K5</country-code><lat>43.984389</lat><lon>-88.556972</lon></waypoint>
  </waypoint-table>
  <route>
    <route-name>KMSN TO KOSH</route-name>
    <flight-plan-index>1</flight-plan-index>
    <route-point><waypoint-identifier>KMSN</waypoint-identifier><waypoint-type>AIRPORT</waypoint-type><waypoint-country-code>K5</waypoint-country-code></route-point>
    <route-point><waypoint-identifier>MSN</waypoint-identifier><waypoint-type>VOR</waypoint-type><waypoint-country-code>K5</waypoint-country-code></route-point>
    <route-point><waypoint-identifier>USR001</waypoint-identifier><waypoint-type>USER WAYPOINT</waypoint-type></route-point>
    <route-point><waypoint-identifier>KOSH</waypoint-identifier><waypoint-type>AIRPORT</waypoint-type><waypoint-country-code>K5</waypoint-country-code></route-point>
  </route>
</flight-plan>"#;

#[test]
fn an_fpl_is_its_route_in_order_each_point_from_its_table() {
    let file = read(FPL).unwrap();
    assert_eq!(file.name.as_deref(), Some("KMSN TO KOSH"));
    let idents: Vec<_> = file.points.iter().map(|p| p.ident.as_deref()).collect();
    assert_eq!(idents, [Some("KMSN"), Some("MSN"), None, Some("KOSH")]);
    let kinds: Vec<_> = file.points.iter().map(|p| p.kind).collect();
    assert_eq!(kinds, [PointKind::Airport, PointKind::Navaid, PointKind::User, PointKind::Airport]);
    // The field's own name kept; the user point its identifier, as a name.
    assert_eq!(file.points[0].name.as_deref(), Some("DANE CO RGNL/TRUAX FLD"));
    assert_eq!(file.points[2].name.as_deref(), Some("USR001"));
    assert_eq!((file.points[2].lat, file.points[2].lon), (43.5, -88.9));
}

#[test]
fn a_gpx_route_reads_its_rtepts_and_names_an_ident_by_its_form() {
    let text = r#"<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
      <wpt lat="1" lon="1"><name>IGNORED</name></wpt>
      <rte><name>Lunch run</name>
        <rtept lat="42.3221" lon="-88.0741"><name>c81</name><sym>Airport</sym></rtept>
        <rtept lat="42.9" lon="-88.5"><name>Over the lake</name></rtept>
        <rtept lat="43.1398" lon="-89.3375"><name>KMSN</name></rtept>
      </rte></gpx>"#;
    let file = read(text).unwrap();
    assert_eq!(file.name.as_deref(), Some("Lunch run"));
    assert_eq!(file.points.len(), 3);
    assert_eq!((file.points[0].ident.as_deref(), file.points[0].kind), (Some("C81"), PointKind::Airport));
    assert_eq!((file.points[1].ident.as_deref(), file.points[1].kind), (None, PointKind::User));
    assert_eq!(file.points[1].name.as_deref(), Some("Over the lake"));
    assert_eq!((file.points[2].ident.as_deref(), file.points[2].kind), (Some("KMSN"), PointKind::Fix));
}

#[test]
fn a_gpx_with_no_route_takes_its_waypoints_in_order() {
    let text = r#"<gpx><metadata><name>Trip</name></metadata><wpt lat="42" lon="-88"><name>KJVL</name></wpt><wpt lat="43" lon="-89"><name>KMSN</name></wpt></gpx>"#;
    let file = read(text).unwrap();
    assert_eq!(file.name.as_deref(), Some("Trip"));
    assert_eq!(file.points.iter().map(|p| p.ident.clone().unwrap()).collect::<Vec<_>>(), ["KJVL", "KMSN"]);
}

#[test]
fn anything_else_is_said_plainly_never_guessed() {
    assert_eq!(read("not xml at all"), Err(NOT_A_ROUTE_FILE));
    assert_eq!(read("<kml><Document/></kml>"), Err(NOT_A_ROUTE_FILE));
    assert_eq!(read(r#"<gpx><wpt lat="42" lon="-88"><name>KJVL</name></wpt></gpx>"#), Err(TOO_FEW));
    assert_eq!(
        read(
            r#"<gpx><rte><rtept lat="95" lon="-88"><name>KJVL</name></rtept><rtept lat="42" lon="-88"><name>KMSN</name></rtept></rte></gpx>"#
        ),
        Err(NO_PLACE)
    );
    assert_eq!(
        read(r#"<gpx><rte><rtept lon="-88"><name>KJVL</name></rtept><rtept lat="42" lon="-88"><name>KMSN</name></rtept></rte></gpx>"#),
        Err(NO_PLACE)
    );
    assert_eq!(
        read(
            r#"<gpx><rte><rtept lat="42" lon="-88"><name>Back home</name></rtept><rtept lat="43" lon="-89"><name>KMSN</name></rtept></rte></gpx>"#
        ),
        Err(ENDS_UNNAMED)
    );
    let missing = FPL.replace("<identifier>MSN</identifier>", "<identifier>BAE</identifier>");
    assert_eq!(read(&missing), Err(NOT_IN_TABLE));
}

#[test]
fn the_rule_answers_the_ends_and_the_points_between() {
    let v = json::parse(&format!("{{\"text\":{}}}", serde_like(FPL))).unwrap();
    let answer = read_rule(&v).unwrap();
    assert!(answer.starts_with("{\"name\":\"KMSN TO KOSH\",\"departure\":{\"ident\":\"KMSN\""), "{answer}");
    assert!(answer.contains("\"destination\":{\"ident\":\"KOSH\""), "{answer}");
    assert!(answer.contains("\"between\":[{\"ident\":\"MSN\""), "{answer}");
    let bad = read_rule(&json::parse("{\"text\":\"nope\"}").unwrap()).unwrap();
    assert_eq!(bad, format!("{{\"error\":\"{NOT_A_ROUTE_FILE}\"}}"));
}

/// A string as JSON writes it.
fn serde_like(s: &str) -> String {
    let mut out = String::new();
    json::string(&mut out, s);
    out
}
