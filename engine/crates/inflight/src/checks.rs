//! The copilot's checks, one a kind (message::KINDS), each composed from
//! the rule that owns its figure: the field's weather and the best
//! alternative (fields.rs: brief's best_fields in its diversion mode, held
//! to 91.155, the pilot's minimums and 91.151 and 91.167's reserve), 61.57(b)'s night-passenger period (flight::sun),
//! the alerts ahead (airspace::ahead, read as the host passes them) and
//! ITWS's alerts (AIM 4-3-7). Each says where its figure comes from.

use crate::fields::{self, Pick, Weather};
use crate::input::{same_field, Field};
use crate::message::{minutes_words, zulu, Level, Message};
use crate::watch::Flight;
use wingtip_core::geo;
use wingtip_flight::sun;
use wingtip_procedures::figures::debrief::AIRBORNE_KT;
use wingtip_procedures::figures::words::{ceiling_and_visibility, js_num};

/// A ground speed this much under the plan's is said, with the new
/// arrival and fuel: under it the wind is the forecast's, near enough
/// (winds aloft forecasts are good to some 10 kt). A design choice, not
/// a rule; worse by another such step, it is said again.
pub const GROUNDSPEED_SHORTFALL: f64 = 0.15;

/// "9 min left of course", "6 min ahead", and "; private: permission
/// needed" or "; military: prior permission" where the field is not
/// public use.
fn where_words(p: &Pick) -> String {
    let when = p.minutes.map(minutes_words).unwrap_or_else(|| format!("{} nm", js_num(p.distance_nm().round())));
    let side = match p.side() {
        Some("ahead") => " ahead".to_owned(),
        Some("behind") => " behind".to_owned(),
        Some(s) => format!(" {s} of course"),
        None => String::new(),
    };
    let permission = p.permission().map_or(String::new(), |w| format!("; {w}"));
    format!("{when}{side}{permission}")
}

/// "Fond du Lac is VFR, 9 min left of course".
fn alternative_words(p: &Pick) -> String {
    let what = p.field.category().map_or_else(|| "within your minimums".to_owned(), |c| format!("is {c}"));
    format!("{} {what}, {}", p.field.said(), where_words(p))
}

fn alternative_detail(p: &Pick) -> String {
    let mut parts = vec![format!("{}: {} nm", p.field.ident, js_num(p.distance_nm().round()))];
    if let Some(r) = p.runway_words() {
        parts.push(r);
    }
    parts.push(if p.field.fuel { "fuel".to_owned() } else { "no fuel listed".to_owned() });
    if let Some(left) = p.fuel_at_landing_min {
        parts.push(format!("{} of fuel on landing", minutes_words(left)));
    }
    parts.join(", ")
}

/// Where the fuel is judged: the destination, or under IFR with an
/// alternate filed, the alternate after it (91.167(a)(2)).
pub struct Landing {
    pub at: Field,
    pub fuel_left_min: Option<f64>,
    pub reserve_min: f64,
}

pub fn landing(f: &Flight) -> Landing {
    let a = &f.ask;
    let (at, extra_nm) = match (&f.alternate, a.ifr) {
        (Some(alt), true) => (alt.clone(), geo::distance_nm(f.dest.lat, f.dest.lon, alt.lat, alt.lon)),
        _ => (f.dest.clone(), 0.0),
    };
    let hours = fields::speed_kt(&a.own, a.tas_kt).map(|kt| (f.remaining_nm + extra_nm) / kt);
    let fuel_left_min = fields::fuel_left_min(a.fuel_gal, a.burn_gph, hours);
    let reserve_min = fields::reserve_at(a.ifr, at.lat, at.lon, hours.map(|h| f.now_s + h * 3600.0));
    Landing { at, fuel_left_min, reserve_min }
}

/// The alerts ahead, ranked with the rest but drawn by their own banner.
pub fn ahead(f: &Flight) -> Vec<Message> {
    f.ahead
        .iter()
        .map(|a| {
            let level = if a.level == "warning" { Level::Warning } else { Level::Caution };
            let mut m = Message::new(format!("ahead:{}", a.id), "ahead", level, a.name.clone(), a.name.clone());
            m.elsewhere = true;
            m
        })
        .collect()
}

/// ITWS's alerts at the destination or the alternate: a microburst, wind
/// shear or a tornado is a warning (AIM 4-3-7: "the most hazardous"),
/// a gust front or a storm cell a caution.
pub fn itws(f: &Flight) -> Vec<Message> {
    let ours = |airport: &str| same_field(airport, &f.dest.ident) || f.alternate.as_ref().is_some_and(|a| same_field(airport, &a.ident));
    f.itws
        .iter()
        .filter(|i| ours(&i.airport))
        .map(|i| {
            let alert = i.alert.to_ascii_lowercase();
            let level = if alert.contains("microburst") || alert.contains("wind shear") || alert.contains("tornado") {
                Level::Warning
            } else {
                Level::Caution
            };
            let place = if same_field(&i.airport, &f.dest.ident) { f.dest.said().to_owned() } else { i.airport.clone() };
            let mut m = Message::new(
                format!("itws:{}:{}", i.airport, i.words),
                "itws",
                level,
                format!("{}: {}", i.airport, i.words),
                format!("{place}: {}", i.words),
            );
            m.sources.push("FAA ITWS, now (AIM 4-3-7)".to_owned());
            m
        })
        .collect()
}

