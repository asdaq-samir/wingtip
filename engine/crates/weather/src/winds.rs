//! The FB winds and temperatures aloft as sent (the NWS's "FD" text), as
//! wingtip.weather's `parse_fd_text` reads it: each station's wind and
//! temperature at each altitude, and the window the product is for use
//! in. The coding is AC 00-45H's Winds and Temperatures Aloft Forecast:
//! DDFF wind (tens of degrees true, knots; 50 added to the direction for
//! 100 kt and more; 9900 light and variable), a signed temperature to
//! 24,000 ft and an unsigned, negative one above. services/planner/tests_wingtip/test_parsers.py
//! holds the two readers to the same answer on the current products.

use crate::{json, time};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Group {
    /// None where light and variable (9900).
    pub dir_true_deg: Option<f64>,
    pub speed_kt: f64,
    pub temp_c: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Period {
    pub valid_at: i64,
    pub use_from: i64,
    pub use_to: i64,
}

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Product {
    pub period: Option<Period>,
    /// Each station's groups by altitude, in the product's order.
    pub stations: Vec<(String, Vec<(u32, Group)>)>,
}

fn decode_wind(g: &str) -> Option<(Option<f64>, f64)> {
    let w = g.get(..4)?;
    if !w.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    if w == "9900" {
        return Some((None, 0.0));
    }
    let (dir, speed): (u32, u32) = (w[..2].parse().ok()?, w[2..].parse().ok()?);
    Some(if dir >= 51 {
        (Some(((dir - 50) * 10) as f64), (speed + 100) as f64)
    } else {
        (Some((dir * 10) as f64), speed as f64)
    })
}

fn decode_temp(g: &str) -> Option<f64> {
    let b = g.as_bytes();
    if g.chars().count() == 7 && (b[4] == b'+' || b[4] == b'-') {
        return g.get(4..7)?.parse().ok();
    }
    if g.chars().count() == 6 && g.get(4..6)?.bytes().all(|c| c.is_ascii_digit()) {
        return Some(-g.get(4..6)?.parse::<f64>().ok()?);
    }
    None
}

/// "VALID 021800Z   FOR USE 1400-2100Z": the times, the day's month the
/// one nearest `now`.
fn period(line: &str, now: i64) -> Option<Period> {
    let words: Vec<&str> = line.split_whitespace().collect();
    let at = words.iter().position(|w| *w == "VALID")?;
    let valid = words.get(at + 1)?.strip_suffix('Z')?;
    if words.get(at + 2) != Some(&"FOR") || words.get(at + 3) != Some(&"USE") {
        return None;
    }
    // "1400-2100Z.": the header's sentence runs on after the window.
    let window = words.get(at + 4)?.trim_end_matches(|c: char| !c.is_ascii_alphanumeric()).strip_suffix('Z')?;
    let (a, b) = window.split_once('-')?;
    let ok = |s: &str, n| s.len() == n && s.bytes().all(|c| c.is_ascii_digit());
    if !ok(valid, 6) || !ok(a, 4) || !ok(b, 4) {
        return None;
    }
    let num = |s: &str| s.parse::<u32>().ok();
    let (day, hour, minute) = (num(&valid[..2])?, num(&valid[2..4])?, num(&valid[4..])?);
    if hour > 23 {
        return None;
    }
    let valid_at = time::nearest_day(now, day, hour, minute)?;
    let midnight = valid_at.div_euclid(time::DAY_S) * time::DAY_S;
    let at_hhmm = |s: &str| -> Option<i64> {
        let (h, m) = (num(&s[..2])? % 24, num(&s[2..])?);
        (m < 60).then_some(midnight + h as i64 * 3600 + m as i64 * 60)
    };
    let mut use_from = at_hhmm(a)?;
    if use_from > valid_at {
        use_from -= time::DAY_S;
    }
    let mut use_to = at_hhmm(b)?;
    if use_to < valid_at {
        use_to += time::DAY_S;
    }
    Some(Period { valid_at, use_from, use_to })
}

/// The product, its station rows placed by the header's columns (a group
/// below a station's own height is left out, which shifts the rest: each
/// is matched to the nearest column). None where it has no "FT" header,
/// which is no product.
pub fn parse(text: &str, now: i64) -> Option<Product> {
    let lines: Vec<&str> = text.lines().collect();
    let header = lines.iter().position(|l| l.starts_with("FT "))?;
    let mut columns: Vec<(usize, u32)> = Vec::new();
    let h = lines[header];
    let hb = h.as_bytes();
    let mut i = 0;
    while i < hb.len() {
        if hb[i].is_ascii_digit() {
            let start = i;
            while i < hb.len() && hb[i].is_ascii_digit() {
                i += 1;
            }
            columns.push((start, h[start..i].parse().ok()?));
        } else {
            i += 1;
        }
    }
    let mut product = Product { period: lines[..header].iter().find_map(|l| period(l, now)), ..Default::default() };
    for line in &lines[header + 1..] {
        if line.trim().is_empty() || columns.is_empty() {
            continue;
        }
        let station = line.get(..3.min(line.len())).unwrap_or("").trim();
        if station.is_empty() {
            continue;
        }
        let rest = line.get(3..).unwrap_or("");
        let mut groups: Vec<(u32, &str)> = Vec::new();
        let rb = rest.as_bytes();
        let mut j = 0;
        while j < rb.len() {
            if rb[j].is_ascii_whitespace() {
                j += 1;
                continue;
            }
            let start = j;
            while j < rb.len() && !rb[j].is_ascii_whitespace() {
                j += 1;
            }
            let pos = start + 3;
            let alt = columns.iter().min_by_key(|(p, _)| (*p as i64 - pos as i64).abs()).unwrap().1;
            // A later group at the same column takes its place, as a dict's would.
            match groups.iter_mut().find(|(a, _)| *a == alt) {
                Some(g) => g.1 = &rest[start..j],
                None => groups.push((alt, &rest[start..j])),
            }
        }
        let decoded: Vec<(u32, Group)> = groups
            .into_iter()
            .filter_map(|(alt, g)| decode_wind(g).map(|(dir, speed)| (alt, Group { dir_true_deg: dir, speed_kt: speed, temp_c: decode_temp(g) })))
            .collect();
        if !decoded.is_empty() {
            match product.stations.iter_mut().find(|(s, _)| s == station) {
                Some(s) => s.1 = decoded,
                None => product.stations.push((station.to_string(), decoded)),
            }
        }
    }
    Some(product)
}

/// The product as wingtip.weather's FdStations, JSON: {"period": {...},
/// "stations": {"ABI": {"6000": {...}}}}.
pub fn to_json(p: &Product) -> String {
    let mut out = String::from("{\"period\":");
    match &p.period {
        Some(per) => out.push_str(&format!(
            "{{\"valid_at\":\"{}\",\"use_from\":\"{}\",\"use_to\":\"{}\"}}",
            time::iso(per.valid_at), time::iso(per.use_from), time::iso(per.use_to)
        )),
        None => out.push_str("null"),
    }
    out.push_str(",\"stations\":{");
    for (k, (station, groups)) in p.stations.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        json::string(&mut out, station);
        out.push_str(":{");
        for (n, (alt, g)) in groups.iter().enumerate() {
            if n > 0 {
                out.push(',');
            }
            out.push_str(&format!("\"{alt}\":{{\"wind_dir_true_deg\":"));
            json::opt_number(&mut out, g.dir_true_deg);
            out.push_str(",\"wind_speed_kt\":");
            json::number(&mut out, g.speed_kt);
            out.push_str(",\"temp_c\":");
            json::opt_number(&mut out, g.temp_c);
            out.push('}');
        }
        out.push('}');
    }
    out.push_str("}}");
    out
}

