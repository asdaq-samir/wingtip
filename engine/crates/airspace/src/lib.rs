//! wingtip-airspace: the airspace and the cycle packs, over wingtip-core,
//! wingtip-procedures and wingtip-radio (engine/README.md).
//!
//! - airspace: whether an airspace volume holds a point;
//! - field_name: a field's NASR name as every app writes it, codes kept;
//! - pack: the cycle pack, one file per FAA cycle;
//! - rules: the airspace over a point in bands, with the rules of each;
//! - pack_query: the planner's airspace-at-a-point answer from a phone's pack;
//! - view: the map's airspace, airports and VORs in view from the packs,
//!   as the planner's in-view endpoints answer them;
//! - ahead: the alerts ahead of the airplane from the phone's packs;
//! - spoken, spoken_ask: the places a clearance names, found among those
//!   the planner gives or the phone's packs keep, and its SID and STAR;
//! - view_marks, sua_tab: the special-use areas, their tabs and the fixes in view;
//! - volume_span: how high a 3D map stands a volume, from its limits;
//! - drills: the oral's flash cards (91.125, 91.155) and 91.155 by name;
//! - class_b_band: which Class B band of a profile holds an altitude (91.131).

pub mod ahead;
pub mod airspace;
pub mod calls;
pub mod class_b_band;
pub mod drills;
pub mod field_name;
pub mod pack;
pub mod pack_query;
pub mod rules;
pub mod spoken;
pub mod spoken_ask;
#[cfg(test)]
mod spoken_closed_tests;
pub mod sua_tab;
pub mod view;
pub mod view_marks;
pub mod volume_span;

// The modules below this crate by the names they had when the engine was
// one crate, so the code reads them as crate::json and so on.
use wingtip_core::{geo, json, sort};
use wingtip_procedures::figures;
use wingtip_radio::clearance;
