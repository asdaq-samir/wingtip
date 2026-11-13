//! The climbs flown on the legs: the planner's wingtip.navlog
//! with_climbs, climb_penalty_min and climb_fuel_penalty_gal. The
//! descents are descents.rs's.

use super::legs::{wind_of, wind_triangle};
use super::{py_round, Obj, Profile, R};
use crate::geo::py_mod;
use crate::json::Value;
use wingtip_flight::flight::isa_temp_c;
use wingtip_flight::performance::{Climb, Climber};

/// How much warmer than a standard day a leg's air is at its own altitude:
/// what its climb is flown in. Nothing without a leg, or where no forecast
/// temperature was near it.
pub fn isa_dev_c(leg: Option<&Obj>) -> R<f64> {
    let Some(leg) = leg else { return Ok(0.0) };
    Ok(match leg.opt("oat_c")? {
        Some(oat) => oat - isa_temp_c(leg.num("altitude_ft")?),
        None => 0.0,
    })
}

/// The legs with their climbs flown: from `start_altitude_ft` (the
/// departure field, or None to start level at the first leg's altitude) up
/// to each leg's altitude, and up again wherever a plan steps up -- at the
/// best rate, slower the thinner the air, at the climb's fuel flow, less
/// as full throttle makes less, in the air of the leg flown at the top
/// (wingtip_flight::performance), at the climb speed. A climb's minutes
/// are flown over the ground at the climb's own ground speed -- the wind
/// triangle at the climb speed in the leg's wind, the same wind its cruise
/// is worked in (wind_triangle; FAA-H-8083-25C, PHAK ch. 16) -- the rest of
/// the leg at its cruise, and a climb longer than the leg carries into the
/// next. Each leg says how much of its time is climb (`climb_min`), and the
/// leg a climb tops out on says where (`toc`: the miles, minutes and
/// gallons into the leg, the altitude, and the climb's true airspeed and
/// ground speed). A descent costs nothing here: at cruise power it is if
/// anything faster (with_descents places it).
///
/// Each phase is flown at its own figures, as a handbook gives them: the
/// climb at its time, fuel and distance to climb (a POH's section 5 table,
/// here the performance model's), the cruise at the cruise table's TAS and
/// burn; the time is the distance over the ground speed and the fuel that
/// time at the phase's flow (FAA-H-8083-25C, PHAK ch. 16, "Flight
/// planning"). So a row's figures agree, its ground speed times its time
/// its miles: a leg flown wholly in the climb states the climb's airspeed,
/// wind correction, headings, ground speed and fuel flow, not the cruise's
/// (navlog-fit.spec, 2026-11-13, found a climbing row's minutes beside the
/// cruise's ground speed). A leg partly climbed keeps the cruise's figures
/// on the leg and the climb's on its `toc`; the nav log cuts its row at the
/// top (the web's navLogRows), so each piece is one phase and its ground
/// speed its miles over its minutes.
/// A profile with no climb speed of its own flies no climb: the legs as
/// they are, level from the start, with no top of climb -- the climb's
/// ground is not guessed from another airplane's (the owner, 2026-11-09).
pub fn with_climbs(legs: &[Obj], start_altitude_ft: Option<f64>, profile: &Profile, climber: &Climber) -> R<Vec<Obj>> {
    let Some(climb_tas) = profile.airplane.climb_tas_kt() else {
        return Ok(legs.to_vec());
    };
    let mut level_ft = start_altitude_ft;
    let mut climb_left_min = 0.0;
    // The fuel flow of the climb in hand over all its minutes: one that
    // carries into the next leg burns there what it burned on average.
    let mut climb_burn_gph = 0.0;
    let mut out = Vec::with_capacity(legs.len());
    for leg in legs {
        let mut leg = leg.clone();
        let target_ft = leg.num("altitude_ft")?;
        if let Some(level) = level_ft
            && target_ft > level
        {
            let climb = climber.climb(level, target_ft, isa_dev_c(Some(&leg))?);
            climb_burn_gph = (climb_left_min * climb_burn_gph + climb.gallons * 60.0) / (climb_left_min + climb.minutes);
            climb_left_min += climb.minutes;
        }
        let level = level_ft.map_or(target_ft, |l| l.max(target_ft));
        level_ft = Some(level);
        leg.set_num("climb_min", 0.0);
        leg.set("toc", Value::Null);
        let gs = leg.opt("groundspeed_kt")?.filter(|g| *g != 0.0);
        if climb_left_min > 0.0 && gs.is_some() && leg.has("ete_min") {
            let gs = gs.unwrap_or_default();
            let distance = leg.num("distance_nm")?;
            // The climb's own triangle in the leg's wind (ClimbAir).
            let air = ClimbAir::on(&leg, climb_tas)?;
            let climb_gs = air.groundspeed_kt;
            let climb_nm = climb_gs * climb_left_min / 60.0;
            let (climb_min, cruise_min);
            if climb_nm >= distance {
                climb_min = distance / climb_gs * 60.0;
                cruise_min = 0.0;
                climb_left_min -= climb_min;
                air.state_on(&mut leg, climb_burn_gph);
            } else {
                climb_min = climb_left_min;
                cruise_min = (distance - climb_nm) / gs * 60.0;
                climb_left_min = 0.0;
                let mut toc = Obj::default();
                toc.set_num("along_nm", py_round(climb_nm, 1));
                toc.set_num("ete_min", py_round(climb_min, 1));
                toc.set_num("fuel_gal", py_round(climb_min / 60.0 * climb_burn_gph, 2));
                toc.set_num("altitude_ft", level);
                // The climbing piece's own figures, as a leg climbed whole
                // states them on the leg: the nav log's row up to the top.
                air.state_on(&mut toc, climb_burn_gph);
                leg.set("toc", toc.value());
            }
            leg.set_num("climb_min", py_round(climb_min, 1));
            leg.set_num("ete_min", climb_min + cruise_min);
            leg.set_num("fuel_gal", (climb_min / 60.0) * climb_burn_gph + (cruise_min / 60.0) * leg.num("fuel_burn_gph")?);
        }
        out.push(leg);
    }
    Ok(out)
}

