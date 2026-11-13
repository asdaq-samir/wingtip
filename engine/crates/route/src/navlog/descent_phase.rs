//! The descent flown as its own phase of flight, as the climb is
//! (climbs.rs): at the airplane's descent speed and fuel flow, from its
//! handbook, over the miles each descent with_descents placed covers.
//!
//! A handbook gives a descent's speed indicated, as it gives the climb's
//! Vy (a POH's section 5 descent chart, or its cruise-descent figure), so
//! the profile's `descent_ias_kt` is indicated and flown here as a true
//! airspeed at the descent's middle altitude in the leg's air: TAS is
//! calibrated airspeed corrected for altitude and nonstandard temperature
//! (FAA-H-8083-25C, PHAK ch. 8, "Airspeed indicator"), CAS over the
//! square root of the density ratio, taking indicated for calibrated (a
//! light single's installation error at descent speeds is a knot or two,
//! the POH's airspeed calibration table). The wind triangle is the leg's
//! own wind at that TAS (legs::wind_triangle, PHAK ch. 16), and the time
//! is the miles over its ground speed, the fuel that time at the descent's
//! flow (PHAK ch. 16, "Flight planning").

use super::climbs::isa_dev_c;
use super::descents::flown_at_end;
use super::legs::{wind_of, wind_triangle};
use super::{Obj, Profile, R};
use crate::geo::py_mod;
use crate::json::Value;
use wingtip_flight::flight::{density_ratio, isa_temp_c};

/// One descent as with_descents placed it: where along the legs it starts
/// and levels off, the altitudes, and the leg its top of descent is on.
pub struct Segment {
    pub at: f64,
    pub level_at: f64,
    pub from_ft: f64,
    pub to_ft: f64,
    pub leg: usize,
}

/// A descent's figures on one leg: its TAS, wind correction, headings,
/// ground speed and the airplane's descent flow.
struct DescentAir {
    tas_kt: f64,
    wca_deg: f64,
    groundspeed_kt: f64,
    true_heading_deg: Option<f64>,
    magnetic_heading_deg: Option<f64>,
    burn_gph: f64,
}

impl DescentAir {
    fn on(leg: &Obj, ias_kt: f64, burn_gph: f64, s: &Segment) -> R<DescentAir> {
        // The middle of the descent, in the leg's air carried down at the
        // standard lapse rate (as the climb's is: isa_dev_c).
        let mid_ft = (s.from_ft + s.to_ft) / 2.0;
        let sigma = density_ratio(mid_ft, isa_temp_c(mid_ft) + isa_dev_c(Some(leg))?);
        let tas_kt = ias_kt / sigma.sqrt();
        let Some(tc) = leg.opt("true_course_deg")? else {
            return Ok(DescentAir {
                tas_kt,
                wca_deg: 0.0,
                groundspeed_kt: tas_kt,
                true_heading_deg: None,
                magnetic_heading_deg: None,
                burn_gph,
            });
        };
        let (wca, gs) = wind_triangle(tc, wind_of(leg.get("wind").unwrap_or(&Value::Null))?, tas_kt);
        let true_heading = py_mod(tc + wca, 360.0);
        // East variation is least, west is best (FAA-H-8083-25C ch. 16).
        let magnetic = leg.opt("magnetic_variation_deg")?.map(|v| py_mod(true_heading - v, 360.0));
        Ok(DescentAir {
            tas_kt,
            wca_deg: wca,
            // At least 1 kt where a crosswind stronger than the descent
            // speed holds no heading, as the climb's.
            groundspeed_kt: gs.max(1.0),
            true_heading_deg: Some(true_heading),
            magnetic_heading_deg: magnetic,
            burn_gph,
        })
    }

    /// The descent's figures on `to`: a leg flown wholly in the descent,
    /// or a top of descent for the piece of its leg after it.
    fn state_on(&self, to: &mut Obj) {
        to.set_num("tas_kt", self.tas_kt);
        to.set_num("groundspeed_kt", self.groundspeed_kt);
        to.set_num("fuel_burn_gph", self.burn_gph);
        if let Some(th) = self.true_heading_deg {
            to.set_num("wca_deg", self.wca_deg);
            to.set_num("true_heading_deg", th);
        }
        if let Some(mh) = self.magnetic_heading_deg {
            to.set_num("magnetic_heading_deg", mh);
        }
    }
}

