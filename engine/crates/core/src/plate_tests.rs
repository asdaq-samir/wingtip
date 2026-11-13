//! core::plate's tests.

use super::*;

#[test]
fn snyders_worked_example_of_the_ellipsoidal_projection() {
    // Snyder, USGS PP 1395, pp. 296-297: Clarke 1866 (a = 6,378,206.4 m,
    // e^2 = 0.00676866), parallels 33 and 45 N, origin 23 N 96 W; 35 N
    // 75 W is x = 1,894,410.9 m, y = 1,564,649.5 m.
    let lcc = Lambert::new(6_378_206.4, 0.006_768_66, 23.0, -96.0, 33.0, 45.0);
    let (x, y) = lcc.forward(35.0, -75.0);
    assert!((x - 1_894_410.9).abs() < 0.1, "{x}");
    assert!((y - 1_564_649.5).abs() < 0.1, "{y}");
}

/// KRFD ILS RWY 07's georeference (d-TPP 2610), the affine as the planner
/// fits it (apps/web/src/lib/fixtures/platePagePoint.json), its plan view
/// the whole page here.
fn krfd() -> PlateGeoreference {
    PlateGeoreference {
        projection: Lambert::grs80(42.1566944444444, -89.21819444444452, 46.66666666666671, 41.33333333333331),
        to_page: [
            0.005669291338633633, -1.816080238953724e-14, 198.77248352113932, -4.889983935168123e-14, 0.00566929133857482,
            356.1238653497445,
        ],
        width_pt: 396.0,
        height_pt: 612.0,
        plan_view: PageBox { left: 0.0, bottom: 0.0, right: 396.0, top: 612.0 },
        insets: Vec::new(),
    }
}

#[test]
fn the_faas_four_points_fall_where_the_viewport_says_within_a_pixel() {
    // The GeoPDF's GPTS, each at its LPTS fraction of the viewport's box
    // [9.18 2.628 378.18 591.372]: a pixel of the plate's picture is a
    // quarter of a point (wingtip.plates.PLATE_SCALE), the full screen
    // page's 0.2 (publications.DIAGRAM_SCALE, 5).
    let geo = krfd();
    let points = [
        ((41.68814609406, -89.54178783614), (0.1, 0.1)),
        ((41.68820747524, -88.91618533392), (0.9, 0.1)),
        ((42.4365259253, -88.91248437445), (0.9, 0.9)),
        ((42.43646377287, -89.54575329403), (0.1, 0.9)),
    ];
    for ((lat, lon), (fx, fy)) in points {
        let (x, y) = geo.page_of(lat, lon);
        let (want_x, want_y) = (9.18 + fx * 369.0, 2.628 + fy * 588.744);
        assert!((x - want_x).abs() < 0.2 && (y - want_y).abs() < 0.2, "{lat},{lon}: ({x}, {y}) for ({want_x}, {want_y})");
    }
}

#[test]
fn a_nautical_mile_is_its_scale_on_the_page() {
    // The d-TPP's plan views are 1:500,000: a nm, 1852 m, is 3.704 mm,
    // 10.5 points.
    let geo = krfd();
    let (_, south) = geo.page_of(42.0, -89.2);
    let (_, north) = geo.page_of(42.0 + 1.0 / 60.0, -89.2);
    assert!((north - south - 10.5).abs() < 0.1, "{}", north - south);
}

#[test]
fn outside_the_plan_view_or_inside_an_inset_is_not_drawn() {
    let mut geo = krfd();
    geo.plan_view = PageBox { left: 17.0, bottom: 192.0, right: 370.0, top: 472.0 };
    // 42.2 N 89.1 W is at (254.1, 383.4) points.
    assert!(geo.point(42.2, -89.1, None).is_some());
    geo.insets.push(PageBox { left: 200.0, bottom: 300.0, right: 370.0, top: 400.0 });
    assert_eq!(geo.point(42.2, -89.1, None), None);
    // 41.8 N 89.2 W, some 130 points up, is under the plan view's foot.
    assert_eq!(geo.point(41.8, -89.2, Some(0.0)), None);
}

#[test]
fn a_track_turns_by_the_convergence() {
    // gamma = n (lambda - lambda0) (eq. 14-4), n = 0.694913 here: at the
    // central meridian north is the page's up, 0.3276 degrees west of it
    // north leans 0.2276 degrees clockwise.
    let geo = krfd();
    let at_cm = geo.point(42.2, -89.21819444444452, Some(0.0)).unwrap();
    let r = at_cm.rotation_deg.unwrap();
    assert!(r.min(360.0 - r) < 0.01, "{r}");
    let west = geo.point(42.2, -89.54575329403, Some(180.0)).unwrap();
    assert!((west.rotation_deg.unwrap() - 180.2276).abs() < 0.01, "{:?}", west.rotation_deg);
}
