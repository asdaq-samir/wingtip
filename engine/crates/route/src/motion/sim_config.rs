//! What a simulator draws on the airplane beside where it is (sim): the
//! gear, the flaps and the lights, none of which ADS-B sends, so each is
//! estimated from the phase of flight the track shows, and every format
//! that carries them says so. The phases, in order along a run:
//!
//! - On the ground before it flies: gear down, takeoff flaps, the taxi
//!   light while it moves.
//! - Off the ground: gear and flaps stay down until it is climbing
//!   ("Once a positive rate of climb is established, the pilot should
//!   retract the flaps and landing gear (if equipped)", FAA-H-8083-3C ch.
//!   6) and GEAR_UP_S have passed, so they do not fold on the runway.
//! - Descending (DESCENDING_FPM) below CONFIG_AGL_FT above the ground: gear and full flaps
//!   down, the landing configuration a stabilized approach has by 1,000 ft
//!   above the airport (AC 120-108, "1,000 feet above the airport
//!   elevation"; AC 91-79A: "The airplane is in the correct landing
//!   configuration"); climbing back above it, a go-around, they come up.
//! - On the ground after it has flown: full flaps through the roll-out,
//!   up once it slows to a taxi.
//!
//! The lights by AIM 4-3-24 and 14 CFR 91.209: position (navigation),
//! anticollision (beacon) and logo lights on throughout ("Prior to
//! commencing taxi, it is recommended to turn on navigation, position,
//! anti-collision, and logo lights"; the beacon "anytime their aircraft
//! engines are in operation"); strobes on the runway and in the air, not
//! while taxiing; landing lights for the takeoff and in flight below
//! 10,000 ft ("Operation Lights On"); the taxi light while moving on the
//! ground.

/// Above the ground on a descent below which the landing gear and flaps
/// are down, ft (module note).
pub const CONFIG_AGL_FT: f64 = 1_000.0;
/// Least time off the ground before the gear comes up, s: a design figure,
/// not a rule, so a climb read the moment it lifts does not fold the gear
/// over the runway.
pub const GEAR_UP_S: f64 = 5.0;
/// Takeoff flaps as a fraction of the handle's travel: a design figure for
/// the picture (a first notch on most airplanes), as the airplane's own
/// setting is not known.
pub const TAKEOFF_FLAPS: f64 = 0.25;
/// Faster than this on the ground is a takeoff or landing roll, not a
/// taxi, kt: a design figure, past any taxi speed and short of any
/// airplane's rotation.
pub const RUNWAY_KT: f64 = 40.0;
/// A descent at least this steep, ft/min, is one that lowers the gear
/// below CONFIG_AGL_FT: a design figure, past the dips a climb-out's
/// reports show (N14511 read -24 ft/min at 120 ft just after takeoff on
/// 2026-11-10) and short of any approach's descent.
pub const DESCENDING_FPM: f64 = 300.0;
/// Slower than this on the ground is stopped, kt.
pub const MOVING_KT: f64 = 3.0;
/// AIM 4-3-24: landing lights on "when operating below 10,000 feet".
pub const LIGHTS_BELOW_FT: f64 = 10_000.0;

/// The configuration of one frame, all estimated.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Config {
    pub gear_down: bool,
    /// The flap handle, 0 up to 1 full.
    pub flaps: f64,
    pub nav: bool,
    pub beacon: bool,
    pub strobe: bool,
    pub landing: bool,
    pub taxi: bool,
    pub logo: bool,
}

#[derive(Clone, Copy, PartialEq)]
enum Phase {
    Ground,
    Takeoff { liftoff: f64 },
    Clean,
    Approach,
}

/// What a frame's configuration is read from: its time (s), whether it is
/// on the ground, its ground speed (kt), vertical speed (ft/min), altitude
/// and height above the ground (ft; None where the ground is not known).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    pub t: f64,
    pub ground: bool,
    pub gs_kt: f64,
    pub vs_fpm: f64,
    pub alt_ft: f64,
    pub agl_ft: Option<f64>,
}

/// Each frame's configuration (module note).
pub fn configure(frames: &[Frame]) -> Vec<Config> {
    let mut phase: Option<Phase> = None;
    let mut flown = false;
    frames
        .iter()
        .map(|&Frame { t, ground, gs_kt: gs, vs_fpm: vs, alt_ft: alt, agl_ft: agl }| {
            let low = agl.is_some_and(|a| a < CONFIG_AGL_FT);
            phase = Some(if ground {
                Phase::Ground
            } else {
                let now = match phase {
                    Some(Phase::Ground) => Phase::Takeoff { liftoff: t },
                    Some(p) => p,
                    None => Phase::Clean,
                };
                match now {
                    Phase::Takeoff { liftoff } if (t - liftoff >= GEAR_UP_S && vs > 0.0) || (!low && agl.is_some()) => Phase::Clean,
                    Phase::Clean if vs <= -DESCENDING_FPM && low => Phase::Approach,
                    Phase::Approach if vs > 0.0 && !low => Phase::Clean,
                    p => p,
                }
            });
            let (gear_down, flaps) = match phase {
                Some(Phase::Ground) if flown => (true, if gs >= RUNWAY_KT { 1.0 } else { 0.0 }),
                Some(Phase::Ground) | Some(Phase::Takeoff { .. }) => (true, TAKEOFF_FLAPS),
                Some(Phase::Approach) => (true, 1.0),
                _ => (false, 0.0),
            };
            flown |= !ground;
            let rolling = ground && gs >= RUNWAY_KT;
            Config {
                gear_down,
                flaps,
                nav: true,
                beacon: true,
                strobe: !ground || rolling,
                landing: (!ground && alt < LIGHTS_BELOW_FT) || rolling,
                taxi: ground && (MOVING_KT..RUNWAY_KT).contains(&gs),
                logo: true,
            }
        })
        .collect()
}

