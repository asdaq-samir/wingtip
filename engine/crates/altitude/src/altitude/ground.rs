//! The figures the planner's readers of the ground and its obstacles take
//! (#482): where a terrain tile's height is the sea's and not the ground
//! a floor is taken from, which obstacles the map stands up, how far off
//! the route the side view draws them, and how far round a field the finer
//! terrain is kept. They were wingtip.elevation's LOWEST_GROUND_M,
//! wingtip.terrain_view's OBSTACLE_MIN_AGL_FT, wingtip.profile's
//! PROFILE_OBSTACLE_NM and wingtip.terrain_fine's AIRPORT_RADIUS_NM; the
//! planner reads the tiles and the Digital Obstacle File, and asks these
//! by name (`ground_figures`). Beside floor.rs, whose ground they are.

use crate::json::{self, Value};

/// The lowest ground in North America, ft MSL: Badwater Basin, Death
/// Valley, 282 ft below sea level (USGS; National Park Service). The
/// terrain tiles carry the sea floor too (their bathymetry, from ETOPO1
/// and GEBCO), and below this a pixel is the sea's: under an airplane the
/// surface there is the sea's, 0 ft, the surface 14 CFR 91.159's "more
/// than 3,000 feet above the surface" and 91.119's floors are taken from.
/// The grid's lowest was 30,000 ft below the sea off Baja and in the Gulf
/// of California, where rows of a tile read -12,849 m (2026-11-02).
pub const LOWEST_GROUND_FT: f64 = -282.0;

/// The obstacles the map stands up by default, ft AGL: 14 CFR 77.9(a)'s
/// "more than 200 ft. AGL at its site", past which construction is
/// noticed to the FAA, and so what the Digital Obstacle File is kept for.
/// The floors read every obstacle the file has; this is what is drawn.
pub const OBSTACLE_SHOWN_AGL_FT: f64 = 200.0;

/// How far off each hop's line an obstacle is drawn on the side view, nm,
/// either side: a display width, not a margin. The legal margins over
/// obstacles are 14 CFR 91.119(b)'s 2,000 ft horizontal radius over a
/// congested area and 91.177(a)(2)'s 4 nm under IFR, which the floors keep
/// with their own wider read (floor_corridor_nm, ifr_obstacle_radius_nm).
pub const PROFILE_OBSTACLE_NM: f64 = 1.0;

/// How far round a public-use airport the finer terrain tiles are kept,
/// nm: the pattern, the climb out and the descent in, where the 3D view is
/// looked at close. A 3° path (an ILS glide slope's usual angle, AIM
/// 1-1-9) falls 318 ft a nm (6,076 ft x tan 3°), so it is 1,500 ft above
/// the field some 4.7 nm out. A bound on what is stored.
pub const FINE_TERRAIN_RADIUS_NM: f64 = 5.0;

/// `ground_figures`: `{"lowest_ground_ft", "obstacle_shown_agl_ft",
/// "profile_obstacle_nm", "fine_terrain_radius_nm"}`, from `{}`.
pub fn call(name: &str, _v: &Value) -> Result<String, String> {
    if name != "ground_figures" {
        return Err(format!("the engine has no rule called {name:?}"));
    }
    let mut out = String::from("{");
    for (i, (key, value)) in [
        ("lowest_ground_ft", LOWEST_GROUND_FT),
        ("obstacle_shown_agl_ft", OBSTACLE_SHOWN_AGL_FT),
        ("profile_obstacle_nm", PROFILE_OBSTACLE_NM),
        ("fine_terrain_radius_nm", FINE_TERRAIN_RADIUS_NM),
    ]
    .into_iter()
    .enumerate()
    {
        if i > 0 {
            out.push(',');
        }
        json::string(&mut out, key);
        out.push(':');
        json::number(&mut out, value);
    }
    out.push('}');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use wingtip_core::units::{FT_PER_NM, M_PER_FT, M_PER_NM};

    #[test]
    fn the_figures_by_name() {
        let answer = json::parse(&call("ground_figures", &json::parse("{}").unwrap()).unwrap()).unwrap();
        assert_eq!(answer.get("lowest_ground_ft").and_then(Value::as_f64), Some(-282.0));
        assert_eq!(answer.get("obstacle_shown_agl_ft").and_then(Value::as_f64), Some(200.0));
        assert_eq!(answer.get("profile_obstacle_nm").and_then(Value::as_f64), Some(1.0));
        assert_eq!(answer.get("fine_terrain_radius_nm").and_then(Value::as_f64), Some(5.0));
        assert!(call("ground_figure", &json::parse("{}").unwrap()).is_err());
    }

    #[test]
    fn a_3_degree_path_is_1_500_ft_up_inside_the_fine_terrain() {
        // AIM 1-1-9's 3° glide slope over a nautical mile.
        let ft_per_nm = (3.0_f64).to_radians().tan() * FT_PER_NM;
        assert!((ft_per_nm - 318.4).abs() < 0.1, "{ft_per_nm}");
        assert!(1500.0 / ft_per_nm < FINE_TERRAIN_RADIUS_NM);
    }

    #[test]
    fn badwater_basin_is_below_the_sea_and_the_side_view_inside_the_floor() {
        const { assert!(LOWEST_GROUND_FT < 0.0) };
        // 91.119(b)'s 2,000 ft is a third of a mile; the side view's mile
        // is wider, the IFR floor's 4 nm (91.177(a)(2)) wider still.
        const { assert!(PROFILE_OBSTACLE_NM > 2000.0 * M_PER_FT / M_PER_NM && PROFILE_OBSTACLE_NM < 4.0) };
    }
}
