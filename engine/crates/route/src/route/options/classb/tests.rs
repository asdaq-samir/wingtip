use super::*;

// A square of Class B, a tenth of a degree across each way, on the line
// from (0, 0) north to (1, 0): Midway to Duluth over O'Hare.
fn core(floor: f64, ceiling: f64) -> Shelf {
    Shelf {
        floor_ft: floor,
        ceiling_ft: Some(ceiling),
        area: Area { rings: vec![vec![(0.4, -0.1), (0.4, 0.1), (0.6, 0.1), (0.6, -0.1)]] },
    }
}

fn fix(ident: &str, lat: f64, lon: f64, vfr: bool) -> Fix {
    Fix { ident: ident.into(), lat, lon, vfr, kind: if vfr { "VFR waypoint".into() } else { "GPS waypoint".into() } }
}

fn idents(ways: &[Detour]) -> Vec<&str> {
    ways.iter().map(|w| w.ident.as_str()).collect()
}

#[test]
fn the_margin_is_a_mile_east_and_west_too() {
    // At 60 N a degree of longitude is 30 nm: 0.025 degrees east of the
    // edge is 0.75 nm, inside the mile (degrees alone read 1.5 nm), and
    // 0.04 degrees is 1.2 nm, outside it.
    let edges = Edges::new(std::iter::once(&Area { rings: vec![vec![(59.9, -0.1), (59.9, 0.1), (60.1, 0.1), (60.1, -0.1)]] }));
    assert!(edges.near((59.95, 0.125), (60.05, 0.125), DETOUR_MARGIN_NM));
    assert!(!edges.near((59.95, 0.14), (60.05, 0.14), DETOUR_MARGIN_NM));
    // And north, a minute of latitude a mile: 0.9 nm in, 1.2 nm out.
    assert!(edges.near((60.115, -0.05), (60.115, 0.05), DETOUR_MARGIN_NM));
    assert!(!edges.near((60.12, -0.05), (60.12, 0.05), DETOUR_MARGIN_NM));
}

#[test]
fn the_detour_is_the_shortest_way_round_out_of_the_class_b() {
    let fixes = [fix("VPFAR", 0.5, -0.6, true), fix("VPMID", 0.5, 0.0, true), fix("VPNEAR", 0.5, -0.2, true)];
    let ways = detours((0.0, 0.0), (1.0, 0.0), &[core(0.0, 10000.0)], 10000.0, &fixes);
    assert_eq!(idents(&ways), vec!["VPNEAR", "VPFAR"]);
    assert_eq!(ways[0].kind, "VFR waypoint");
    assert!(ways[0].added_nm > 0.0 && ways[0].added_nm < 5.0);
    // A mile's margin: a fix just outside the edge has its legs within it.
    assert!(detours((0.0, 0.0), (1.0, 0.0), &[core(0.0, 10000.0)], 10000.0, &[fix("VPEDGE", 0.5, -0.105, true)]).is_empty());
    // A shelf over the altitude flown is passed under.
    assert!(detours((0.0, 0.0), (1.0, 0.0), &[core(3000.0, 10000.0)], 2500.0, &fixes).is_empty());
}

#[test]
fn a_vfr_waypoint_comes_before_a_gps_fix_that_saves_less_than_ten_miles_and_a_handful_at_most() {
    let fixes = [fix("GPSNR", 0.5, -0.15, false), fix("VPOUT", 0.5, -0.25, true)];
    assert_eq!(idents(&detours((0.0, 0.0), (1.0, 0.0), &[core(0.0, 10000.0)], 10000.0, &fixes)), vec!["VPOUT", "GPSNR"]);
    assert!(detours((0.0, 0.0), (1.0, 0.0), &[core(0.0, 10000.0)], 10000.0, &[fix("VPGONE", 0.5, -3.0, true)]).is_empty());
    let many: Vec<Fix> = (0..DETOUR_CHOICES + 3).map(|i| fix(&format!("VP{i:03}"), 0.5, -0.2 - i as f64 * 0.01, true)).collect();
    assert_eq!(detours((0.0, 0.0), (1.0, 0.0), &[core(0.0, 10000.0)], 10000.0, &many).len(), DETOUR_CHOICES);
}

#[test]
fn a_leg_enters_class_b_only_between_its_floor_and_ceiling() {
    let shelf = [core(3600.0, 10000.0)];
    let through = ((0.0, 0.0), (1.0, 0.0));
    assert!(entered(through.0, through.1, &shelf, 4500.0));
    assert!(entered(through.0, through.1, &shelf, 3600.0));
    assert!(!entered(through.0, through.1, &shelf, 3500.0));
    assert!(!entered(through.0, through.1, &shelf, 10500.0));
    // Beside it, not through it.
    assert!(!entered((0.0, 0.5), (1.0, 0.5), &shelf, 4500.0));
}

#[test]
fn crossing_one_area_is_what_its_edge_index_says() {
    // crosses(), which entered() asks of each shelf, against the index
    // over that area alone at no margin: through, beside, along an edge,
    // touching a corner, short legs far off and inside, and a ring of many
    // points round a field as the shapefile's arcs are.
    let mut arc: Vec<Point> = (0..720)
        .map(|k| {
            let t = (k as f64 / 2.0).to_radians();
            (33.64 + 0.2 * t.sin(), -84.43 + 0.24 * t.cos())
        })
        .collect();
    arc.push(arc[0]);
    let areas = [core(0.0, 1.0).area, Area { rings: vec![arc] }];
    let legs = [
        ((0.0, 0.0), (1.0, 0.0)),
        ((0.0, 0.5), (1.0, 0.5)),
        ((0.4, -0.2), (0.4, 0.2)),
        ((0.3, 0.2), (0.4, 0.1)),
        ((0.45, -0.05), (0.55, 0.05)),
        ((5.0, 5.0), (5.1, 5.1)),
        ((33.0, -85.0), (34.5, -83.5)),
        ((33.64, -84.43), (33.65, -84.42)),
        ((33.0, -84.43), (33.44, -84.43)),
    ];
    for area in &areas {
        let index = Edges::new(std::iter::once(area));
        for (a, b) in legs {
            assert_eq!(crosses(area, a, b), index.near(a, b, 0.0), "{a:?} -> {b:?}");
        }
    }
}