/// A climb's own air on a leg: the wind triangle at the climb speed in the
/// leg's wind, the same wind its cruise is worked in (wind_triangle;
/// FAA-H-8083-25C, PHAK ch. 16), with the leg's course and variation for
/// its headings. Scaling the cruise's ground speed by the airspeeds, as the
/// climb once did, scaled the wind too: 110 kt into a 20 kt headwind is 90
/// over the ground, and at a 70 kt climb that made 57 where the wind leaves
/// 50. At least 1 kt, as before, where a crosswind stronger than the climb
/// speed holds no heading. A leg with no course (none given) is still air.
struct ClimbAir {
    tas_kt: f64,
    wca_deg: f64,
    groundspeed_kt: f64,
    true_heading_deg: Option<f64>,
    magnetic_heading_deg: Option<f64>,
}

impl ClimbAir {
    fn on(leg: &Obj, climb_tas: f64) -> R<ClimbAir> {
        let Some(tc) = leg.opt("true_course_deg")? else {
            return Ok(ClimbAir {
                tas_kt: climb_tas,
                wca_deg: 0.0,
                groundspeed_kt: climb_tas,
                true_heading_deg: None,
                magnetic_heading_deg: None,
            });
        };
        let (wca, gs) = wind_triangle(tc, wind_of(leg.get("wind").unwrap_or(&Value::Null))?, climb_tas);
        let true_heading = py_mod(tc + wca, 360.0);
        // East variation is least, west is best (FAA-H-8083-25C ch. 16).
        let magnetic = leg.opt("magnetic_variation_deg")?.map(|v| py_mod(true_heading - v, 360.0));
        Ok(ClimbAir {
            tas_kt: climb_tas,
            wca_deg: wca,
            groundspeed_kt: gs.max(1.0),
            true_heading_deg: Some(true_heading),
            magnetic_heading_deg: magnetic,
        })
    }

    /// The climb's figures on `to`: a leg flown wholly in the climb, whose
    /// row is then the climb's, or a top of climb, the piece of its leg up
    /// to the top. The climb speed, its wind correction and headings, its
    /// ground speed and its fuel flow in place of the cruise's, so the
    /// row's ground speed times its time is its miles and its fuel flow
    /// times its time its gallons. Its power and density altitude stay the
    /// cruise's: the climb speed is the profile's own figure, not one
    /// worked from them.
    fn state_on(&self, to: &mut Obj, burn_gph: f64) {
        to.set_num("tas_kt", self.tas_kt);
        to.set_num("groundspeed_kt", self.groundspeed_kt);
        to.set_num("fuel_burn_gph", burn_gph);
        if let Some(th) = self.true_heading_deg {
            to.set_num("wca_deg", self.wca_deg);
            to.set_num("true_heading_deg", th);
        }
        if let Some(mh) = self.magnetic_heading_deg {
            to.set_num("magnetic_heading_deg", mh);
        }
    }
}

