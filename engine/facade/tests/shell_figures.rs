//! The figures the apps once kept for themselves and now ask by name
//! (#482): the live feeds' cadence (weather's live_feeds), the hours a
//! search's "VFR at…" offers (weather's forecast/ahead) and how far back an
//! instructor's page lists (pilot's instructor_records), each held to the
//! shared cases in apps/web/src/lib/fixtures/shellFigures.json and its
//! input and answer to the contract (engine/contract/engine.schema.json).

mod common;

use common::{fixture, holds_cases as holds};
use wingtip_engine::call::call;

#[test]
fn the_live_feeds_are_asked_again_as_the_fixture_says() {
    let fixture = fixture("shellFigures.json");
    holds("live_feed_refresh", fixture["live_feed_refresh"].as_array().unwrap());
}

#[test]
fn vfr_at_offers_the_fixtures_hours() {
    let fixture = fixture("shellFigures.json");
    holds("vfr_at_hours", std::slice::from_ref(&fixture["vfr_at_hours"]));
}

#[test]
fn an_instructors_page_lists_three_years_back() {
    let fixture = fixture("shellFigures.json");
    holds("instructor_records_since", fixture["instructor_records_since"].as_array().unwrap());
}

#[test]
fn a_feed_it_does_not_know_is_refused() {
    assert!(call("live_feed_refresh", r#"{"feed":"metar"}"#).is_err());
}