/// The configuration's members, after a frame's others.
pub fn write(out: &mut String, c: &Config) {
    let flag = |b: bool| if b { "true" } else { "false" };
    out.push_str(&format!(
        ",\"gear_down\":{},\"flaps\":{},\"lights\":{{\"nav\":{},\"beacon\":{},\"strobe\":{},\"landing\":{},\"taxi\":{},\"logo\":{}}}",
        flag(c.gear_down),
        if c.flaps == 0.0 { "0".to_owned() } else { format!("{:?}", c.flaps) },
        flag(c.nav),
        flag(c.beacon),
        flag(c.strobe),
        flag(c.landing),
        flag(c.taxi),
        flag(c.logo),
    ));
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A departure, a climb, a cruise, an approach and a landing, one
    /// frame a second: (t, ground, gs, vs, alt, agl).
    fn flight() -> Vec<Frame> {
        let at = |t: i32, ground: bool, gs_kt: f64, vs_fpm: f64, alt_ft: f64, agl_ft: f64| Frame {
            t: t as f64,
            ground,
            gs_kt,
            vs_fpm,
            alt_ft,
            agl_ft: Some(agl_ft),
        };
        let mut f = Vec::new();
        for t in 0..30 {
            f.push(at(t, true, if t < 10 { 15.0 } else { 60.0 + t as f64 * 2.0 }, 0.0, 600.0, 0.0));
        }
        for t in 30..200 {
            let agl = (t - 30) as f64 * 15.0;
            f.push(at(t, false, 120.0, 900.0, 600.0 + agl, agl));
        }
        for t in 200..300 {
            let agl = 2550.0 - (t - 200) as f64 * 25.0;
            f.push(at(t, false, 110.0, -700.0, 600.0 + agl, agl));
        }
        for t in 300..340 {
            f.push(at(t, true, if t < 320 { 70.0 } else { 15.0 }, 0.0, 600.0, 0.0));
        }
        f
    }

    #[test]
    fn the_gear_comes_up_once_climbing_and_down_below_1000_ft_on_the_way_down() {
        let c = configure(&flight());
        assert!(c[5].gear_down && c[5].flaps == TAKEOFF_FLAPS);
        // Off the ground at 30 s: still down for GEAR_UP_S, then up.
        assert!(c[33].gear_down && !c[36].gear_down && c[36].flaps == 0.0);
        // The descent passes 1,000 ft above the ground at 262 s (2,550 - 62 x 25).
        assert!(!c[261].gear_down && c[263].gear_down && c[263].flaps == 1.0);
        // Rolling out with full flaps, then flaps up to taxi in.
        assert!(c[310].flaps == 1.0 && c[330].flaps == 0.0 && c[330].gear_down);
    }

    #[test]
    fn a_dip_in_the_climb_out_does_not_lower_the_gear_again() {
        let mut f = flight();
        // At 50 s, 300 ft up, the reports read level for a few seconds.
        for frame in f.iter_mut().take(55).skip(50) {
            frame.vs_fpm = -24.0;
        }
        let c = configure(&f);
        assert!(!c[52].gear_down && c[52].flaps == 0.0);
    }

    #[test]
    fn the_lights_follow_the_aim() {
        let c = configure(&flight());
        // Taxiing: taxi light, no strobes, no landing light.
        assert!(c[5].taxi && !c[5].strobe && !c[5].landing && c[5].beacon && c[5].nav);
        // The takeoff roll: strobes and landing lights, no taxi light.
        assert!(c[20].strobe && c[20].landing && !c[20].taxi);
        // Climbing past 10,000 ft MSL the landing lights go off (AIM 4-3-24).
        let mut high = flight();
        high[100].alt_ft = 10_000.0;
        high[101].alt_ft = 9_999.0;
        let c = configure(&high);
        assert!(!c[100].landing && c[101].landing);
    }

    #[test]
    fn a_go_around_climbing_back_above_1000_ft_takes_the_gear_up() {
        let mut f = flight();
        for (k, frame) in f.iter_mut().enumerate().take(300).skip(270) {
            let agl = 800.0 + (k - 270) as f64 * 20.0;
            *frame = Frame { t: k as f64, ground: false, gs_kt: 110.0, vs_fpm: 1200.0, alt_ft: 600.0 + agl, agl_ft: Some(agl) };
        }
        let c = configure(&f);
        assert!(c[265].gear_down);
        assert!(c[278].gear_down, "still under 1,000 ft");
        assert!(!c[295].gear_down, "back above 1,000 ft, climbing");
    }
}
