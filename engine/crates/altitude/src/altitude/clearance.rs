//! The profile's clearance preview: how close the ground and the
//! obstacles along the route come to an altitude, coloured as ForeFlight's
//! profile and Hazard Advisor colour them by default -- red within 100 ft
//! of the altitude or above it, yellow within 1,000 ft (ForeFlight Pilot's
//! Guide, Hazard Advisor). These are display defaults, not a regulation:
//! the legal minimums over the ground are 14 CFR 91.119 (VFR: 500 ft, 1,000
//! ft over a congested area) and 91.177 (IFR), which the planner's legal
//! altitudes already keep (floor.rs).

use crate::figures::words::grouped;

/// Ground or an obstacle this close under the altitude, or above it, is
/// red: ForeFlight's default (a display choice, not 14 CFR).
pub const RED_WITHIN_FT: f64 = 100.0;
/// And this close, yellow: ForeFlight's default too.
pub const YELLOW_WITHIN_FT: f64 = 1000.0;

/// A place along the route and its height, feet MSL.
#[derive(Clone, Copy, Debug)]
pub struct Height {
    pub along_nm: f64,
    pub ft: f64,
    pub obstacle: bool,
}

/// What the preview says of one altitude.
#[derive(Clone, Debug, PartialEq)]
pub struct Clearance {
    /// Ground at or over this height is drawn red, and over the yellow's
    /// yellow.
    pub red_from_ft: f64,
    pub yellow_from_ft: f64,
    /// The highest point along the route, how far the altitude clears it
    /// (negative, under it), where it is and whether it is an obstacle.
    pub highest_ft: Option<f64>,
    pub least_ft: Option<f64>,
    pub least_along_nm: Option<f64>,
    pub obstacle: bool,
    /// Where the route first meets ground at or over the altitude.
    pub strike_nm: Option<f64>,
    /// "red", "yellow" or "clear"; None with nothing along the route.
    pub level: Option<&'static str>,
    /// The route's point nearest the highest point.
    pub near: Option<String>,
    /// The altitude and its clearance in words, as VoiceOver and TalkBack
    /// read them: "3,500 ft, terrain within 500 ft near KXYZ".
    pub words: String,
}

/// The clearance at `altitude_ft` over `heights` (ground samples and
/// obstacles along the route), with `points` (ident, along_nm) to say
/// where.
pub fn at(altitude_ft: f64, heights: &[Height], points: &[(String, f64)]) -> Clearance {
    let red_from_ft = altitude_ft - RED_WITHIN_FT;
    let yellow_from_ft = altitude_ft - YELLOW_WITHIN_FT;
    let highest = heights.iter().copied().max_by(|a, b| a.ft.total_cmp(&b.ft));
    let strike_nm = heights.iter().filter(|h| h.ft >= altitude_ft).map(|h| h.along_nm).min_by(f64::total_cmp);
    let near = highest
        .and_then(|h| points.iter().min_by(|a, b| (a.1 - h.along_nm).abs().total_cmp(&(b.1 - h.along_nm).abs())).map(|p| p.0.clone()));
    let level = highest.map(|h| {
        if h.ft >= red_from_ft {
            "red"
        } else if h.ft >= yellow_from_ft {
            "yellow"
        } else {
            "clear"
        }
    });
    let alt = format!("{} ft", grouped(altitude_ft));
    let words = match highest {
        None => alt,
        Some(h) => {
            let what = if h.obstacle { "an obstacle" } else { "terrain" };
            let place = near.as_ref().map_or(String::new(), |n| format!(" near {n}"));
            let least = altitude_ft - h.ft;
            if least <= 0.0 {
                format!("{alt}, {what} {} ft above it{place}", grouped(-least))
            } else if least < YELLOW_WITHIN_FT {
                format!("{alt}, {what} within {} ft{place}", grouped((least / 100.0).ceil() * 100.0))
            } else {
                format!("{alt}, clear of terrain and obstacles by {} ft", grouped((least / 100.0).floor() * 100.0))
            }
        }
    };
    Clearance {
        red_from_ft,
        yellow_from_ft,
        highest_ft: highest.map(|h| h.ft),
        least_ft: highest.map(|h| altitude_ft - h.ft),
        least_along_nm: highest.map(|h| h.along_nm),
        obstacle: highest.is_some_and(|h| h.obstacle),
        strike_nm,
        level,
        near,
        words,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ground(fts: &[f64]) -> Vec<Height> {
        fts.iter().enumerate().map(|(i, &ft)| Height { along_nm: i as f64 * 10.0, ft, obstacle: false }).collect()
    }

    #[test]
    fn red_within_100_ft_yellow_within_1000() {
        let points = [("KAAA".to_owned(), 0.0), ("KXYZ".to_owned(), 30.0)];
        let c = at(3500.0, &ground(&[1000.0, 2000.0, 3000.0, 2500.0]), &points);
        assert_eq!((c.red_from_ft, c.yellow_from_ft), (3400.0, 2500.0));
        assert_eq!(c.level, Some("yellow"));
        assert_eq!(c.least_ft, Some(500.0));
        assert_eq!(c.words, "3,500 ft, terrain within 500 ft near KXYZ");
        assert_eq!(c.strike_nm, None);
        assert_eq!(at(3050.0, &ground(&[3000.0]), &[]).level, Some("red"));
        assert_eq!(at(6000.0, &ground(&[3000.0]), &[]).words, "6,000 ft, clear of terrain and obstacles by 3,000 ft");
    }

    #[test]
    fn under_the_ground_says_how_far_and_where_it_first_meets_it() {
        let mut h = ground(&[1000.0, 4200.0, 4400.0]);
        h.push(Height { along_nm: 25.0, ft: 4600.0, obstacle: true });
        let c = at(4000.0, &h, &[]);
        assert_eq!(c.level, Some("red"));
        assert_eq!(c.strike_nm, Some(10.0));
        assert!(c.obstacle);
        assert_eq!(c.words, "4,000 ft, an obstacle 600 ft above it");
    }
}
