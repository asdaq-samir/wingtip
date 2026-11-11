//! The dry run played against the forecast (owner, 2026-11-09): as the
//! planned flight is flown on paper from its departure time (route's
//! motion::dry_run, played by each app), the weather it meets is the
//! weather forecast for the time it gets there, not now. For each of the
//! run's samples (a time, a place, an altitude, the nav log's leg):
//!
//! - the forecast ceiling and visibility there then (met.rs): the TAF
//!   that speaks for the place at that time and the NWS's Gridded LAMP
//!   for that hour, the worse of the two;
//! - the winds aloft at its altitude from the GFS period covering that
//!   time (winds.rs);
//! - the SIGMETs, G-AIRMET snapshots and SPC convective outlook areas in
//!   force then over it (checks.rs);
//!
//! and from them each leg's worst flight category for the timeline strip,
//! each landing's TAF at its time, and an alert where the airplane would
//! first meet forecast weather under 14 CFR 91.155's VFR minimums or the
//! pilot's own, or enter an advisory area (checks.rs). The hosts fetch the
//! products (the planner's wingtip.forecast_run); the engine decides what
//! they mean for the flight, once, for every app.

mod call;
mod checks;
mod met;

pub use call::call;
pub use checks::{Alert, Area, Kind};
pub use met::{Met, Source};

use crate::json::Value;
use crate::winds::WindAt;

/// The GLMP is issued hourly, each forecast hour valid at its hour (NWS
/// MDL, Gridded LAMP): a sample takes the hour nearest its time, within
/// half an hour either side, and none past the last hour issued.
pub const MODELLED_REACH_S: f64 = 1800.0;
/// The window round a landing its TAF is read over: an hour either side
/// of the time the run is in -- the window 14 CFR 91.169(b)(2)(i) reads a
/// destination's forecast over ("for at least 1 hour before and for 1
/// hour after the estimated time of arrival"), the one the FAA uses for
/// an arrival's forecast -- and from the departure time an hour on.
pub const FIELD_WINDOW_S: f64 = 3600.0;

/// The GLMP's forecast for one hour at a sample.
#[derive(Clone, Debug, PartialEq)]
pub struct Modelled {
    pub valid: f64,
    pub ceiling_ft: Option<f64>,
    pub visibility_sm: Option<f64>,
}

/// One GFS period's winds at the station nearest a sample, and the hours
/// it is used for (gfs.py's period_of: "use_from", "use_to").
#[derive(Clone, Debug, PartialEq)]
pub struct WindPeriod {
    pub from: f64,
    pub to: f64,
    pub levels: Vec<(f64, Option<f64>, f64)>,
}

/// A point of the run: when (s since 1970), where, how high (ft MSL), the
/// nav log's row it is flying to, and what the host found for it.
#[derive(Clone, Debug, PartialEq)]
pub struct Sample {
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
    pub alt_ft: Option<f64>,
    pub row: usize,
    pub modelled: Vec<Modelled>,
    pub winds: Vec<WindPeriod>,
}

/// Where a field is in the flight.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Departure,
    Stop,
    Destination,
}

impl Role {
    pub fn word(self) -> &'static str {
        match self {
            Role::Departure => "departure",
            Role::Stop => "stop",
            Role::Destination => "destination",
        }
    }
}

/// A field the run takes off from or lands at, and when.
#[derive(Clone, Debug, PartialEq)]
pub struct Field {
    pub ident: String,
    pub role: Role,
    pub t: f64,
    pub lat: f64,
    pub lon: f64,
}

/// The pilot's personal minimums, each none until set (lib/minimums).
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Minimums {
    pub ceiling_ft: Option<f64>,
    pub visibility_sm: Option<f64>,
}

/// What the run is played against.
pub struct Input<'a> {
    pub track: Vec<Sample>,
    pub fields: Vec<Field>,
    /// TAF stations as awc.rs keeps them ({icaoId, lat, lon,
    /// elevation_ft, fcsts}).
    pub tafs: &'a [Value],
    /// SIGMETs and convective SIGMETs as awc.rs keeps them.
    pub sigmets: &'a [Value],
    /// G-AIRMET snapshots as awc.rs keeps them.
    pub gairmets: &'a [Value],
    /// SPC convective outlook areas: {label, valid_from, valid_to, coords}.
    pub outlooks: &'a [Value],
    /// Flown under VFR: 91.155's minimums are held to.
    pub vfr: bool,
    pub minimums: Minimums,
}

/// What a sample meets.
#[derive(Clone, Debug, PartialEq)]
pub struct Meets {
    pub met: Met,
    pub wind: Option<WindAt>,
    /// The indexes of the areas (Run::areas) it is in.
    pub areas: Vec<usize>,
}

/// A leg of the nav log as the run flies it: its row, when it is flown and
/// the worst category forecast along it, with the sample that has it.
#[derive(Clone, Debug, PartialEq)]
pub struct Leg {
    pub row: usize,
    pub from_t: f64,
    pub to_t: f64,
    pub category: Option<&'static str>,
    pub worst: Option<usize>,
}

/// A landing's or the departure's forecast at its time.
#[derive(Clone, Debug, PartialEq)]
pub struct FieldMet {
    pub field: Field,
    pub met: Met,
}

/// The run against the forecast.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Run {
    pub samples: Vec<Meets>,
    pub legs: Vec<Leg>,
    pub fields: Vec<FieldMet>,
    pub areas: Vec<Area>,
    pub alerts: Vec<Alert>,
}

/// The run played against the forecast (the module's doc).
pub fn run(input: &Input) -> Run {
    let areas = checks::areas_met(input);
    let samples: Vec<Meets> = input
        .track
        .iter()
        .map(|s| Meets { met: met::at_sample(input.tafs, s), wind: met::wind_at(s), areas: checks::areas_at(&areas, s) })
        .collect();
    let fields: Vec<FieldMet> = input.fields.iter().map(|f| FieldMet { field: f.clone(), met: met::at_field(input.tafs, f) }).collect();
    let legs = legs_of(&input.track, &samples);
    let alerts = checks::alerts(input, &samples, &fields, &areas);
    Run { samples, legs, fields, areas, alerts }
}

/// Each leg's samples together, in the run's order, and the worst category
/// among them (forecast::rank).
fn legs_of(track: &[Sample], samples: &[Meets]) -> Vec<Leg> {
    let mut legs: Vec<Leg> = Vec::new();
    for (i, (s, m)) in track.iter().zip(samples).enumerate() {
        let category = m.met.category;
        match legs.last_mut() {
            Some(leg) if leg.row == s.row => {
                leg.to_t = s.t;
                if super::rank(category) > super::rank(leg.category) {
                    leg.category = category;
                    leg.worst = Some(i);
                }
            }
            _ => legs.push(Leg { row: s.row, from_t: s.t, to_t: s.t, category, worst: category.map(|_| i) }),
        }
    }
    legs
}

/// A time of day as aviation writes it, UTC: "1420Z".
pub fn zulu(t: f64) -> String {
    let day = t.rem_euclid(86_400.0) as i64;
    format!("{:02}{:02}Z", day / 3600, (day % 3600) / 60)
}

#[cfg(test)]
mod tests;