// --- The winds and temperatures aloft read at an altitude ---
//
// Moved from the planner's wingtip.weather (#482 phase 2): a station's
// levels as the weather service stores them ({altitude_ft: {
// "wind_dir_true_deg", "wind_speed_kt", "temp_c"}}, the GFS's levels at the
// old FB stations), read at one altitude. Which station is the nearest
// stays with the host, which holds the stations' places.

/// A compass direction `frac` of the way from d1 to d2, the short way
/// round the circle (350 to 010 goes through 000, not back through 180).
pub fn interp_direction(d1: f64, d2: f64, frac: f64) -> f64 {
    let diff = crate::geo::py_mod(d2 - d1 + 180.0, 360.0) - 180.0;
    crate::geo::py_mod(d1 + frac * diff, 360.0)
}

/// A wind from true north, as the forecast gives it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindAt {
    pub dir_true_deg: f64,
    pub speed_kt: f64,
}

/// The wind at `altitude_ft` from a station's levels, (altitude_ft,
/// direction or None for light and variable, speed): interpolated between
/// the levels either side (the direction the short way round), clamped to
/// the nearest end outside them. A light-and-variable level (AC 00-45H's
/// 9900, no direction) is left out rather than guessed; None where no
/// level is left -- no wind known, never calm.
pub fn wind_at_altitude(levels: &[(f64, Option<f64>, f64)], altitude_ft: f64) -> Option<WindAt> {
    let mut profile: Vec<(f64, f64, f64)> = levels.iter().filter_map(|&(a, d, s)| d.map(|d| (a, d, s))).collect();
    profile.sort_by(|a, b| a.0.total_cmp(&b.0));
    let (first, last) = (*profile.first()?, *profile.last()?);
    if altitude_ft <= first.0 {
        return Some(WindAt { dir_true_deg: first.1, speed_kt: first.2 });
    }
    if altitude_ft >= last.0 {
        return Some(WindAt { dir_true_deg: last.1, speed_kt: last.2 });
    }
    profile.windows(2).find(|w| w[0].0 <= altitude_ft && altitude_ft <= w[1].0).map(|w| {
        let ((a1, d1, s1), (a2, d2, s2)) = (w[0], w[1]);
        let frac = if a2 != a1 { (altitude_ft - a1) / (a2 - a1) } else { 0.0 };
        WindAt { dir_true_deg: interp_direction(d1, d2, frac), speed_kt: s1 + frac * (s2 - s1) }
    })
}