/// Fuel on landing under the reserve at the ground speed flown, with the
/// nearest good field that sells fuel.
pub fn fuel(f: &Flight) -> Vec<Message> {
    let l = landing(f);
    let Some(left) = l.fuel_left_min.filter(|left| *left < l.reserve_min) else { return Vec::new() };
    let a = &f.ask;
    let rule = if a.ifr { "14 CFR 91.167(a)" } else { "14 CFR 91.151(a)" };
    let title = format!("Fuel: {} left at {}, under the {} min reserve", minutes_words(left), l.at.ident, js_num(l.reserve_min));
    let mut say = format!(
        "Fuel. You would land at {} with {}, under the {} minute reserve.",
        l.at.said(),
        minutes_words(left),
        js_num(l.reserve_min)
    );
    let stop = fields::alternative(a, &f.fields, &f.candidates, true, &[]);
    let mut m = Message::new(format!("fuel:{}", l.at.ident), "fuel", Level::Warning, title, String::new());
    m.detail.push(format!(
        "At {} kt and {} gal/h, from {} gal on board",
        js_num(a.own.gs_kt.round()),
        js_num(a.burn_gph.unwrap_or(0.0)),
        js_num(a.fuel_gal.unwrap_or(0.0))
    ));
    if let Some(p) = &stop {
        say.push_str(&format!(" {} has fuel, {}.", p.field.said(), where_words(p)));
        m.detail.push(format!("Nearest fuel: {}", alternative_detail(p)));
        m.alternative = Some(fields::to_value(p));
    }
    m.say = say;
    m.sources.push(rule.to_owned());
    m.sources.push("Fuel listed: FAA NASR APT_BASE".to_owned());
    vec![m]
}

fn worse(planned: Option<&str>, now: Option<&str>) -> bool {
    let rank = |c: &str| ["VFR", "MVFR", "IFR", "LIFR"].iter().position(|k| k.eq_ignore_ascii_case(c));
    matches!((planned.and_then(rank), now.and_then(rank)), (Some(p), Some(n)) if n > p)
}

fn weather_message(f: &Flight, field: &Field, alternate: bool) -> Option<Message> {
    let a = &f.ask;
    let Weather::Under(why) = fields::weather_of(field, a.ifr, &a.minimums) else { return None };
    let category = field.category();
    let state = match category {
        Some(c) if worse(field.planned_category.as_deref(), Some(c)) => format!("just went {c}"),
        Some(c) => format!("is {c}"),
        None => "is under your minimums".to_owned(),
    };
    let metar = field.metar.as_ref()?;
    let figures = ceiling_and_visibility(metar.ceiling_ft(), metar.visibility_sm);
    let who = if alternate { format!("Alternate {}", field.ident) } else { field.ident.clone() };
    let mut title = format!("{who} {state} ({figures})");
    let mut say = format!("{}{} {state}.", if alternate { "Your alternate, " } else { "" }, field.said());
    let mut m = Message::new(
        format!("weather:{}:{}", field.ident, category.unwrap_or("under")),
        "weather",
        Level::Caution,
        String::new(),
        String::new(),
    );
    m.detail.extend(why);
    if !alternate && let Some(p) = fields::alternative(a, &f.fields, &f.candidates, false, &[field.ident.as_str()]) {
        title.push_str(&format!("; {}", alternative_words(&p)));
        say.push_str(&format!(" {}.", alternative_words(&p)));
        m.detail.push(format!("Best alternative: {}", alternative_detail(&p)));
        if let Some(raw) = &p.field.raw {
            m.sources.push(format!("METAR {raw}"));
        }
        m.alternative = Some(fields::to_value(&p));
    }
    if let Some(raw) = &field.raw {
        m.sources.insert(0, format!("METAR {raw}"));
    }
    m.sources.push(if a.ifr { "Your minimums".to_owned() } else { "14 CFR 91.155(c), (d) and your minimums".to_owned() });
    m.title = title;
    m.say = say;
    Some(m)
}

/// The destination's or the alternate's report under the flight's
/// minimums, with the best alternative to the destination.
pub fn weather(f: &Flight) -> Vec<Message> {
    let mut out: Vec<Message> = weather_message(f, &f.dest, false).into_iter().collect();
    if let Some(alt) = &f.alternate {
        out.extend(weather_message(f, alt, true));
    }
    out
}

