//! What to do in an emergency with no airplane picked: general good
//! practice from the AIM and the Airplane Flying Handbook, and nothing of
//! any one airplane's -- no POH checklist, no glide, no speeds, no
//! distances (the owner, 2026-11-09: "with no airplane, give general
//! guidance only"). Each item says its source, quoted where it decides
//! the words:
//!
//! - FAA-H-8083-3C (Airplane Flying Handbook) chapter 18: "failure to
//!   lower the nose to maintain flying speed, delay in the selection of
//!   the most suitable landing area within reach" are the errors it
//!   names, and "positive airplane control during the final part of the
//!   approach has priority over all other considerations, including
//!   airplane configuration and checklist tasks";
//! - AIM 6-1-2: "an aircraft is in at least an urgency condition the
//!   moment the pilot becomes doubtful about position, fuel endurance,
//!   weather ... This is the time to ask for help";
//! - AIM 6-2-2: squawk 7700 "and then immediately establish
//!   communications with the ATC facility";
//! - AIM 6-3-1: MAYDAY "preferably repeated three times", on "the
//!   frequency in use at the time", else 121.5 MHz;
//! - AIM 6-3-2(a): "climb, if possible, for improved communications, and
//!   better radar and direction finding detection";
//! - AIM 6-2-1: a pilot not instrument rated keeps to VFR conditions where
//!   a course allows it, else says so and declares a distress condition;
//! - AIM 6-1-1 and 14 CFR 91.3(b): the pilot in command may deviate from
//!   the rules to the extent the emergency requires, and tells ATC.

use crate::json;

type R<T> = Result<T, String>;

/// One thing to do: its title, a line under it and where it comes from.
#[derive(Clone, Debug, PartialEq)]
pub struct Item {
    pub title: &'static str,
    pub detail: &'static str,
    pub source: &'static str,
}

/// The general guidance, in the order a pilot uses it: fly, pick a field,
/// tell someone, then the rest.
pub const GUIDANCE: [Item; 7] = [
    Item {
        title: "Fly the airplane",
        detail: "Lower the nose to keep flying speed; control comes before the configuration and the checklist",
        source: "FAA-H-8083-3C, ch. 18",
    },
    Item {
        title: "Pick a field within reach",
        detail: "Choose the most suitable landing area within reach without delay; the nearest fields are listed here",
        source: "FAA-H-8083-3C, ch. 18",
    },
    Item {
        title: "Ask for help now",
        detail: "Doubt about position, fuel, weather or the airplane is already an urgency: call before it becomes a distress",
        source: "AIM 6-1-2",
    },
    Item {
        title: "Squawk 7700",
        detail: "Then talk to ATC at once; keep an assigned code while already talking to them",
        source: "AIM 6-2-2, 6-3-2",
    },
    Item {
        title: "MAYDAY on the frequency in use, else 121.5",
        detail: "MAYDAY three times, then who you are, the trouble, where you are and what you intend",
        source: "AIM 6-3-1, 6-3-2",
    },
    Item {
        title: "Climb if you can",
        detail: "Height helps the radio and the radar find you. Under IFR in controlled airspace, not without a clearance unless the emergency requires it",
        // AIM 6-3-2 a.1: "Climb, if possible, for improved communications,
        // and better radar and direction finding detection. However, it
        // must be understood that unauthorized climb or descent under IFR
        // conditions within controlled airspace is prohibited, except as
        // permitted by 14 CFR section 91.3(b)."
        source: "AIM 6-3-2; 14 CFR 91.3(b)",
    },
    Item {
        title: "Stay in VFR conditions where a course allows",
        detail: "Not instrument rated and no VFR way out: tell ATC and declare a distress. You may deviate from the rules as the emergency requires; tell ATC",
        source: "AIM 6-2-1, 6-1-1; 14 CFR 91.3(b)",
    },
];

/// `emergency_guidance` by name: `{"items": [{"title", "detail",
/// "source"}]}`, from no input.
pub fn call(_name: &str, _v: &json::Value) -> R<String> {
    let mut out = String::from("{\"items\":[");
    for (i, item) in GUIDANCE.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"title\":");
        json::string(&mut out, item.title);
        out.push_str(",\"detail\":");
        json::string(&mut out, item.detail);
        out.push_str(",\"source\":");
        json::string(&mut out, item.source);
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}
