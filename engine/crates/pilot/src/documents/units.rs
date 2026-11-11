//! A handbook's units into the app's: knots, feet, pounds, inches,
//! gallons and gallons an hour, as the airplane's profile and the weight
//! and balance keep them. The factors are the definitions: the
//! international foot (0.3048 m), pound (0.45359237 kg) and inch
//! (25.4 mm); the nautical mile 1,852 m and the statute mile 1,609.344 m;
//! the US gallon 3.785411784 L (NIST Handbook 44, Appendix C).

/// What each figure of the read is in: the unit a page prints it in, or
/// the app's own.
#[derive(Clone, Copy, Debug)]
pub struct Units {
    pub speed: &'static str,
    pub distance: &'static str,
    pub weight: &'static str,
    pub arm: &'static str,
    pub fuel: &'static str,
    pub burn: &'static str,
}

fn known(name: &str, given: Option<&str>, units: &[&'static str]) -> Result<&'static str, String> {
    match given {
        None => Ok(units[0]),
        Some(g) => units
            .iter()
            .find(|u| **u == g)
            .copied()
            .ok_or_else(|| format!("handbook_read_check: \"{name}\" is not one of {}", units.join(", "))),
    }
}

impl Units {
    /// The units the read says its figures are in, each one of those the
    /// contract names; the app's where it says none.
    pub fn read(
        speed: Option<&str>, distance: Option<&str>, weight: Option<&str>, arm: Option<&str>, fuel: Option<&str>, burn: Option<&str>,
    ) -> Result<Units, String> {
        Ok(Units {
            speed: known("speed_unit", speed, &["kt", "mph", "kmh"])?,
            distance: known("distance_unit", distance, &["ft", "m"])?,
            weight: known("weight_unit", weight, &["lb", "kg"])?,
            arm: known("arm_unit", arm, &["in", "cm", "mm"])?,
            fuel: known("fuel_unit", fuel, &["gal", "l"])?,
            burn: known("burn_unit", burn, &["gph", "lph", "pph"])?,
        })
    }

    pub fn kt(&self, v: f64) -> f64 {
        match self.speed {
            "mph" => v * 1609.344 / 1852.0,
            "kmh" => v * 1000.0 / 1852.0,
            _ => v,
        }
    }

    pub fn ft(&self, v: f64) -> f64 {
        if self.distance == "m" {
            v / 0.3048
        } else {
            v
        }
    }

    pub fn lb(&self, v: f64) -> f64 {
        if self.weight == "kg" {
            v / 0.45359237
        } else {
            v
        }
    }

    pub fn inch(&self, v: f64) -> f64 {
        match self.arm {
            "cm" => v / 2.54,
            "mm" => v / 25.4,
            _ => v,
        }
    }

    pub fn gal(&self, v: f64) -> f64 {
        if self.fuel == "l" {
            v / 3.785411784
        } else {
            v
        }
    }

    /// Pounds an hour are taken as avgas at 6 lb a gallon, the weight the
    /// FAA's Aircraft Weight and Balance Handbook (FAA-H-8083-1B, chapter
    /// 2) gives for it; the item says so, since a jet-fuel engine's are
    /// heavier.
    pub fn gph(&self, v: f64) -> f64 {
        match self.burn {
            "lph" => v / 3.785411784,
            "pph" => v / AVGAS_LB_PER_GAL,
            _ => v,
        }
    }
}

/// Avgas's standard weight, pounds a US gallon (FAA-H-8083-1B, chapter 2).
pub const AVGAS_LB_PER_GAL: f64 = 6.0;