/// The climb's ground speed over the cruise's on `leg`: the share of the
/// cruise's ground the climb's minutes cover, both in the leg's wind
/// (ClimbAir). Without a leg's ground speed, the airspeeds' ratio: still air.
fn climb_over_cruise(leg: Option<&Obj>, profile: &Profile, climb_tas: f64) -> R<f64> {
    if let Some(l) = leg
        && let Some(gs) = l.opt("groundspeed_kt")?.filter(|g| *g > 0.0)
    {
        return Ok(ClimbAir::on(l, climb_tas)?.groundspeed_kt / gs);
    }
    let cruise_tas = match leg {
        Some(l) => l.num("tas_kt")?,
        None => profile.airplane.cruise_tas_kt,
    };
    Ok(climb_tas / cruise_tas)
}

/// Minutes a climb from `from_ft` to `to_ft` costs over cruising level:
/// the climb's minutes (in the air of `leg`, the leg flown at `to_ft`,
/// where given), flown at the climb's ground speed rather than the leg's
/// cruise's, each in the leg's wind (climb_over_cruise), and the
/// difference is ground not covered. A descent costs nothing, and
/// never below nothing: a climb speed typed above the cruise does not make
/// climbing pay. Nothing with no climb speed in the profile, which flies
/// no climb (with_climbs).
pub fn climb_penalty_min(from_ft: f64, to_ft: f64, profile: &Profile, climber: &Climber, leg: Option<&Obj>) -> R<f64> {
    let Some(climb_tas) = profile.airplane.climb_tas_kt() else { return Ok(0.0) };
    if to_ft <= from_ft {
        return Ok(0.0);
    }
    let minutes = climber.climb(from_ft, to_ft, isa_dev_c(leg)?).minutes;
    Ok((minutes * (1.0 - climb_over_cruise(leg, profile, climb_tas)?)).max(0.0))
}

