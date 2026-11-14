//! wingtip-weather: the weather and NOTAM products, over wingtip-core
//! only (engine/README.md).
//!
//! - metar, taf, winds, notam, tfr: the products as sent, read strictly;
//! - forecast: a field's flight category from what is known of its
//!   ceiling and visibility, and an hour of its TAF from the groups then;
//! - validity: when a weather report stops counting;
//! - notam_read: a NOTAM as a pilot reads it -- its keyword as a heading,
//!   its words written out (contractions: the FAA's contractions, the one
//!   table, which the radio's D-ATIS reads by too) and its window in UTC;
//! - lighting_read: a field's Chart Supplement lighting remarks as the
//!   systems they name and how each is turned on (AIM 2-1, 2-1-8), by the
//!   same table of contractions with the remarks' own;
//! - remarks_read: an airport's other remarks (its fuel's, its FBO's, its
//!   courtesy car's) in words, by the same tables, and the sentence reader
//!   lighting_read's notes are said by;
//! - tfr_contact: who a TFR's NOTAM names to call, its coordination
//!   facility and its point of contact, from its XNOTAM file;
//! - notam_subject: what one NOTAM addresses on an airport's card -- the
//!   field, a runway, a light, an approach, a frequency, the fuel -- with
//!   its badge's word (JO 7930.2's keywords and conditions);
//! - notam_rank: which of a flight's NOTAMs matter to it, best first
//!   (14 CFR 91.103);
//! - rvr: runway visual range against a visibility minimum (91.175(h));
//! - cycles: when an FAA data set's edition stops counting (AIRAC,
//!   the 56-day charts, the obstacle file);
//! - ready: ready to fly -- whether the device holds the charts, the
//!   cycle packs, the weather and the NOTAMs the flight needs, and what to
//!   fix while there is still a signal;
//! - model_weather: the map's model weather in a pilot's words -- the
//!   precipitation's intensity (AIM 7-1-12), the sky's cover (AIM 7-1-28),
//!   the ceiling's bands (AIM 7-1-7) and CAPE's categories (NWS);
//! - flow_sample: Model Weather's reading of a field's picture at a point,
//!   the wind from its parts;
//! - aloft_grid: the wind and temperature a leg flies in, read from the
//!   winds-aloft grid by level and by hour;
//! - model_levels: the GFS's levels at a station in the winds aloft's
//!   feet, knots and degrees Celsius, the wind from its parts;
//! - gairmet_window: the time a G-AIRMET snapshot stands for (AIM 7-1-6);
//! - aviation_grids: the Aviation Weather Center's grids by level -- the
//!   levels, AWC's icing categories, its turbulence thresholds by weight
//!   class and its GFA cloud text;
//! - freezing: freezing rain and drizzle (FZRA, FZDZ) in a field's METAR
//!   or TAF, which ices an airplane out of cloud (AIM 7-1-20);
//! - worse: what counts as a route's weather getting worse between two
//!   readings of its briefing (AIM 7-1-6, 7-1-7).

pub mod aloft_grid;
pub mod aviation_grids;
pub mod calls;
pub mod contractions;
pub mod cycles;
pub mod flow_sample;
pub mod forecast;
pub mod freezing;
pub mod gairmet_window;
pub mod lighting_read;
pub mod metar;
pub mod model_levels;
pub mod model_weather;
pub mod notam;
pub mod notam_rank;
pub mod notam_read;
pub mod notam_subject;
pub mod ready;
pub mod remarks_read;
pub mod rvr;
pub mod sky;
pub mod taf;
pub mod tfr;
pub mod tfr_contact;
pub mod validity;
pub mod winds;
pub mod worse;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json and so on.
use wingtip_core::{geo, json, sort, text, time, xml};
