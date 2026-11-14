//! Which Class B band along a route's profile holds an altitude: the
//! Profile card's "Through CHICAGO CLASS B: clearance needed" (the web's
//! ProfileNotes), where the view compared the altitude itself and took a
//! band with no ceiling to top out at 10,000 ft (the aviation audit's
//! AV-9). Class B tops run from 7,000 ft (New Orleans) to 12,500 ft
//! (Denver), so no one figure stands in for a missing ceiling.
//!
//! 14 CFR 91.131(a)(1): no one may operate an aircraft within a Class B
//! area without an ATC clearance. A band holds an altitude from its floor
//! up to its ceiling, both ft MSL as the FAA's Class Airspace shapefile
//! publishes them (LOWER_VAL, UPPER_VAL), both included, as a shelf's
//! published altitudes are part of it. A band whose ceiling the data does
//! not give is taken to hold every altitude from its floor up: the pilot
//! is told a clearance may be needed rather than told none is (warn,
//! never limit).

use crate::json::Value;
use wingtip_core::ask::{num_in, opt_num_in, Ask};

/// The index of the first Class B band among `bands` that holds
/// `altitude_ft`, or None.
pub fn class_b_at(bands: &[(String, f64, Option<f64>)], altitude_ft: f64) -> Option<usize> {
    bands.iter().position(|(class, floor, ceiling)| class == "B" && *floor <= altitude_ft && ceiling.is_none_or(|c| altitude_ft <= c))
}

/// `class_b_at_altitude`: `{bands: [{class, floor_ft, ceiling_ft}],
/// altitude_ft}` answered with the band's index or null.
pub fn class_b_at_altitude(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask::new(name, v);
    let altitude_ft = ask.num("altitude_ft")?;
    let mut bands = Vec::new();
    for band in ask.list("bands")? {
        let class = band.get("class").and_then(Value::as_str).ok_or_else(|| format!("{name}: a band's \"class\" is text"))?;
        bands.push((class.to_owned(), num_in(name, band, "floor_ft")?, opt_num_in(name, band, "ceiling_ft")?));
    }
    let mut out = String::new();
    match class_b_at(&bands, altitude_ft) {
        Some(i) => out.push_str(&i.to_string()),
        None => out.push_str("null"),
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::class_b_at;

    fn band(class: &str, floor: f64, ceiling: Option<f64>) -> (String, f64, Option<f64>) {
        (class.to_owned(), floor, ceiling)
    }

    #[test]
    fn inside_from_floor_to_ceiling_both_included() {
        // Chicago's 3,000-10,000 ft shelf (the FAA's Class Airspace data).
        let bands = [band("D", 0.0, Some(3000.0)), band("B", 3000.0, Some(10000.0))];
        assert_eq!(class_b_at(&bands, 3000.0), Some(1));
        assert_eq!(class_b_at(&bands, 10000.0), Some(1));
        assert_eq!(class_b_at(&bands, 2500.0), None);
        assert_eq!(class_b_at(&bands, 10500.0), None);
    }

    #[test]
    fn a_top_over_ten_thousand_is_its_own() {
        // Denver's top is 12,500 ft: 11,500 is inside, which 10,000 missed.
        assert_eq!(class_b_at(&[band("B", 8000.0, Some(12500.0))], 11500.0), Some(0));
        // New Orleans' is 7,000 ft: 8,500 is over it.
        assert_eq!(class_b_at(&[band("B", 1500.0, Some(7000.0))], 8500.0), None);
    }

    #[test]
    fn no_ceiling_holds_every_altitude_from_its_floor() {
        assert_eq!(class_b_at(&[band("B", 4000.0, None)], 14500.0), Some(0));
        assert_eq!(class_b_at(&[band("B", 4000.0, None)], 3500.0), None);
    }

    #[test]
    fn only_class_b() {
        assert_eq!(class_b_at(&[band("C", 0.0, Some(4000.0))], 2000.0), None);
    }
}
