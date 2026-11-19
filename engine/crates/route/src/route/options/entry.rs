use super::*;

/// route_options_frame's answer: where the cells are and their samples,
/// the flight's time, and what the planner reads for them.
pub(super) fn frame(a: &Ask) -> String {
    let grid = Grid::new(a.dep.at, a.dest.at, &via(a));
    let (s, w, n, e) = grid.bbox();
    let window = window(a);
    let top = highest_cruise_ft(a.profile.ceiling_ft);
    // The fixes and fields wanted: those within a turn's naming reach of
    // the grid (naming::NEAR_NM), which takes in a fuel stop's too.
    let data_box = geo::corridor_bbox((s, w), (n, e), naming::NEAR_NM);
    let mut out = String::from("{");
    for (key, v) in [("lat0", grid.geom.lat0), ("lon0", grid.geom.lon0)] {
        out.push_str(&format!("\"{key}\":"));
        json::number(&mut out, v);
        out.push(',');
    }
    out.push_str(&format!("\"rows\":{},\"cols\":{},\"cell_deg\":", grid.rows, grid.cols));
    json::number(&mut out, CELL_DEG);
    out.push_str(&format!(",\"per_cell\":{PER_CELL},\"top_ft\":"));
    json::number(&mut out, top);
    out.push_str(",\"window\":[");
    json::number(&mut out, window.0);
    out.push(',');
    json::number(&mut out, window.1);
    out.push_str("],\"altitudes_ft\":[");
    for (i, alt) in read::cruising_altitudes(read::cruise_top_ft(a.profile.ceiling_ft)).iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::number(&mut out, *alt);
    }
    out.push_str("],\"lowest_cruise_ft\":");
    json::number(&mut out, LOWEST_CRUISE_FT);
    // The speed the ways are costed at: the airplane's, else the still-air
    // reference (ask::REFERENCE_TAS_KT), for the host's glide reach.
    out.push_str(",\"tas_kt\":");
    json::number(&mut out, a.profile.tas_kt);
    out.push_str(",\"metars\":");
    out.push_str(if a.depart_s - a.now_s <= METAR_AHEAD_S { "true" } else { "false" });
    let boxed = |out: &mut String, key: &str, b: [f64; 4]| {
        out.push_str(&format!(",\"{key}\":["));
        for (i, v) in b.iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            json::number(out, *v);
        }
        out.push(']');
    };
    boxed(&mut out, "bbox", [s, w, n, e]);
    boxed(&mut out, "data_box", [data_box.0, data_box.1, data_box.2, data_box.3]);
    out.push('}');
    out
}

/// A rule of this module by its name, JSON in and out (crate::call).
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    let r = Reader { name };
    match name {
        // Within 180 degrees of the departure's longitude (wrap.rs): the
        // frame's lon0 and boxes may pass -180 or 180, the answer's do not.
        "route_options_frame" => Ok(frame(&wrap::unwrapped(r.ask(v)?))),
        "route_options" => options(&wrap::unwrapped(r.ask(v)?)),
        "terrain_way_frame" | "terrain_way_round" => terrain::call(name, v),
        "fuel_stops" | "fields_along" => fuel::call(name, v),
        "class_b_entered" | "class_b_detours" => classb::call(name, v),
        "frd_near" => {
            let fixes = r.fixes(v, "fixes")?;
            let year = naming::decimal_year(r.num(v, "now_s")?);
            let max_nm = r.opt_num(v, "max_nm")?.unwrap_or(naming::NEAR_NM);
            Ok(match naming::frd_near(&fixes, r.num(v, "lat")?, r.num(v, "lon")?, max_nm, year) {
                Some(n) => {
                    let mut out = String::from("{\"base\":");
                    json::string(&mut out, &n.base);
                    out.push_str(&format!(",\"course_deg\":{},\"distance_nm\":", n.course_deg));
                    json::number(&mut out, n.distance_nm);
                    out.push_str(&format!(",\"radial\":{},\"ident\":", n.radial));
                    json::string(&mut out, &n.ident);
                    out.push('}');
                    out
                }
                None => "null".to_owned(),
            })
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}
