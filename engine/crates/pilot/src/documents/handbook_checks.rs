//! What to check about a handbook's figures once they are in the app's
//! units (handbook.rs): each against the band light airplanes' handbooks
//! give it, and against the others it must agree with.
//!
//! The bands are not rules: they are wide enough for the singles and light
//! twins the app plans for -- 14 CFR 1.1's small airplane, 12,500 lb
//! maximum certificated takeoff weight or less -- and a figure outside one
//! is flagged "check", for the pilot to read against the page. "wrong" is
//! kept for what cannot be right as read: a figure of zero or less where
//! there must be one, a distance over a 50 ft obstacle shorter than the
//! ground roll it includes, usable fuel above the total, a moment that is
//! not weight times arm, and true airspeeds that are indicated ones.

use super::envelope::{self, Corner};
use super::out::{check, figure, wrong, Flag};

/// 14 CFR 1.1, "Small aircraft": 12,500 pounds or less, maximum
/// certificated takeoff weight.
pub const SMALL_AIRPLANE_LB: f64 = 12_500.0;

/// A figure held to the band light airplanes' handbooks give it: none or
/// less is wrong where `positive`, outside [lo, hi] a check.
fn band(flags: &mut Vec<Flag>, what: &str, v: f64, unit: &str, lo: f64, hi: f64, positive: bool) {
    if positive && v <= 0.0 {
        flags.push(wrong(format!("{what} reads {} {unit}: it must be more than none.", figure(v))));
    } else if v < lo || v > hi {
        flags.push(check(format!("{what} reads {} {unit}, outside the {}–{} {unit} light airplanes' handbooks give.", figure(v), figure(lo), figure(hi))));
    }
}

/// A row of the cruise performance table, in the app's units.
#[derive(Clone, Debug)]
pub struct Cruise {
    pub altitude_ft: f64,
    pub power_pct: Option<f64>,
    pub rpm: Option<f64>,
    pub tas_kt: f64,
    pub burn_gph: f64,
}

/// Each cruise row's flags. `kind` is what the table's speeds are: the
/// profile flies true airspeed, so a table of indicated or calibrated ones
/// is wrong for it. Within one altitude, more power cannot give less
/// speed or burn less fuel.
pub fn cruise(rows: &[Cruise], kind: &str) -> Vec<Vec<Flag>> {
    rows.iter().enumerate().map(|(i, r)| {
        let mut f = Vec::new();
        if kind != "tas" {
            f.push(wrong(format!("The table's speeds read as {} airspeeds; the airplane's profile flies true airspeed (KTAS).",
                if kind == "cas" { "calibrated" } else { "indicated" })));
        }
        band(&mut f, "The pressure altitude", r.altitude_ft, "ft", 0.0, 25_000.0, false);
        if let Some(p) = r.power_pct {
            band(&mut f, "The power", p, "%", 40.0, 100.0, true);
        }
        band(&mut f, "The true airspeed", r.tas_kt, "kt", 50.0, 350.0, true);
        band(&mut f, "The fuel burn", r.burn_gph, "gph", 1.0, 60.0, true);
        for (j, o) in rows.iter().enumerate() {
            if j == i || o.altitude_ft != r.altitude_ft {
                continue;
            }
            match (r.power_pct, o.power_pct) {
                (Some(p), Some(q)) if p == q && j < i => f.push(check(format!("Another row reads the same {} ft and {}%.", figure(r.altitude_ft), figure(p)))),
                (Some(p), Some(q)) if p > q && (r.tas_kt < o.tas_kt || r.burn_gph < o.burn_gph) => f.push(check(format!(
                    "At {} ft, {}% reads less speed or less fuel than {}%: more power gives more of both.", figure(r.altitude_ft), figure(p), figure(q)))),
                _ => {}
            }
        }
        f
    }).collect()
}

/// The climb: its speed (indicated, Vy), rate and burn.
pub fn climb(speed_kias: Option<f64>, rate_fpm: Option<f64>, burn_gph: Option<f64>) -> Vec<Flag> {
    let mut f = Vec::new();
    if let Some(v) = speed_kias {
        band(&mut f, "The climb speed", v, "kt", 40.0, 200.0, true);
    }
    if let Some(v) = rate_fpm {
        band(&mut f, "The rate of climb", v, "fpm", 100.0, 3_000.0, true);
    }
    if let Some(v) = burn_gph {
        band(&mut f, "The climb's fuel burn", v, "gph", 1.0, 80.0, true);
    }
    f
}

/// The glide: best glide speed (indicated) and the glide ratio, feet
/// forward for each foot down (FAA-H-8083-3C, chapter 18, "Best glide
/// speed"); a light single's is about 9 to 1.
pub fn glide(speed_kias: Option<f64>, ratio: Option<f64>) -> Vec<Flag> {
    let mut f = Vec::new();
    if let Some(v) = speed_kias {
        band(&mut f, "The best glide speed", v, "kt", 40.0, 150.0, true);
    }
    if let Some(r) = ratio {
        if r <= 1.0 {
            f.push(wrong(format!("The glide ratio reads {} to 1: an airplane glides farther than it falls.", figure(r))));
        } else {
            band(&mut f, "The glide ratio", r, "to 1", 5.0, 20.0, true);
        }
    }
    f
}

/// A row of a takeoff or landing distance table, in the app's units.
#[derive(Clone, Debug)]
pub struct Distance {
    pub pressure_altitude_ft: f64,
    pub temp_c: f64,
    pub ground_roll_ft: f64,
    pub over_50ft_ft: f64,
}