/// The descents `segments` flown on `legs` (`starts` and `ends` their
/// miles along). With no airplane (`profile` None), nothing: the legs have
/// no times. With an airplane short of a descent speed or flow, the
/// descents stay at the cruise's figures and each top of descent says so
/// (`descent_at_cruise`), for the app to ask for them (the owner,
/// 2026-11-09: ask, never assume). Otherwise, on each leg a descent
/// crosses, its miles there are flown at the descent's ground speed and
/// flow in place of the cruise's: the leg's time and fuel change by the
/// difference, so the totals, the legs' sum, follow. The row says the
/// phase it is flown in: a leg descended whole states the descent's
/// figures; a leg cut at its top of descent keeps the cruise's, and its
/// top carries the descent's for the piece after it, that piece's ground
/// speed its miles over its minutes where it levels off before the leg's
/// end; a leg the descent leaves mid-way, uncut, states its miles over its
/// minutes as its ground speed. Each top's rate is the descent's feet over
/// its minutes, to the nearest 50 fpm.
pub fn fly(legs: &mut [Obj], starts: &[f64], ends: &[f64], segments: &[Segment], profile: Option<&Profile>) -> R<()> {
    let Some(profile) = profile else { return Ok(()) };
    let figures = profile.airplane.descent();
    for s in segments {
        let Some((ias_kt, burn_gph)) = figures else {
            set_on_tod(&mut legs[s.leg], |tod| tod.set("descent_at_cruise", Value::Bool(true)))?;
            continue;
        };
        let mut descent_min = 0.0;
        for i in 0..legs.len() {
            let ov = (s.level_at.min(ends[i]) - s.at.max(starts[i])).max(0.0);
            if ov < 0.05 {
                continue;
            }
            let leg = &legs[i];
            let Some(cruise_gs) = leg.opt("groundspeed_kt")?.filter(|g| *g > 0.0) else { continue };
            let Some(ete) = leg.opt("ete_min")? else { continue };
            let air = DescentAir::on(leg, ias_kt, burn_gph, s)?;
            let down_min = ov / air.groundspeed_kt * 60.0;
            let cruise_min = ov / cruise_gs * 60.0;
            descent_min += down_min;
            let cruise_burn = leg.opt("fuel_burn_gph")?.unwrap_or(0.0);
            let distance = leg.num("distance_nm")?;
            let (end_min, _) = flown_at_end(leg)?;
            let new_ete = ete + down_min - cruise_min;
            let leg = &mut legs[i];
            leg.set_num("ete_min", new_ete);
            if let Some(fuel) = leg.opt("fuel_gal")? {
                leg.set_num("fuel_gal", fuel + down_min / 60.0 * burn_gph - cruise_min / 60.0 * cruise_burn);
            }
            if i == s.leg {
                // The piece after the top: the descent, and any level
                // flight after it to the leg's end at the cruise's speed.
                let rest_nm = ends[i] - s.at;
                let rest_min = down_min + (rest_nm - ov) / cruise_gs * 60.0;
                set_on_tod(leg, |tod| {
                    air.state_on(tod);
                    tod.set_num("groundspeed_kt", rest_nm / rest_min * 60.0);
                    tod.set("descent_at_cruise", Value::Bool(false));
                })?;
            } else if ov >= distance - 0.05 && !leg.has("toc") {
                air.state_on(leg);
                leg.set("phase", Value::String("descent".to_owned()));
            } else {
                let line_min = new_ete - end_min;
                if line_min > 0.0 {
                    leg.set_num("groundspeed_kt", distance / line_min * 60.0);
                }
            }
        }
        if descent_min > 0.0 {
            let fpm = ((s.from_ft - s.to_ft) / descent_min / 50.0).round_ties_even() * 50.0;
            set_on_tod(&mut legs[s.leg], |tod| tod.set_num("fpm", fpm))?;
        }
    }
    Ok(())
}