/// TFRs, special-use areas and convective SIGMETs ahead, in force now or
/// by the time the airplane gets there; those an alert ahead already
/// names are left to it.
pub fn areas(f: &Flight) -> Vec<Message> {
    let o = &f.ask.own;
    let speed = fields::speed_kt(o, f.ask.tas_kt);
    let named = |id: &str, name: &str| f.ahead.iter().any(|a| (!id.is_empty() && a.id == id) || (!name.is_empty() && a.name == name));
    let mut out = Vec::new();
    for area in &f.areas {
        let d = geo::distance_nm(o.lat, o.lon, area.lat, area.lon);
        let behind = o.track_deg.is_some_and(|t| geo::angle_between(t, geo::bearing_deg(o.lat, o.lon, area.lat, area.lon)) > 90.0);
        if behind || named(&area.id, &area.name) {
            continue;
        }
        let at_s = f.now_s + speed.map_or(0.0, |kt| d / kt * 3600.0);
        let ended = |t: f64| area.until_s.is_some_and(|u| u < t);
        let now = area.active == Some(true) && !ended(f.now_s);
        // Cold now (SFDPS) does not settle it: an activation starting
        // before the airplane gets there is said, the word "next" gives.
        let then = area.starts_s.is_some_and(|s| s <= at_s) && !ended(at_s);
        if !now && !then {
            continue;
        }
        let (kind, what, source, level) = match area.kind.as_str() {
            "tfr" => ("tfr", "TFR", "FAA TFR list (tfr.faa.gov), 14 CFR 91.137-91.145", Level::Caution),
            "sigmet" => ("convective", "Convective SIGMET", "AWC convective SIGMET (AIM 7-1-6)", Level::Caution),
            _ => ("sua", "Special-use area", "FAA SFDPS status (AIM 3-4)", Level::Caution),
        };
        let when = if now { "active now".to_owned() } else { format!("active by {}", zulu(at_s)) };
        let title = format!("{what} {} {when}, {} nm ahead", area.name, js_num(d.round()));
        let say = format!("{what} {} {when}, {} miles ahead.", area.name, js_num(d.round()));
        let mut m = Message::new(format!("{kind}:{}", if area.id.is_empty() { &area.name } else { &area.id }), kind, level, title, say);
        if let Some(u) = area.until_s {
            m.detail.push(format!("Until {}", zulu(u)));
        }
        m.sources.push(source.to_owned());
        out.push(m);
    }
    out
}

/// 61.57(b): passengers in the period from an hour after sunset to an
/// hour before sunrise need three full-stop takeoffs and landings in that
/// period in the last 90 days. Said only when the pilot's record says
/// the currency is lapsed and passengers are aboard.
pub fn night(f: &Flight) -> Vec<Message> {
    let (Some(minutes), true, Some(false)) = (f.minutes, f.passengers, f.night_current) else { return Vec::new() };
    let o = &f.ask.own;
    if !sun::passenger_night_on_the_way((o.lat, o.lon), (f.dest.lat, f.dest.lon), f.now_s, minutes) {
        return Vec::new();
    }
    let title = format!("Passengers after dark to {} without night currency", f.dest.ident);
    let say = "You will carry passengers more than an hour after sunset, and your night currency has lapsed.".to_owned();
    let mut m = Message::new(format!("night:{}", f.dest.ident), "night", Level::Caution, title, say);
    m.detail.push(format!("Arriving {}", zulu(f.now_s + minutes * 60.0)));
    m.sources.push("14 CFR 61.57(b)".to_owned());
    m.sources.push("Your logbook's currency".to_owned());
    vec![m]
}

/// A ground speed worse than the plan's by GROUNDSPEED_SHORTFALL or more:
/// the new arrival and the fuel on landing.
pub fn groundspeed(f: &Flight) -> Vec<Message> {
    let gs = f.ask.own.gs_kt;
    let Some(planned) = f.planned_gs_kt.filter(|p| *p > 0.0 && gs >= AIRBORNE_KT) else { return Vec::new() };
    let short = 1.0 - gs / planned;
    if short < GROUNDSPEED_SHORTFALL {
        return Vec::new();
    }
    let pct = (short * 100.0).round();
    let eta = f.now_s + f.remaining_nm / gs * 3600.0;
    let l = landing(f);
    let fuel = l.fuel_left_min.map(|m| format!(", {} of fuel on landing", minutes_words(m))).unwrap_or_default();
    let title = format!("Ground speed {} kt, {}% under plan: {} at {}{fuel}", js_num(gs.round()), js_num(pct), f.dest.ident, zulu(eta));
    let say = format!("Ground speed is {} percent under the plan. {} at {}{fuel}.", js_num(pct), f.dest.said(), zulu(eta));
    let step = (short / GROUNDSPEED_SHORTFALL).floor();
    let mut m = Message::new(format!("groundspeed:{}", js_num(step)), "groundspeed", Level::Advisory, title, say);
    m.detail.push(format!("Planned {} kt", js_num(planned.round())));
    m.sources.push("GPS ground speed against the nav log's".to_owned());
    vec![m]
}
