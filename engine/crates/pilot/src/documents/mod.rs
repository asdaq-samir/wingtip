//! A photographed page read into figures, checked before the pilot sees
//! them: what a model read off a handbook's performance or weight and
//! balance pages, or off a paper logbook page, is put in the app's units
//! and held to ranges, units and its own sums, and each figure goes back
//! with what to check about it. Nothing is saved here: the app shows every
//! item for the pilot to confirm, and saves only what was confirmed (the
//! airplane through the gateway's /api/aircraft, the entries through its
//! /api/logbook).
//!
//! The reader is a model, which can misread a figure, take mph for knots
//! or an indicated airspeed for a true one, or put a CG envelope's corners
//! out of order. These rules cannot know the page; they say where a figure
//! is outside what a light airplane's handbook gives, where two figures
//! disagree (a moment that is not weight times arm, a page total its rows
//! do not add up to, a night time longer than the flight), and where a
//! figure cannot be right at all. "check" is the first two, "wrong" the
//! last; the app warns and never refuses (docs/decisions/0008).
//!
//! - `handbook_read_check` (handbook.rs, handbook_checks.rs, envelope.rs):
//!   the handbook's figures, `{"items", "handbook", "profile"}`;
//! - `logbook_read_check` (logbook_page.rs): the page's rows as the
//!   gateway's logbook entries, each with its flags, and the page's own.

pub mod envelope;
pub mod handbook;
mod handbook_checks;
pub mod logbook_page;
mod out;
mod units;

use crate::json::Value;

/// A rule of this module as crate::call answers it.
pub fn call(name: &str, v: &Value) -> Result<String, String> {
    match name {
        "handbook_read_check" => handbook::check(v),
        "logbook_read_check" => logbook_page::check_page(v),
        _ => Err(format!("documents has no rule called {name}")),
    }
}
