//! wingtip-engine: the planner's figures in plain Rust, with no network
//! and nothing but std, so the same code answers on the planner (through
//! engine/bindings/py, the wingtip_native module) and on the phones (through
//! engine/bindings/ffi's C functions: iOS from Swift, Android later from Kotlin).
//! It must build for aarch64-apple-ios and aarch64-linux-android as it
//! is: no Python, no host-only crates, and the cycle pack read from bytes
//! the caller maps.
//!
//! The engine is a facade over its crates (engine/crates, the layering in
//! engine/README.md): each module is a crate's, used here at the path it
//! had when the engine was one crate, so the hosts and the tests name
//! them as before. Only `call` is the facade's own.
//!
//! - call: one way in for every host, a rule asked by name with JSON in
//!   and JSON out (the web app's wasm, wingtip_native.call, wt_call);
//! - grid: route options' straight lines over the grid;
//! - ahead: the alerts ahead of the airplane from the phone's packs;
//! - airspace: whether an airspace volume holds a point;
//! - pack: the cycle pack, one file per FAA cycle;
//! - geo: great-circle distances, as wingtip.geo has them;
//! - rules: the airspace over a point in bands, with the rules of each;
//! - pack_query: the planner's airspace-at-a-point answer from a phone's pack;
//! - view: the map's airspace, airports and VORs in view from the packs,
//!   as the planner's in-view endpoints answer them;
//! - clearance: an ATC clearance heard, read into its items, and a call
//!   to us by its call sign (the web's lib/clearance and lib/heardCall);
//! - spoken: the places a clearance names, found in the phone's packs;
//! - figures: the debrief of a flown track (ACS PA.VI.A), the diversion
//!   drill (PA.VI.C), a hold's entry and wind (AIM 5-3-8) and lost
//!   communications' altitudes (14 CFR 91.185), with their words;
//! - motion: the things that move -- traffic about own ship, a watched
//!   airplane's alerts, the glide range, the plan's profile and its dry
//!   run, a flown track read from its file;
//! - gonogo: the Brief's Go / No-Go -- its seven findings and the line
//!   over them, the pilot's minimums, icing under IFR, the risk
//!   assessment, the runway check, the weight and balance and the pass
//!   times (the web's lib/verdict and the modules it is fed from);
//! - autolog: a logbook entry drawn from the app's own flown track;
//! - pilot: the pilot's records and text -- a checklist, the logbook's
//!   CSV file, a handbook page, endorsements and ACS codes;
//! - route: the route's pilot-made pieces as the address writes them
//!   and the planner reads them -- the pilot's own point off a fix, holds,
//!   procedures and runways picked;
//! - runway: runways, the wind on them and the traffic pattern -- the end
//!   flown, its pattern's side, entry, altitude and legs, a POH's
//!   short-field distances and how an end suits the airplane;
//! - approach: instrument approaches taught (the brief, the coached dry
//!   run, the quiz) and debriefed against the procedure flown;
//! - altitude: the altitude a flight is planned at -- the terrain and
//!   obstacle floor (14 CFR 91.119), the IFR floor (91.177), the band under
//!   Class B, the clouds (91.155) and the service ceiling, the cruising
//!   altitudes by course (91.159, 91.179) and the words where none fits;
//! - inflight: the flight under way -- the in-flight copilot's ranked
//!   messages, its alternative from the emergency assistant's best_fields;
//! - flight: the wind triangle, 91.159's altitudes, 91.151's reserve, the atmosphere;
//! - wmm: magnetic variation from the World Magnetic Model;
//! - forecast: a field's flight category from what is known of its
//!   ceiling and visibility, and an hour of its TAF from the groups then;
//! - aircraft: the traffic list's filters (an airplane's kind, height,
//!   operator, emergency, how it stands to a field) and an airplane by its
//!   N-number, on its type's stock profile;
//! - wording: the FAA's own words in the app's -- its capitals in sentence
//!   case, names, the advisories' intensities, a field's radio and fuel, a
//!   VOR's radial, Morse and service volume;
//! - receiver: a portable ADS-B receiver's GDL 90 -- own ship, the
//!   traffic it hears and the FIS-B weather it is sent;
//! - validity: when a weather report stops counting;
//! - cycles: when an FAA data set's edition stops counting;
//! - metar, taf, winds, notam, tfr: the weather and NOTAM products as
//!   sent, read strictly (xml: the small XML reader they share; time:
//!   UTC dates).

pub mod call;

pub use wingtip_airspace::{ahead, airspace, drills, pack, pack_query, rules, spoken, view, view_marks};
pub use wingtip_altitude::altitude;
pub use wingtip_brief::{alternates, fields, gonogo, passengers, runway};
// Forecast icing along an IFR route (#216).
pub use wingtip_brief::icing_forecast;
pub use wingtip_procedures::figures;
// A procedure's legs drawn: arcs, holds, procedure turns (#482 phase 4b).
pub use wingtip_core::{base64, geo, geo_many, grid, sort, sums, time, units, wmm, xml};
pub use wingtip_flight::{filing, flight, limits, performance, sun};
pub use wingtip_procedures::paths;
// The in-flight copilot (copilot_watch).
pub use wingtip_inflight as inflight;
pub use wingtip_pilot::{aircraft, autolog, documents, pilot};
pub use wingtip_radio::{atc, atis, callsign, clearance, datis, instruction, mayday, readback};
pub use wingtip_receiver as receiver;
pub use wingtip_route::{approach, motion, navlog, route};
pub use wingtip_weather::{cycles, forecast, metar, notam, rvr, taf, tfr, validity, winds};
pub use wingtip_wording::wording;

// The JSON every rule reads and writes, as call.rs names it; not part of
// the engine's face, as it was not when the engine was one crate.
use wingtip_core::json;
