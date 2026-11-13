//! The figures four of the pilot's pages work out, one copy for the
//! planner (app.figures, through wingtip_native) and the phones (engine/bindings/ffi),
//! so neither states an aviation figure of its own (docs/NATIVE.md): a
//! flight debriefed against its flown track (ACS PA.VI.A), the diversion
//! drill's wind triangle (ACS PA.VI.C), a hold's entry and its legs in the
//! wind (AIM 5-3-8), and the altitude flown on each segment after a
//! two-way radio failure (14 CFR 91.185). Each was app.figures' Python,
//! itself the web app's lib/debrief, lib/diversion, lib/holdEntry and
//! lib/lostComms ported line for line with the same words and sources. The
//! web app asks these too, through the engine's WebAssembly (crate::call,
//! engine/bindings/wasm), so its lib/holdEntry, lib/lostComms, lib/diversion and
//! lib/debrief only shape the answers for its pages.

pub mod calls;
pub mod debrief;
pub mod debrief_calls;
pub mod diversion;
pub mod endurance;
pub mod glide;
pub mod holding;
pub mod lost_comms;
pub mod strip;
pub mod words;