/// Gallons a climb from `from_ft` to `to_ft` burns over cruising the same
/// ground: its gallons, less what the leg's cruise would have burned over
/// the ground the climb covers at its ground speed (climb_over_cruise, in
/// the leg's wind). Never below nothing,
/// and nothing with no climb speed in the profile (with_climbs).
pub fn climb_fuel_penalty_gal(from_ft: f64, to_ft: f64, profile: &Profile, climber: &Climber, leg: Option<&Obj>) -> R<f64> {
    let Some(climb_tas) = profile.airplane.climb_tas_kt() else { return Ok(0.0) };
    if to_ft <= from_ft {
        return Ok(0.0);
    }
    let climb: Climb = climber.climb(from_ft, to_ft, isa_dev_c(leg)?);
    let cruise_burn = match leg {
        Some(l) => l.num("fuel_burn_gph")?,
        None => profile.airplane.fuel_burn_gph,
    };
    let cruise_gal = climb.minutes / 60.0 * cruise_burn * climb_over_cruise(leg, profile, climb_tas)?;
    Ok((climb.gallons - cruise_gal).max(0.0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::navlog::{number, object};
    use wingtip_flight::performance::Airplane;

    fn profile() -> Profile {
        Profile {
            airplane: Airplane {
                cruise_tas_kt: 100.0,
                fuel_burn_gph: 8.0,
                climb_tas_kt: Some(70.0),
                climb_fuel_burn_gph: Some(14.0),
                climb_rate_fpm_sea_level: Some(800.0),
                service_ceiling_ft: 14000.0,
                ..Airplane::default()
            },
            ..Profile::default()
        }
    }

    /// A leg due north at 3,500 ft in `wind` (from, kt), its cruise
    /// `cruise_gs` over the ground at 100 kt TAS and 8 gph.
    fn leg(distance: f64, wind: (f64, f64), cruise_gs: f64, variation: f64) -> Obj {
        let mut l = Obj::default();
        l.set_num("distance_nm", distance);
        l.set_num("altitude_ft", 3500.0);
        l.set_num("true_course_deg", 0.0);
        l.set("wind", object(vec![("wind_dir_true_deg", number(wind.0)), ("wind_speed_kt", number(wind.1))]));
        l.set_num("tas_kt", 100.0);
        l.set_num("groundspeed_kt", cruise_gs);
        l.set_num("ete_min", distance / cruise_gs * 60.0);
        l.set_num("fuel_burn_gph", 8.0);
        l.set_num("fuel_gal", distance / cruise_gs * 8.0);
        l.set_num("wca_deg", 0.0);
        l.set_num("magnetic_variation_deg", variation);
        l
    }

    #[test]
    fn a_leg_wholly_in_the_climb_states_the_climbs_ground_speed() {
        // 20 kt straight down the nose: the cruise's 100 kt makes 80 over
        // the ground, the 70 kt climb 50 (the wind triangle with no
        // crosswind, PHAK ch. 16) -- not 80 x 70/100 = 56, and not 80. The
        // climb from 500 ft to 3,500 at 800 fpm falling 0.05 fpm a foot is
        // 20 ln(775/625) = 4.3 minutes, 3.6 nm at 50 kt, so a 3 nm leg is
        // climbed whole in 3.6 minutes and the next tops out 0.6 nm in.
        let p = profile();
        let legs = [leg(3.0, (360.0, 20.0), 80.0, 0.0), leg(20.0, (360.0, 20.0), 80.0, 0.0)];
        let out = with_climbs(&legs, Some(500.0), &p, &Climber::new(&p.airplane)).unwrap();
        let (first, second) = (&out[0], &out[1]);
        let gs = first.num("groundspeed_kt").unwrap();
        let ete = first.num("ete_min").unwrap();
        assert!((gs - 50.0).abs() < 1e-9, "{gs}");
        assert!((ete - 3.6).abs() < 1e-9, "{ete}");
        // The row agrees with itself: its speed over its time is its miles,
        // its flow over its time its gallons, and all of it is climb.
        assert!((gs * ete / 60.0 - 3.0).abs() < 0.01);
        assert!((first.num("fuel_burn_gph").unwrap() * ete / 60.0 - first.num("fuel_gal").unwrap()).abs() < 1e-9);
        assert_eq!(first.num("tas_kt").unwrap(), 70.0);
        assert_eq!(first.num("climb_min").unwrap(), 3.6);
        assert_eq!(first.get("toc"), Some(&Value::Null));
        // The leg it tops out on keeps the cruise's ground speed, and the
        // climb's is on its top of climb.
        assert_eq!(second.num("groundspeed_kt").unwrap(), 80.0);
        let toc = Obj::read("test", second.get("toc").unwrap()).unwrap();
        assert!((toc.num("groundspeed_kt").unwrap() - 50.0).abs() < 1e-9);
        assert!((toc.num("along_nm").unwrap() - 0.6).abs() < 1e-9);
        // With the climb's airspeed, flow and heading for the piece up to
        // the top: one climb, one flow on both legs.
        assert_eq!(toc.num("tas_kt").unwrap(), 70.0);
        assert_eq!(toc.num("fuel_burn_gph").unwrap(), first.num("fuel_burn_gph").unwrap());
        assert_eq!(toc.num("magnetic_heading_deg").unwrap(), 0.0);
    }

    #[test]
    fn a_climb_in_a_crosswind_takes_its_own_correction() {
        // 20 kt from the east, square to a north course: at 70 kt the
        // correction is asin(20/70) = 16.60 degrees right and the ground
        // speed sqrt(70^2 - 20^2) = 67.08 kt (the cruise's sqrt(100^2 -
        // 20^2) = 97.98 scaled by 70/100 made 68.59). 10 degrees of west
        // variation put the magnetic heading at 26.60 (west is best).
        let p = profile();
        let cruise_gs = (100.0_f64.powi(2) - 400.0).sqrt();
        let out = with_climbs(&[leg(3.0, (90.0, 20.0), cruise_gs, -10.0)], Some(500.0), &p, &Climber::new(&p.airplane)).unwrap();
        let l = &out[0];
        assert!((l.num("groundspeed_kt").unwrap() - 4500.0_f64.sqrt()).abs() < 1e-9);
        assert!((l.num("wca_deg").unwrap() - 16.60).abs() < 0.01);
        assert!((l.num("magnetic_heading_deg").unwrap() - 26.60).abs() < 0.01);
        assert!((l.num("groundspeed_kt").unwrap() * l.num("ete_min").unwrap() / 60.0 - 3.0).abs() < 0.01);
    }

    #[test]
    fn a_climbs_cost_is_ground_lost_at_its_own_ground_speed() {
        // Into the same 20 kt: the climb covers 50 kt where the cruise
        // covers 80, so its minutes lose 1 - 50/80 = 0.375 of themselves,
        // where the airspeeds' 70/100 said 0.3; and the cruise would have
        // burned 8 gph over 50/80 of them.
        let p = profile();
        let climber = Climber::new(&p.airplane);
        let l = leg(20.0, (360.0, 20.0), 80.0, 0.0);
        let climb = climber.climb(500.0, 3500.0, 0.0);
        let lost = climb_penalty_min(500.0, 3500.0, &p, &climber, Some(&l)).unwrap();
        assert!((lost - climb.minutes * 0.375).abs() < 1e-9);
        let gal = climb_fuel_penalty_gal(500.0, 3500.0, &p, &climber, Some(&l)).unwrap();
        assert!((gal - (climb.gallons - climb.minutes / 60.0 * 8.0 * 0.625)).abs() < 1e-9);
    }
}
