//! The engine for the phones, through UniFFI: each function here is
//! exported with `#[uniffi::export]`, and the iPhone's Swift and Android's
//! Kotlin round it are generated from this crate by uniffi-bindgen
//! (build-xcframework.sh, build-android.sh), so no C header, Swift glue or
//! JNI shim is written by hand.
//!
//! One way in for every rule, `call`, a rule by name with JSON in and out,
//! as the web app and the planner ask it; and the readers of the cycle
//! packs kept on the phone, which take the packs by their files' paths and
//! map each for the one call, so a pan reads only the pages it needs and
//! nothing is copied across.

use std::fs::File;
use wingtip_engine::{ahead, clearance::Route, pack::Pack, pack_query, spoken, view, view_marks};

uniffi::setup_scaffolding!();

/// What the engine said was wrong with a call, in its own words: a name it
/// has no rule for, an input not of the rule's shape. Swift's
/// `EngineError.Refused`, Kotlin's `EngineException.Refused`.
#[derive(Debug, uniffi::Error)]
#[uniffi(flat_error)]
pub enum EngineError {
    Refused(String),
}

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let EngineError::Refused(why) = self;
        f.write_str(why)
    }
}

/// The engine's one way in, as the web app and the planner ask it too
/// (wingtip_engine::call): a rule by `name` ("holding", "lost_comms",
/// "diversion", ...; facade/src/call.rs lists them), its input a JSON
/// object, its answer JSON.
#[uniffi::export]
pub fn call(name: &str, input: &str) -> Result<String, EngineError> {
    wingtip_engine::call::call(name, input).map_err(EngineError::Refused)
}

/// Whether every byte of a pack is as the planner wrote it: false too for
/// bytes that are no pack. The bytes are borrowed for the call, not
/// copied (a Swift Data, a direct Kotlin ByteBuffer): a pack just fetched,
/// checked before it is kept.
#[uniffi::export]
pub fn pack_verify(pack: &[u8]) -> bool {
    Pack::read(pack).is_ok_and(|p| p.verify())
}

/// A pack file mapped read-only, or None where it cannot be opened.
fn mapped(path: &str) -> Option<memmap2::Mmap> {
    let file = File::open(path).ok()?;
    // SAFETY: the phones never write a pack in place: each is written
    // beside itself and renamed over (CyclePacks' writeWhole, Data's
    // .atomic), so the file mapped here keeps its bytes for the call.
    unsafe { memmap2::Mmap::map(&file) }.ok()
}

/// The packs at these paths mapped; a file that cannot be opened is
/// passed over, as a pack that is no pack is by `read`.
fn mapped_all(paths: &[String]) -> Vec<memmap2::Mmap> {
    paths.iter().filter_map(|p| mapped(p)).collect()
}

/// The maps read as packs, those that are packs.
fn read(maps: &[memmap2::Mmap]) -> Vec<Pack<'_>> {
    maps.iter().filter_map(|m| Pack::read(m).ok()).collect()
}

/// The planner's AirspaceAt for the point as JSON, from the pack of the
/// point's region: None for a region the pack list has none of, which has
/// nothing drawn in it and is answered by the rules alone. None back where
/// the file is no pack the engine reads. `ground_ft` None where the
/// caller does not know the ground's height.
#[uniffi::export]
pub fn airspace_at(pack: Option<String>, lat: f64, lon: f64, ground_ft: Option<f64>) -> Option<String> {
    match pack {
        None => pack_query::airspace_at(None, lat, lon, ground_ft),
        Some(path) => {
            let map = mapped(&path)?;
            let pack = Pack::read(&map).ok()?;
            pack_query::airspace_at(Some(&pack), lat, lon, ground_ft)
        }
    }
}

