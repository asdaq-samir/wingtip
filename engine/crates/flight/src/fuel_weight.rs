//! A US gallon of fuel in pounds, where the airplane's own handbook gives
//! no figure: the FAA's standard weights, which "should not be used if
//! actual weights are available" (FAA-H-8083-25, Pilot's Handbook of
//! Aeronautical Knowledge, chapter 10, "Standard weights": gasoline 6
//! lb/US gal, Jet A and Jet A-1 6.8 lb/US gal). The Aircraft Weight and
//! Balance Handbook (FAA-H-8083-1B, figure 3-4) gives the same fuels by
//! temperature, avgas 6.01 and Jet A 6.68 at 59 °F, 6.14 and 6.75 at
//! 32 °F: the pilot's standard figures are the handbook's own round ones,
//! and a POH's figure (the loading's `fuel_lb_per_gal`) comes before them,
//! but after a grade the pilot picks for the fuel aboard (`weighed_at`).
//! One copy for every crate: the weight and balance (wingtip_brief) and a
//! fuel burn read in pounds an hour (wingtip_pilot's documents).

/// Avgas (100LL, UL94 and the other aviation gasolines): 6 lb a US gallon.
pub const AVGAS_LB_PER_GAL: f64 = 6.0;
/// Jet A and Jet A-1, the diesel and turbine engines' fuel: 6.8 lb a US gallon.
pub const JET_A_LB_PER_GAL: f64 = 6.8;

/// The fuel an airplane burns, as its loading names it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Grade {
    Avgas,
    JetA,
}

impl Grade {
    /// "avgas" or "jet_a", any case; None for anything else.
    pub fn read(text: &str) -> Option<Grade> {
        match text.trim().to_ascii_lowercase().as_str() {
            "avgas" => Some(Grade::Avgas),
            "jet_a" => Some(Grade::JetA),
            _ => None,
        }
    }

    pub fn lb_per_gal(self) -> f64 {
        match self {
            Grade::Avgas => AVGAS_LB_PER_GAL,
            Grade::JetA => JET_A_LB_PER_GAL,
        }
    }
}

/// The pounds a gallon a loading weighs its fuel at: its handbook's own
/// figure where given, else its grade's standard weight, else avgas's (the
/// piston airplane the app plans most; a Jet A airplane names its grade).
pub fn lb_per_gal(own: Option<f64>, grade: Option<Grade>) -> f64 {
    own.unwrap_or_else(|| grade.unwrap_or(Grade::Avgas).lb_per_gal())
}

/// The pounds a gallon a flight's weight and balance weighs its fuel at,
/// one rule for every app: the grade the pilot picked for the fuel aboard
/// where one is (its standard weight: they said what is in the tanks),
/// else the handbook's own figure, else the airplane's grade's standard
/// weight, else avgas's (`lb_per_gal`).
pub fn weighed_at(picked: Option<Grade>, own: Option<f64>, grade: Option<Grade>) -> f64 {
    picked.map_or_else(|| lb_per_gal(own, grade), Grade::lb_per_gal)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_handbooks_figure_first_then_the_grades_standard() {
        assert_eq!(lb_per_gal(None, None), 6.0);
        assert_eq!(lb_per_gal(None, Some(Grade::Avgas)), 6.0);
        assert_eq!(lb_per_gal(None, Some(Grade::JetA)), 6.8);
        assert_eq!(lb_per_gal(Some(6.7), Some(Grade::JetA)), 6.7);
        assert_eq!(Grade::read(" JET_A "), Some(Grade::JetA));
        assert_eq!(Grade::read("100LL"), None);
    }

    #[test]
    fn the_grade_picked_first_then_the_handbooks_figure() {
        assert_eq!(weighed_at(Some(Grade::JetA), Some(6.0), Some(Grade::Avgas)), 6.8);
        assert_eq!(weighed_at(Some(Grade::Avgas), Some(6.7), Some(Grade::JetA)), 6.0);
        assert_eq!(weighed_at(None, Some(6.7), Some(Grade::JetA)), 6.7);
        assert_eq!(weighed_at(None, None, Some(Grade::JetA)), 6.8);
        assert_eq!(weighed_at(None, None, None), 6.0);
    }
}