/// The temperature at `altitude_ft` from a profile of (altitude_ft,
/// temp_c), lowest first: interpolated between the levels either side,
/// and past the ends the nearest level's difference from a standard day
/// kept -- the standard lapse rate (ICAO Doc 7488's 1.98 C a thousand
/// feet, wingtip_flight's isa_temp_c), all there is to go on below the
/// lowest level (the GFS's 925 hPa, about 2,500 ft). None for none.
pub fn temperature_at(profile: &[(f64, f64)], altitude_ft: f64) -> Option<f64> {
    use wingtip_flight::flight::isa_temp_c;
    let (first, last) = (*profile.first()?, *profile.last()?);
    if altitude_ft <= first.0 || altitude_ft >= last.0 {
        let (alt, temp) = if altitude_ft <= first.0 { first } else { last };
        return Some(temp + isa_temp_c(altitude_ft) - isa_temp_c(alt));
    }
    profile
        .windows(2)
        .find(|w| w[0].0 <= altitude_ft && altitude_ft <= w[1].0)
        .map(|w| w[0].1 + (altitude_ft - w[0].0) / (w[1].0 - w[0].0) * (w[1].1 - w[0].1))
}

/// Where a temperature profile (altitude_ft, temp_c), lowest first,
/// crosses 0 C -- the freezing level, at and above which visible moisture
/// can ice an airframe (FAA-H-8083-28, Aviation Weather Handbook, icing; AC 00-45H's
/// freezing level): `(ft, at_or_below)`, by linear interpolation between
/// the two levels either side. `at_or_below` where it is at or below 0 C
/// at the lowest level already: the freezing level is there or lower,
/// somewhere the data cannot say -- never that lowest level passed off as
/// the freezing level, which let everything under it read as above
/// freezing on the coldest days. None where the whole profile stays above
/// freezing: no freezing level in range, not one unknown.
pub fn freezing_level(profile: &[(f64, f64)]) -> Option<(f64, bool)> {
    let first = *profile.first()?;
    if first.1 <= 0.0 {
        return Some((first.0, true));
    }
    profile.windows(2).find(|w| w[0].1 > 0.0 && w[1].1 <= 0.0).map(|w| {
        let ((a1, t1), (a2, t2)) = (w[0], w[1]);
        (a1 + t1 / (t1 - t2) * (a2 - a1), false)
    })
}