/// The alerts ahead with no network (wingtip_engine::ahead), as the
/// planner's /api/alerts/ahead answers, JSON, from the packs of the
/// regions round the airplane; `alt_ft` None where the GPS gives none;
/// `tfrs` the kept TFRs, a tab-separated line each, or None, downloaded
/// at `tfrs_at` (None not known).
#[uniffi::export]
#[allow(clippy::too_many_arguments)]
pub fn ahead(
    packs: Vec<String>, lat: f64, lon: f64, track_deg: f64, gs_kt: f64, alt_ft: Option<f64>, vs_fpm: f64, now: i64, tfrs: Option<String>,
    tfrs_at: Option<i64>,
) -> String {
    let maps = mapped_all(&packs);
    ahead::ahead(&read(&maps), lat, lon, track_deg, gs_kt, alt_ft, vs_fpm, now, tfrs.as_deref(), tfrs_at)
}

// The map's view with no network (wingtip_engine::view, view_marks): the
// airspace, the landing fields, the VORs, the special-use areas and the
// fixes inside a box, each as the planner's in-view endpoint answers it,
// JSON, from the packs of the regions the box meets. The box is south,
// west, north and east in degrees; a region with no pack has nothing in it.

/// The planner's AirspaceInView: the Class B, C and D reaching into the
/// box, each whole.
#[uniffi::export]
pub fn airspace_in_view(packs: Vec<String>, south: f64, west: f64, north: f64, east: f64) -> String {
    view::airspace_in_view(&read(&mapped_all(&packs)), south, west, north, east)
}

/// The planner's AirportsInView: the landing fields inside the box, the
/// biggest first, at most its default 300; the live fields (a METAR's
/// flight category) null.
#[uniffi::export]
pub fn airports_in_view(packs: Vec<String>, south: f64, west: f64, north: f64, east: f64) -> String {
    view::airports_in_view(&read(&mapped_all(&packs)), south, west, north, east)
}

/// The planner's NavaidsInView: the VORs inside the box by ident, at most
/// its default 500, with no remarks and no fixes.
#[uniffi::export]
pub fn navaids_in_view(packs: Vec<String>, south: f64, west: f64, north: f64, east: f64) -> String {
    view::navaids_in_view(&read(&mapped_all(&packs)), south, west, north, east)
}

/// {"areas": [...]}: the special-use areas reaching into the box, the
/// MOAs and alert areas first and the prohibited, restricted, warning and
/// danger areas over them, each ring with the area on its left.
#[uniffi::export]
pub fn special_use_in_view(packs: Vec<String>, south: f64, west: f64, north: f64, east: f64) -> String {
    view_marks::special_use_in_view(&read(&mapped_all(&packs)), south, west, north, east)
}

/// {"fixes": [...]}: the Enroute Low chart's fixes and the charted VFR
/// waypoints inside the box, by ident.
#[uniffi::export]
pub fn fixes_in_view(packs: Vec<String>, south: f64, west: f64, north: f64, east: f64) -> String {
    view_marks::fixes_in_view(&read(&mapped_all(&packs)), south, west, north, east)
}

/// What the radio said, all the phone can make of it with no signal, as
/// JSON (wingtip_engine::spoken::hear): the clearance read into its items,
/// whether it was said to `tail` (None: no airplane picked) and where its
/// "direct" sends us, the places it named found in the kept packs, and the
/// route it gives from `dep`, `stops` and `dest`. `near_lat` and
/// `near_lon`, points of the route, put the nearer of two places alike first.
#[uniffi::export]
#[allow(clippy::too_many_arguments)]
pub fn clearance_hear(
    heard: &str, tail: Option<String>, packs: Vec<String>, near_lat: Vec<f64>, near_lon: Vec<f64>, dep: String, stops: Vec<String>,
    dest: String,
) -> String {
    let maps = mapped_all(&packs);
    let places = read(&maps).iter().flat_map(spoken::places_of).collect();
    let near: Vec<(f64, f64)> = near_lat.into_iter().zip(near_lon).collect();
    let stops = stops.into_iter().filter(|s| !s.is_empty()).collect();
    spoken::hear(heard, tail.as_deref(), places, &near, &Route { dep, stops, dest })
}