/// Each row's flags. The distance over a 50 ft obstacle includes the
/// ground roll, so it is the longer; and at the same temperature a higher
/// field, or at the same field a warmer day, cannot take less distance
/// (the air is thinner: FAA-H-8083-25C, chapter 11, "Aircraft Performance").
pub fn distances(rows: &[Distance]) -> Vec<Vec<Flag>> {
    rows.iter().map(|r| {
        let mut f = Vec::new();
        band(&mut f, "The pressure altitude", r.pressure_altitude_ft, "ft", 0.0, 12_000.0, false);
        band(&mut f, "The temperature", r.temp_c, "°C", -40.0, 50.0, false);
        band(&mut f, "The ground roll", r.ground_roll_ft, "ft", 100.0, 6_000.0, true);
        band(&mut f, "The distance over 50 ft", r.over_50ft_ft, "ft", 200.0, 10_000.0, true);
        if r.over_50ft_ft < r.ground_roll_ft {
            f.push(wrong(format!("The distance over 50 ft ({} ft) reads shorter than the ground roll ({} ft) it includes.",
                figure(r.over_50ft_ft), figure(r.ground_roll_ft))));
        }
        let thinner = rows.iter().any(|o| {
            let higher = o.temp_c == r.temp_c && o.pressure_altitude_ft < r.pressure_altitude_ft;
            let cooler = o.pressure_altitude_ft == r.pressure_altitude_ft && o.temp_c < r.temp_c;
            (higher || cooler) && (o.ground_roll_ft > r.ground_roll_ft || o.over_50ft_ft > r.over_50ft_ft)
        });
        if thinner {
            f.push(check("A lower or cooler row reads longer than this one: thinner air takes more distance.".into()));
        }
        f
    }).collect()
}

/// The empty weight and its arm, held to its moment where the page gives
/// one: weight × arm as read, often in thousands (`divisor`), must agree
/// with it to within 1%, or one of the three is misread.
pub fn empty(weight_lb: Option<f64>, arm_in: Option<f64>, as_read: Option<(f64, f64, f64, f64)>) -> Vec<Flag> {
    let mut f = Vec::new();
    if let Some(w) = weight_lb {
        band(&mut f, "The empty weight", w, "lb", 300.0, SMALL_AIRPLANE_LB, true);
    }
    if let Some(a) = arm_in {
        band(&mut f, "The empty weight's arm", a, "in", -100.0, 300.0, false);
    }
    if let Some((w, a, m, divisor)) = as_read {
        let expected = w * a / divisor;
        if (expected - m).abs() > 0.01 * expected.abs().max(1.0) {
            f.push(wrong(format!("Weight × arm{} is {}, but the moment reads {}: one of the three is misread.",
                if divisor == 1.0 { String::new() } else { format!(" / {}", figure(divisor)) }, figure(expected), figure(m))));
        }
    }
    f
}

/// The maximum takeoff weight: above the empty weight, and a small
/// airplane's at most (a check: the app is for them).
pub fn max_weight(max_lb: f64, empty_lb: Option<f64>) -> Vec<Flag> {
    let mut f = Vec::new();
    band(&mut f, "The maximum takeoff weight", max_lb, "lb", 500.0, SMALL_AIRPLANE_LB, true);
    if let Some(e) = empty_lb.filter(|e| max_lb <= *e) {
        f.push(wrong(format!("The maximum takeoff weight ({} lb) reads no more than the empty weight ({} lb).", figure(max_lb), figure(e))));
    }
    f
}

/// The envelope: closed, simple, and topped at the maximum takeoff weight.
pub fn envelope(corners: &[Corner], max_lb: Option<f64>) -> Vec<Flag> {
    let mut f = Vec::new();
    let c = envelope::closed(corners);
    if c.len() < 3 {
        f.push(wrong(format!("The envelope has {} corner{}: it takes three at least.", c.len(), if c.len() == 1 { "" } else { "s" })));
        return f;
    }
    if envelope::repeated(&c) {
        f.push(check("A corner of the envelope is read twice.".into()));
    }
    if envelope::self_crossing(&c) {
        f.push(wrong("The envelope's sides cross: its corners are out of order. Read them going round.".into()));
    } else if envelope::area(&c) == 0.0 {
        f.push(wrong("The envelope's corners lie on one line.".into()));
    }
    for &(arm, weight) in &c {
        band(&mut f, "A corner's arm", arm, "in", -100.0, 300.0, false);
        band(&mut f, "A corner's weight", weight, "lb", 300.0, SMALL_AIRPLANE_LB, true);
    }
    let top = c.iter().map(|p| p.1).fold(f64::MIN, f64::max);
    if let Some(m) = max_lb.filter(|m| (top - m).abs() > 0.005 * m) {
        f.push(check(format!("The envelope's top reads {} lb, the maximum takeoff weight {} lb: they are the same on most charts.", figure(top), figure(m))));
    }
    f
}

/// The fuel: usable no more than the total, and an endurance at the
/// profile's cruise burn that a light airplane has.
pub fn fuel(total_gal: Option<f64>, usable_gal: Option<f64>, cruise_burn_gph: Option<f64>) -> Vec<Flag> {
    let mut f = Vec::new();
    if let Some(t) = total_gal {
        band(&mut f, "The total fuel", t, "gal", 5.0, 300.0, true);
    }
    if let Some(u) = usable_gal {
        band(&mut f, "The usable fuel", u, "gal", 5.0, 300.0, true);
        if let Some(t) = total_gal.filter(|t| u > *t) {
            f.push(wrong(format!("The usable fuel ({} gal) reads more than the total ({} gal).", figure(u), figure(t))));
        }
        if let Some(b) = cruise_burn_gph.filter(|b| *b > 0.0) {
            let hours = u / b;
            if !(1.0..=15.0).contains(&hours) {
                f.push(check(format!("{} gal at {} gph is {} hours: check the fuel or the burn.", figure(u), figure(b), figure(hours))));
            }
        }
    }
    f
}
