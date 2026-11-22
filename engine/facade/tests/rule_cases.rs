//! Each rule that states a figure or makes a decision, held to the shared
//! fixture cases of apps/web/src/lib/fixtures/rules, as every host asks it:
//! by name, JSON in and out (common/cases.rs). Each case's figure is the
//! source's it cites, the regulation's, the AIM's, the advisory circular's,
//! the handbook's or the POH's, or a boundary its text draws, asked from
//! both sides; never the code's own answer. The web and the phones can
//! read the same files.
//!
//! Left out, being plumbing with no figure or decision of their own (each
//! held by its own crate's tests): the feed readers
//! awc_gairmets_read, awc_pireps_read, awc_tafs_read, read_datis,
//! tfr_detail_read, procedures_read, runways_read and read_track; the
//! lookups and words airport_names, faa_ids, runway_end_key,
//! gonogo_runway_number, gonogo_picked_end, compass_word, point_kind,
//! emitter_category, aviation_grid_bands, registered_profile,
//! airplane_figures, airplane_needs, airplane_figure_ranges,
//! gonogo_icing_line, gonogo_risk_line and gonogo_self_checks; the
//! geometry helpers approach_along_nm, approach_path_between, thin_track
//! and regions_ahead; and the track readers approach_attempts,
//! approach_transition, debrief_airborne, debrief and dry_run, and
//! plan_profile over the nav log's rows, whose figures are the other
//! rules' here (its three to one is altitude_change's). Left out
//! for want of any source figure, being the app's own: diversion_reasonable
//! (the drill's allowances; the ACS gives none), gonogo_risk (the
//! assessment's own points), field_mark_rank (the map's drawing order) and
//! underway (40 kt, a design choice). bare_field and same_field wait on
//! the ident rule's move into the engine (claude/r2-ident).

mod common;

use common::cases::holds;

#[test]
fn a_runways_wind_and_the_runway_chosen_are_the_faas() {
    holds("rules/runwayWind.json");
}

#[test]
fn the_traffic_pattern_and_the_runway_landed_on_are_ac_90_66cs() {
    holds("rules/trafficPattern.json");
}

#[test]
fn the_runway_checks_are_the_pohs_tables_and_notes() {
    holds("rules/runwayFit.json");
}

#[test]
fn the_weather_rules_are_14_cfr_1_1s_91_175s_and_the_handbooks() {
    holds("rules/weather.json");
}

#[test]
fn the_go_no_go_rules_hold_to_their_sources() {
    holds("rules/gonogo.json");
}