/// Which winds period ("06", "12", "24") fits a departure `hours_ahead`
/// from now where no period's own window can be read to say: the 6-hour
/// period up to six hours out, the 12-hour to fifteen, the 24-hour beyond
/// -- where the FB's FOR USE windows ended (AC 00-45H, Winds and
/// Temperatures Aloft Forecast), which the weather service's GFS periods
/// keep (services/weather/app/gfs.py). None, no departure time, is now.
pub fn forecast_hour(hours_ahead: Option<f64>) -> &'static str {
    match hours_ahead {
        None => "06",
        Some(h) if h <= 6.0 => "06",
        Some(h) if h <= 15.0 => "12",
        Some(_) => "24",
    }
}

/// The airplane's service ceiling on the day: the book figure is a density
/// altitude (where the best climb has fallen to 100 fpm, FAA-H-8083-25C
/// ch. 11), so it is found as an altitude in the forecast temperatures
/// (wingtip_flight::performance::altitude_at_density_altitude), to the
/// nearest 100 ft. A warm day brings it down, a cold one lifts it. The
/// book figure itself where the profile is empty: a standard day's,
/// assumed rather than known.
pub fn service_ceiling_on_the_day(book_ft: f64, profile: &[(f64, f64)]) -> f64 {
    if profile.is_empty() {
        return book_ft;
    }
    let ft = wingtip_flight::performance::altitude_at_density_altitude(book_ft, |h| {
        temperature_at(profile, h).unwrap_or_else(|| wingtip_flight::flight::isa_temp_c(h))
    });
    // Ties to even, as the planner's round() gave it before the move.
    (ft / 100.0).round_ties_even() * 100.0
}

#[cfg(test)]
mod aloft_tests {
    use super::*;

    #[test]
    fn winds_interpolate_the_short_way_round_and_clamp() {
        let levels = [(3000.0, Some(350.0), 10.0), (6000.0, Some(10.0), 20.0), (9000.0, None, 5.0)];
        let w = wind_at_altitude(&levels, 4500.0).unwrap();
        assert!(w.dir_true_deg.abs() < 1e-9 || (w.dir_true_deg - 360.0).abs() < 1e-9, "{w:?}");
        assert!((w.speed_kt - 15.0).abs() < 1e-9);
        assert_eq!(wind_at_altitude(&levels, 12000.0).unwrap().speed_kt, 20.0);
        assert_eq!(wind_at_altitude(&[(3000.0, None, 3.0)], 3000.0), None);
    }

    #[test]
    fn the_freezing_level() {
        assert_eq!(freezing_level(&[(3000.0, 4.0), (6000.0, -2.0)]), Some((5000.0, false)));
        assert_eq!(freezing_level(&[(3000.0, -1.0), (6000.0, -5.0)]), Some((3000.0, true)));
        assert_eq!(freezing_level(&[(3000.0, 10.0), (6000.0, 5.0)]), None);
        assert_eq!(freezing_level(&[]), None);
    }

    #[test]
    fn temperatures_past_the_ends_keep_their_difference_from_standard() {
        let p = [(3000.0, 10.0), (6000.0, 4.0)];
        assert_eq!(temperature_at(&p, 4500.0), Some(7.0));
        let below = temperature_at(&p, 0.0).unwrap();
        assert!((below - (10.0 + 3000.0 * 0.0019812)).abs() < 1e-9, "{below}");
    }

    #[test]
    fn the_service_ceiling_comes_down_on_a_warm_day_and_up_on_a_cold_one() {
        // wingtip.performance's test of altitude_at_density_altitude, kept
        // with the call the altitude selection now asks.
        use wingtip_flight::flight::isa_temp_c;
        let plus = |dev: f64| vec![(0.0, isa_temp_c(0.0) + dev), (20000.0, isa_temp_c(20000.0) + dev)];
        assert_eq!(service_ceiling_on_the_day(13500.0, &plus(0.0)), 13500.0);
        let warm = service_ceiling_on_the_day(13500.0, &plus(15.0));
        let cold = service_ceiling_on_the_day(13500.0, &plus(-10.0));
        assert!(11500.0 < warm && warm < 12000.0, "{warm}");
        assert!(14500.0 < cold && cold < 15000.0, "{cold}");
        assert_eq!(service_ceiling_on_the_day(13500.0, &[]), 13500.0);
    }

    #[test]
    fn the_period_by_hours_ahead() {
        assert_eq!(forecast_hour(None), "06");
        assert_eq!(forecast_hour(Some(6.0)), "06");
        assert_eq!(forecast_hour(Some(15.0)), "12");
        assert_eq!(forecast_hour(Some(15.1)), "24");
    }
}