/// `change` made to a leg's top of descent, where it has one.
fn set_on_tod(leg: &mut Obj, change: impl FnOnce(&mut Obj)) -> R<()> {
    if let Some(t @ Value::Object(_)) = leg.get("tod") {
        let mut tod = Obj::read("navlog", t)?;
        change(&mut tod);
        leg.set("tod", tod.value());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::descents::{with_descents, End};
    use super::*;
    use wingtip_flight::performance::Airplane;

    fn profile(descent: Option<(f64, f64)>) -> Profile {
        Profile {
            airplane: Airplane {
                cruise_tas_kt: 100.0,
                fuel_burn_gph: 8.0,
                descent_ias_kt: descent.map(|d| d.0),
                descent_fuel_burn_gph: descent.map(|d| d.1),
                ..Airplane::default()
            },
            ..Profile::default()
        }
    }

    /// Two 20 nm legs due north at 5,500 ft in still air, 100 kt and 8 gph.
    fn legs() -> (Vec<Obj>, Vec<Obj>) {
        let leg = || {
            let mut l = Obj::default();
            for (k, v) in [("distance_nm", 20.0), ("altitude_ft", 5500.0), ("true_course_deg", 0.0), ("magnetic_variation_deg", 0.0)] {
                l.set_num(k, v);
            }
            for (k, v) in [("groundspeed_kt", 100.0), ("tas_kt", 100.0), ("ete_min", 12.0), ("fuel_burn_gph", 8.0), ("fuel_gal", 1.6)] {
                l.set_num(k, v);
            }
            l.set("wind", Value::Null);
            l
        };
        let fix = |lat: f64| {
            let mut f = Obj::default();
            f.set_num("lat", lat);
            f.set_num("lon", -90.0);
            f
        };
        (vec![leg(), leg()], vec![fix(40.0), fix(40.333), fix(40.667)])
    }

    #[test]
    fn a_descent_with_its_own_figures_is_flown_at_them_and_its_row_agrees() {
        // Down 4,000 ft to a 1,500 ft pattern at the end, three to one:
        // 12 nm, the top 8 nm into the second leg. 100 KIAS at the
        // descent's middle, 3,500 ft on a standard day, is 100 /
        // sqrt(0.90152) = 105.32 kt true (PHAK ch. 8), so the 12 nm take
        // 6.836 min where the cruise took 7.2, and burn 5 gph: the leg is
        // 4.8 + 6.836 = 11.636 min and 0.64 + 0.570 = 1.210 gal. The piece
        // after the top is 12 nm in 6.836 min, 105.32 kt.
        let (l, fixes) = legs();
        let end = End { altitude_ft: Some(1500.0), before_nm: 0.0, fix: None };
        let out = with_descents(&l, &fixes, &end, Some(&profile(Some((100.0, 5.0))))).unwrap();
        let leg = &out[1];
        assert!((leg.num("ete_min").unwrap() - (4.8 + 12.0 / 105.32 * 60.0)).abs() < 0.01);
        assert!((leg.num("fuel_gal").unwrap() - (0.64 + 12.0 / 105.32 * 5.0)).abs() < 0.001);
        let tod = Obj::read("test", leg.get("tod").unwrap()).unwrap();
        assert!((tod.num("along_nm").unwrap() - 8.0).abs() < 1e-9);
        assert!((tod.num("groundspeed_kt").unwrap() - 105.32).abs() < 0.01);
        assert!((tod.num("tas_kt").unwrap() - 105.32).abs() < 0.01);
        assert_eq!(tod.num("fuel_burn_gph").unwrap(), 5.0);
        // 4,000 ft in 6.836 min is 585 fpm, 600 to the nearest 50.
        assert_eq!(tod.num("fpm").unwrap(), 600.0);
        assert_eq!(tod.get("descent_at_cruise"), Some(&Value::Bool(false)));
        // The leg before it is untouched, and the piece before the top is
        // the cruise's: the leg keeps 100 kt.
        assert_eq!(out[0].num("ete_min").unwrap(), 12.0);
        assert_eq!(leg.num("groundspeed_kt").unwrap(), 100.0);
    }

    #[test]
    fn without_the_figures_the_descent_is_the_cruises_and_says_so() {
        let (l, fixes) = legs();
        let end = End { altitude_ft: Some(1500.0), before_nm: 0.0, fix: None };
        let out = with_descents(&l, &fixes, &end, Some(&profile(None))).unwrap();
        assert_eq!(out[1].num("ete_min").unwrap(), 12.0);
        let tod = Obj::read("test", out[1].get("tod").unwrap()).unwrap();
        assert_eq!(tod.get("descent_at_cruise"), Some(&Value::Bool(true)));
        // No airplane: no word on it either way.
        let none = with_descents(&l, &fixes, &end, None).unwrap();
        assert_eq!(Obj::read("test", none[1].get("tod").unwrap()).unwrap().get("descent_at_cruise"), None);
    }
}
