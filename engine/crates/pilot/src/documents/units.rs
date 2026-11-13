//! A handbook's units into the app's: knots, feet, pounds, inches,
//! gallons and gallons an hour, as the airplane's profile and the weight
//! and balance keep them. The factors are the definitions, from
//! wingtip_core::units: the international foot, pound and inch, the
//! nautical and statute miles and the US gallon.

use wingtip_core::units::{KG_PER_LB, L_PER_GAL, MM_PER_IN, M_PER_FT, M_PER_NM, M_PER_SM};

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
            "mph" => v * M_PER_SM / M_PER_NM,
            "kmh" => v * 1000.0 / M_PER_NM,
            _ => v,
        }
    }

    pub fn ft(&self, v: f64) -> f64 {
        if self.distance == "m" {
            v / M_PER_FT
        } else {
            v
        }
    }

    pub fn lb(&self, v: f64) -> f64 {
        if self.weight == "kg" {
            v / KG_PER_LB
        } else {
            v
        }
    }

    pub fn inch(&self, v: f64) -> f64 {
        match self.arm {
            "cm" => v / (MM_PER_IN / 10.0),
            "mm" => v / MM_PER_IN,
            _ => v,
        }
    }

    pub fn gal(&self, v: f64) -> f64 {
        if self.fuel == "l" {
            v / L_PER_GAL
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
            "lph" => v / L_PER_GAL,
            "pph" => v / AVGAS_LB_PER_GAL,
            _ => v,
        }
    }
}

/// Avgas's standard weight, pounds a US gallon (FAA-H-8083-1B, chapter 2).
pub const AVGAS_LB_PER_GAL: f64 = 6.0;
