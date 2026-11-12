//! One way in for every host: a rule asked by its name, its input a JSON
//! object, its answer JSON. The web app (engine/bindings/wasm, from
//! TypeScript), the planner (wingtip_native.call) and the phones (wt_call)
//! all come in here, so a rule moved into the engine needs no new function
//! on any of them. The answers are the planner's endpoints' own JSON,
//! snake_case, where a rule has an endpoint.
//!
//! Which function answers which name is not listed here: each rule's own
//! contract file (`engine/crates/<crate>/contract/<name>.json`, or
//! `engine/facade/contract/<name>.json` for the rules [`rule`] below
//! answers) names it in `"x-call"`, and build.rs writes the table [`call`]
//! looks names up in from those files. The same files, assembled by
//! engine/contract/gen into engine/contract/engine.schema.json, give each
//! rule's input, answer and the source of its figures; tests/contract.rs
//! holds the answers to them.
//!
//! A name not known, or input not of its shape, is Err with a plain
//! message, never a panic.

use crate::figures::{debrief, diversion, holding, lost_comms, strip};
use crate::json::{self, Value};
use crate::pilot::{checklist, csv, currency, endorsements, handbook, logbook};

/// A list of strings as a JSON array.
fn strings(out: &mut String, items: &[String]) {
    out.push('[');
    for (i, s) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(out, s);
    }
    out.push(']');
}

/// A checklist's sections, `{"checklist": {"sections": [...]}}`.
fn checklist_sections(ask: &Ask) -> Result<Vec<checklist::Section>, String> {
    let bad =
        || "checklist_write: \"checklist\" is not {\"sections\": [{\"title\", \"items\": [{\"challenge\", \"response\"}]}]}".to_owned();
    let sections = ask.v.get("checklist").and_then(|c| c.get("sections")).and_then(Value::as_array).ok_or_else(bad)?;
    sections
        .iter()
        .map(|s| {
            let title = s.get("title").and_then(Value::as_str).ok_or_else(bad)?.to_owned();
            let items = s
                .get("items")
                .and_then(Value::as_array)
                .ok_or_else(bad)?
                .iter()
                .map(|i| {
                    Ok(checklist::Item {
                        challenge: i.get("challenge").and_then(Value::as_str).ok_or_else(bad)?.to_owned(),
                        response: match i.get("response") {
                            None | Some(Value::Null) => None,
                            Some(Value::String(r)) => Some(r.clone()),
                            Some(_) => return Err(bad()),
                        },
                    })
                })
                .collect::<Result<_, String>>()?;
            Ok(checklist::Section { title, items })
        })
        .collect()
}

/// The rule `name` worked on `input`, a JSON object; the answer as JSON.
pub fn call(name: &str, input: &str) -> Result<String, String> {
    let v = json::parse(input)?;
    if !matches!(v, Value::Object(_)) {
        return Err(format!("{name}: the input is not a JSON object"));
    }
    match RULES.binary_search_by(|(n, _)| (*n).cmp(name)) {
        Ok(i) => (RULES[i].1)(name, &v),
        Err(_) => Err(format!("the engine has no rule called {name:?}")),
    }
}

/// The names the engine answers, in order: the rules' contract files'.
pub fn names() -> impl Iterator<Item = &'static str> {
    RULES.iter().map(|(n, _)| *n)
}

/// A rule's answer from its input: the function its contract file names.
type Handler = fn(&str, &Value) -> Result<String, String>;

include!(concat!(env!("OUT_DIR"), "/rules.rs"));

/// The rules the facade answers itself, each with the crate its figures
/// come from (their contract files are in engine/facade/contract).
pub fn rule(name: &str, v: &Value) -> Result<String, String> {
    let ask = Ask { name, v };
    match name {
        "holding" => holding_rule(&ask),
        "holding_leg_minutes" => {
            let mut out = String::new();
            json::number(&mut out, holding::leg_minutes(ask.opt_num("altitude_ft")?));
            Ok(out)
        }
        "lost_comms" => lost_comms_rule(&ask),
        "strip_fuel" => strip_fuel_rule(&ask),
        "fuel_in_tanks" => {
            let points = ask
                .list("points")?
                .iter()
                .map(|p| {
                    let flag = |k: &str| matches!(p.get(k), Some(Value::Bool(true)));
                    Ok(strip::TankPoint {
                        departure: flag("departure"),
                        fuel_gal: opt_num_in(name, p, "fuel_gal")?,
                        refuel: flag("refuel"),
                    })
                })
                .collect::<Result<Vec<_>, String>>()?;
            let mut out = String::from("[");
            for (i, at) in strip::tanks(&points, ask.num("usable_gal")?, ask.num("taxi_gal")?, ask.num("reserve_gal")?).iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                match at {
                    None => out.push_str("null"),
                    Some((gal, low)) => {
                        out.push_str("{\"gal\":");
                        json::number(&mut out, *gal);
                        out.push_str(if *low { ",\"low\":true}" } else { ",\"low\":false}" });
                    }
                }
            }
            out.push(']');
            Ok(out)
        }
        "fuel_estimate" => {
            let (minutes, trip, required) = strip::estimate(
                ask.num("distance_nm")?,
                ask.opt_num("cruise_tas_kt")?,
                ask.opt_num("fuel_burn_gph")?,
                ask.opt_num("taxi_fuel_gal")?,
            );
            let mut out = String::from("{\"minutes\":");
            json::opt_number(&mut out, minutes);
            out.push_str(",\"trip_gal\":");
            json::opt_number(&mut out, trip);
            out.push_str(",\"required_gal\":");
            json::opt_number(&mut out, required);
            out.push('}');
            Ok(out)
        }
        "diversion" => diversion_rule(&ask),
        "workings_right" => {
            let key = ask.str("key")?;
            match diversion::workings_right(key, ask.num("typed")?, ask.num("answer")?) {
                Some(right) => Ok(right.to_string()),
                None => Err(format!("workings_right: \"key\" is wca, th, mh, gs, ete or fuel, not {key:?}")),
            }
        }
        "wind_triangle" => {
            let solved = diversion::wind_triangle(ask.num("tc")?, ask.num("tas")?, ask.num("wind_from_deg")?, ask.num("wind_kt")?);
            Ok(match solved {
                None => "null".to_owned(),
                Some((wca, th, gs)) => {
                    let mut out = String::from("{\"wca\":");
                    json::number(&mut out, wca);
                    out.push_str(",\"th\":");
                    json::number(&mut out, th);
                    out.push_str(",\"gs\":");
                    json::number(&mut out, gs);
                    out.push('}');
                    out
                }
            })
        }
        "diversion_reasonable" => {
            let key = ask.str("key")?;
            match diversion::reasonable(key, ask.num("typed")?, ask.num("exact")?) {
                Some(ok) => Ok(if ok { "true" } else { "false" }.to_owned()),
                None => Err(format!("diversion_reasonable: no estimate is called {key:?}")),
            }
        }
        "debrief" => {
            let checkpoints = checkpoints(&ask)?;
            let points = points(&ask)?;
            let patterns = match ask.v.get("patterns") {
                None | Some(Value::Null) => Vec::new(),
                Some(Value::Object(members)) => members
                    .iter()
                    .map(|(ident, ft)| match ft.as_f64() {
                        Some(ft) => Ok((ident.clone(), ft)),
                        None => Err(format!("debrief: the pattern altitude of {ident:?} is not a number")),
                    })
                    .collect::<Result<_, _>>()?,
                Some(_) => return Err("debrief: \"patterns\" is not an object of idents to feet".to_owned()),
            };
            Ok(debrief::answer_json(&checkpoints, &points, &patterns))
        }
        "debrief_marked" => debrief_marked_rule(&ask),
        "hold_entry" => {
            let mut out = String::new();
            json::string(&mut out, holding::entry(ask.num("arrival_deg")?, ask.num("inbound_deg")?, ask.opt_str("turns")? != "left").key());
            Ok(out)
        }
        "debrief_airborne" => {
            let runs = debrief::airborne(&points(&ask)?);
            let mut out = String::from("[");
            for (i, (a, b)) in runs.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&format!("[{a},{b}]"));
            }
            out.push(']');
            Ok(out)
        }
        "checklist_section" => {
            let titles = ask
                .list("titles")?
                .iter()
                .map(|t| t.as_str().map(str::to_owned).ok_or("checklist_section: a title is not a string".to_owned()))
                .collect::<Result<Vec<_>, _>>()?;
            let want = match ask.v.get("want") {
                None | Some(Value::Null) => checklist::EMERGENCY_PHASES[2].to_owned(),
                Some(Value::String(w)) => w.clone(),
                Some(_) => return Err("checklist_section: \"want\" is not a string".to_owned()),
            };
            Ok(checklist::section_for(&titles, &want).map_or("null".to_owned(), |i| i.to_string()))
        }
        "checklist_read" => Ok(checklist::to_json(&checklist::read(ask.str("text")?))),
        "checklist_write" => {
            let sections = checklist_sections(&ask)?;
            let mut out = String::new();
            json::string(&mut out, &checklist::write(&sections));
            Ok(out)
        }
        "csv_rows" => {
            let mut out = String::from("[");
            for (i, row) in csv::rows(ask.str("text")?).iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                strings(&mut out, row);
            }
            out.push(']');
            Ok(out)
        }
        "logbook_csv_read" => Ok(logbook::read_json(ask.str("text")?)),
        "logbook_csv_write" => {
            let mut out = String::new();
            json::string(&mut out, &logbook::write(ask.list("entries")?));
            Ok(out)
        }
        "handbook_figures" => Ok(handbook::to_json(&handbook::figures_of_page(ask.str("text")?))),
        "handbook_within" => {
            let key = ask.str("key")?;
            match handbook::figure_within(key, ask.num("value")?) {
                Some(yes) => Ok(if yes { "true" } else { "false" }.to_owned()),
                None => Err(format!("handbook_within: no figure is called {key:?}")),
            }
        }
        "endorsement_lapse" => {
            let text = |key: &str| match ask.v.get(key) {
                None | Some(Value::Null) => Ok(None),
                Some(Value::String(s)) => Ok(Some(s.as_str())),
                Some(_) => Err(format!("endorsement_lapse: \"{key}\" is not a string")),
            };
            let warning = endorsements::lapse_warning(text("until")?, text("until_kind")?, ask.str("signed_on")?)?;
            let mut out = String::new();
            json::opt_string(&mut out, warning.as_deref());
            Ok(out)
        }
        "solo_standing" => {
            let until = match ask.v.get("until") {
                None | Some(Value::Null) => None,
                Some(Value::String(s)) => Some(s.as_str()),
                Some(_) => return Err("solo_standing: \"until\" is not a string".to_owned()),
            };
            let (days, standing) = endorsements::solo_standing(until, ask.str("today")?)?;
            // A whole number of days, as the contract types it (integer).
            let mut out = String::from("{\"days\":");
            out.push_str(&days.map_or("null".to_owned(), |d| d.to_string()));
            out.push_str(",\"standing\":");
            json::string(&mut out, standing);
            out.push('}');
            Ok(out)
        }
        "endorsements_in_force" => {
            let signed = ask
                .list("signed")?
                .iter()
                .map(|e| {
                    let code =
                        e.get("code").and_then(Value::as_str).ok_or("endorsements_in_force: an endorsement's \"code\" is missing")?;
                    let voided = matches!(e.get("voided"), Some(Value::Bool(true)));
                    Ok((code.to_owned(), voided))
                })
                .collect::<Result<Vec<_>, String>>()?;
            let mut out = String::from("[");
            for (i, (code, at)) in endorsements::in_force(&signed).iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push('[');
                json::string(&mut out, code);
                out.push_str(&format!(",{at}]"));
            }
            out.push(']');
            Ok(out)
        }
        "endorsement_render" => {
            let fields = match ask.v.get("fields") {
                None | Some(Value::Null) => None,
                Some(f @ Value::Object(_)) => Some(f),
                Some(_) => return Err("endorsement_render: \"fields\" is not an object of names to words".to_owned()),
            };
            let field = |key: &str| fields.and_then(|f| f.get(key)).and_then(Value::as_str).map(str::to_owned);
            let mut out = String::new();
            json::string(&mut out, &endorsements::render(ask.str("template")?, ask.opt_str("student")?, &field));
            Ok(out)
        }
        "pilot_currency" => {
            let entries = currency::entries(name, ask.list("entries")?)?;
            let date = |key: &str| match ask.v.get(key) {
                None | Some(Value::Null) => Ok(None),
                Some(Value::String(s)) => Ok(Some(s.as_str())),
                Some(_) => Err(format!("pilot_currency: \"{key}\" is not a day")),
            };
            let dates = currency::Dates {
                flight_review_on: date("flight_review_on")?,
                medical_expires_on: date("medical_expires_on")?,
                ipc_on: date("ipc_on")?,
                today: ask.str("today")?,
            };
            currency::currency_json(name, &entries, &dates)
        }
        "pilot_experience" => currency::experience_json(name, &currency::entries(name, ask.list("entries")?)?, ask.str("today")?),
        "acs_codes" => {
            let mut out = String::new();
            strings(&mut out, &endorsements::acs_codes(ask.str("text")?));
            Ok(out)
        }
        // The clearance reader (clearance.rs), the web's lib/clearance and
        // lib/heardCall: held to the same fixtures as the web's tests.
        "read_clearance" => Ok(crate::clearance::read(ask.str("text")?).to_json()),
        // The ATIS reader (atis.rs), the web's lib/atis and the phone's
        // Atis: held to the same fixture (atis.json) as the web's tests.
        "read_atis" => Ok(crate::atis::read(ask.str("text")?).to_json()),
        // A D-ATIS as the tower's data link writes it (datis.rs): the
        // same figures, its weather read from its METAR groups.
        "read_datis" => Ok(crate::datis::read_datis(ask.str("text")?).to_json()),
        "cleared_route" => cleared_route_rule(&ask),
        "our_call" => Ok(if crate::clearance::our_call(ask.str("text")?, ask.str("tail")?) { "true" } else { "false" }.to_owned()),
        "direct_of" => {
            let mut out = String::new();
            json::opt_string(&mut out, crate::clearance::direct_of(ask.str("text")?).as_deref());
            Ok(out)
        }
        "call_pattern" => {
            let mut out = String::new();
            json::opt_string(&mut out, crate::clearance::call_pattern(ask.str("tail")?).as_deref());
            Ok(out)
        }
        "tokens" => {
            let mut out = String::from("[");
            for (i, t) in crate::clearance::tokens(ask.str("text")?).iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str("{\"word\":");
                json::string(&mut out, &t.word);
                if let Some(num) = &t.num {
                    out.push_str(",\"num\":");
                    json::string(&mut out, num);
                }
                out.push('}');
            }
            out.push(']');
            Ok(out)
        }
        "place_words" => {
            let toks = ask
                .list("tokens")?
                .iter()
                .map(|t| {
                    let word = t.get("word").and_then(Value::as_str).ok_or_else(|| "place_words: a token has no \"word\"".to_owned())?;
                    Ok(crate::clearance::Token { word: word.to_owned(), num: t.get("num").and_then(Value::as_str).map(str::to_owned) })
                })
                .collect::<Result<Vec<_>, String>>()?;
            let mut out = String::new();
            json::string(&mut out, &crate::clearance::place_words(&toks));
            Ok(out)
        }
        "weather_expires_at" | "weather_in_force" => weather_validity_rule(&ask),
        "airspace_column" => crate::rules::column_json(ask.v),
        "mode_c_veil" => crate::rules::veil_json(ask.v),
        "notams_fns" | "tfr_detail_read" | "ceiling_ft" | "vfr_basic_minimums" | "vfr_not_recommended_reasons" | "below_vfr_minimums" => {
            weather_rule(&ask)
        }
        "night_on_the_way" | "night_at_either_end" | "passenger_night" | "passenger_night_on_the_way" | "sun_down" => sun_rule(&ask),
        "checkpoints_select" => checkpoints_rule(&ask),
        "reserve_min"
        | "isa_temp_c"
        | "density_ratio"
        | "density_altitude_ft"
        | "pressure_altitude_ft"
        | "is_eastbound"
        | "lowest_vfr_cruising_altitude"
        | "region_of"
        | "groundspeed_kt" => flight_rule(&ask),
        "words_num"
        | "words_one"
        | "words_to_fixed"
        | "words_grouped"
        | "words_alt_ft"
        | "words_flight_level"
        | "words_ceiling_and_visibility" => words_rule(&ask),
        "altitude_limits" | "altitude_allowed" | "vfr_altitudes" | "altitude_said" => limits_rule(&ask),
        "planning_figures" => {
            let mut out = String::from("{\"turnaround_min\":");
            json::number(&mut out, crate::flight::TURNAROUND_MIN);
            out.push_str(",\"cruise_reference_ft\":");
            json::number(&mut out, crate::flight::CRUISE_REFERENCE_FT);
            out.push('}');
            Ok(out)
        }
        "filed_level" | "filed_speed" | "filed_duration" | "filed_wake" | "filed_route" | "filed_zzzz" => filing_rule(&ask),
        // Item 19's endurance, item 18's date of flight and a T or Q route
        // (the web's lib/flightPlanForm before #482).
        "filed_endurance" | "filed_dof" | "filed_rnav" => filing_more_rule(&ask),
        "magnetic_variation" => {
            // The model's time, a decimal year: as given (the planner's
            // test against pygeomag asks at any instant), else the day's.
            let decimal = match ask.opt_num("year")? {
                Some(year) => year,
                None => {
                    let date = ask.str("date")?;
                    let bad = || format!("magnetic_variation: \"date\" is not YYYY-MM-DD: {date:?}");
                    let mut parts = date.splitn(3, '-').map(|p| p.parse::<i64>().map_err(|_| bad()));
                    let (year, month, day) =
                        (parts.next().ok_or_else(bad)??, parts.next().ok_or_else(bad)??, parts.next().ok_or_else(bad)??);
                    if !(1..=12).contains(&month) || day < 1 || day > crate::time::days_in_month(year, month as u32) as i64 {
                        return Err(bad());
                    }
                    let start = crate::time::days_from_civil(year, 1, 1);
                    let of_year = crate::time::days_from_civil(year + 1, 1, 1) - start;
                    let day_of_year = crate::time::days_from_civil(year, month as u32, day as u32) - start + 1;
                    crate::wmm::decimal_year(year as i32, day_of_year as u32, of_year as u32)
                }
            };
            let mut out = String::new();
            json::number(&mut out, crate::wmm::declination(ask.num("lat")?, ask.num("lon")?, decimal));
            Ok(out)
        }
        "data_cycle" => {
            let kind = ask.str("kind")?;
            let kind =
                crate::cycles::Kind::from_name(kind).ok_or_else(|| format!("data_cycle: \"kind\" is not airac, chart or dof: {kind:?}"))?;
            let on = ask.str("on")?;
            let on = crate::cycles::day_of(on).ok_or_else(|| format!("data_cycle: \"on\" is not YYYY-MM-DD: {on:?}"))?;
            let effective = match ask.opt_str("effective")? {
                "" => None,
                e => Some(crate::cycles::day_of(e).ok_or_else(|| format!("data_cycle: \"effective\" is not YYYY-MM-DD: {e:?}"))?),
            };
            Ok(crate::cycles::to_json(&crate::cycles::cycle(kind, effective, on)))
        }
        // The headings a checklist starts from (checklist.rs, GAMA
        // Specification No. 1, Sections 3 and 4).
        "checklist_phases" => {
            let kind = ask.str("kind")?;
            let phases: &[&str] = if kind == "normal" {
                &checklist::NORMAL_PHASES
            } else if kind == "emergency" {
                &checklist::EMERGENCY_PHASES
            } else {
                return Err(format!("checklist_phases: no kind {kind:?}, only \"normal\" or \"emergency\""));
            };
            let mut out = String::new();
            strings(&mut out, &phases.iter().map(|p| (*p).to_owned()).collect::<Vec<_>>());
            Ok(out)
        }
        _ => Err(format!("the engine has no rule called {name:?}")),
    }
}

/// When a weather report stops counting (crate::validity), as the
/// planner's wingtip_native.weather_expires_at and weather_in_force take
/// it: `weather_expires_at` the instant, Unix seconds, or null, and
/// `weather_in_force` whether it still counts at `now`.
fn weather_validity_rule(ask: &Ask) -> Result<String, String> {
    use crate::validity::{self, Product};
    let product = match ask.str("product")? {
        "metar" => Product::Metar,
        "speci" => Product::Speci,
        "taf" => Product::Taf,
        "winds" => Product::WindsAloft,
        "advisory" => Product::Advisory,
        other => return Err(format!("{}: \"product\" is metar, speci, taf, winds or advisory, not {other:?}", ask.name)),
    };
    // Whole seconds, as the reports' own times are.
    let secs = |key: &str| ask.opt_num(key).map(|n| n.map(|s| s.floor() as i64));
    let (observed, last_routine, valid_to) = (secs("observed")?, secs("last_routine")?, secs("valid_to")?);
    if ask.name == "weather_expires_at" {
        let mut out = String::new();
        json::opt_number(&mut out, validity::expires_at(product, observed, last_routine, valid_to).map(|t| t as f64));
        return Ok(out);
    }
    let now = ask.num("now")?.floor() as i64;
    let yes = validity::in_force(product, now, observed, last_routine, secs("valid_from")?, valid_to);
    Ok(if yes { "true" } else { "false" }.to_owned())
}

/// The strip's fuel (figures::strip::fuel_figure): `{"required_gal",
/// "short": [{"name", "short_gal"}]}`.
fn strip_fuel_rule(ask: &Ask) -> Result<String, String> {
    let name = ask.name;
    let hops = match ask.v.get("hops") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(list)) => list
            .iter()
            .map(|h| {
                let s = |k: &str| h.get(k).and_then(Value::as_str).unwrap_or("").to_owned();
                Ok(strip::Hop {
                    departure: s("departure"),
                    destination: s("destination"),
                    fuel_required_gal: opt_num_in(name, h, "fuel_required_gal")?,
                    fuel_margin_gal: opt_num_in(name, h, "fuel_margin_gal")?,
                })
            })
            .collect::<Result<Vec<_>, String>>()?,
        Some(_) => return Err(format!("{name}: \"hops\" is not a list")),
    };
    let hop = ask.opt_num("hop")?.unwrap_or(0.0).max(0.0) as usize;
    let (required, short) =
        strip::fuel_figure(ask.opt_num("fuel_required_gal")?, ask.opt_num("fuel_margin_gal")?, &hops, hop, ask.opt_num("burnt_gal")?);
    let mut out = String::from("{\"required_gal\":");
    json::opt_number(&mut out, required);
    out.push_str(",\"short\":[");
    for (i, s) in short.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"name\":");
        json::string(&mut out, &s.name);
        out.push_str(",\"short_gal\":");
        json::number(&mut out, s.short_gal);
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}

/// NOTAMs and a TFR as sent, read (crate::notam, tfr), each answer the
/// planner's own dicts; and the figures read off a report: its ceiling and
/// the basic VFR minimums it is held to.
fn weather_rule(ask: &Ask) -> Result<String, String> {
    let read = |found: Option<String>| found.unwrap_or_else(|| "null".to_owned());
    match ask.name {
        "notams_fns" => Ok(crate::notam::to_json(&crate::notam::from_fns(ask.str("text")?))),
        "tfr_detail_read" => {
            let text = ask.str("text")?;
            if let Err(e) = crate::xml::parse(text) {
                return Err(format!("tfr_detail_read: not XML: {} at {}", e.what, e.at));
            }
            Ok(read(crate::tfr::parse_detail(text).map(|d| crate::tfr::to_json(&d))))
        }
        "ceiling_ft" => {
            let mut layers = Vec::new();
            if let Some(listed) = ask.v.get("layers").filter(|l| !matches!(l, Value::Null)) {
                for l in listed.as_array().ok_or_else(|| format!("{}: \"layers\" is not a list", ask.name))? {
                    layers.push((l.get("cover").and_then(Value::as_str).unwrap_or(""), opt_num_in(ask.name, l, "base_ft")?));
                }
            }
            let (ceiling, _) = crate::metar::sky_ceiling_of(layers, ask.opt_num("vert_vis_ft")?);
            let mut out = String::new();
            json::opt_number(&mut out, ceiling);
            Ok(out)
        }
        // Whether a ceiling or a visibility is under 91.155(c), (d)'s basic
        // VFR minimums (1,000 ft, 3 sm, rules.rs): a missing figure is not
        // below anything, the caller saying it is unknown.
        "below_vfr_minimums" => {
            let below = ask.opt_num("ceiling_ft")?.is_some_and(|c| c < crate::rules::SURFACE_AREA_CEILING_FT)
                || ask.opt_num("visibility_sm")?.is_some_and(|v| v < crate::rules::SURFACE_AREA_VISIBILITY_SM);
            Ok(below.to_string())
        }
        // The forecast's along-route reasons, held to the basic VFR
        // minimums the airspace rules keep (91.155(c), (d)), which the
        // weather crate is under.
        "vfr_not_recommended_reasons" => {
            let idents: Vec<&str> = match ask.v.get("idents") {
                Some(Value::Array(items)) => items.iter().filter_map(Value::as_str).collect(),
                _ => Vec::new(),
            };
            let reasons = crate::forecast::route::vfr_not_recommended_reasons(
                &idents,
                ask.v.get("metars").unwrap_or(&Value::Null),
                ask.v.get("forecast").unwrap_or(&Value::Null),
                crate::rules::SURFACE_AREA_CEILING_FT,
                crate::rules::SURFACE_AREA_VISIBILITY_SM,
            );
            let mut out = String::from("[");
            for (i, r) in reasons.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::string(&mut out, r);
            }
            out.push(']');
            Ok(out)
        }
        _ => {
            let mut out = String::from("{\"ceiling_ft\":");
            json::number(&mut out, crate::rules::SURFACE_AREA_CEILING_FT);
            out.push_str(",\"visibility_sm\":");
            json::number(&mut out, crate::rules::SURFACE_AREA_VISIBILITY_SM);
            out.push('}');
            Ok(out)
        }
    }
}

/// The web's debrief (its figures, snake_case, with no marks) marked as
/// /api/debrief marks its own -- each leg, pass and pattern against ACS
/// PA.VI.A's tolerances -- with the tolerances beside it: `{"debrief",
/// "tolerances"}`. The rest of the debrief goes back as it came.
fn debrief_marked_rule(ask: &Ask) -> Result<String, String> {
    let n = ask.name;
    let Some(Value::Object(members)) = ask.v.get("debrief") else {
        return Err(format!("{n}: \"debrief\" is not an object"));
    };
    let num = |v: &Value, k: &str| opt_num_in(n, v, k);
    let opt = |v: Option<f64>| v.map_or(Value::Null, Value::Number);
    let mut marked: Vec<(String, Value)> = Vec::new();
    for (key, value) in members {
        let items = || value.as_array().ok_or_else(|| format!("{n}: \"{key}\" is not a list"));
        let with = |item: &Value, extra: Vec<(&str, Value)>| -> Result<Value, String> {
            let Value::Object(fields) = item else { return Err(format!("{n}: an item of \"{key}\" is not an object")) };
            let mut fields = fields.clone();
            fields.retain(|(k, _)| !extra.iter().any(|(e, _)| e == k));
            fields.extend(extra.into_iter().map(|(k, v)| (k.to_owned(), v)));
            Ok(Value::Object(fields))
        };
        let value = match key.as_str() {
            "legs" => Value::Array(
                items()?
                    .iter()
                    .map(|l| with(l, vec![("ok", Value::Bool(debrief::leg_ok(num(l, "worst_alt_ft")?, num(l, "worst_off_nm")?)))]))
                    .collect::<Result<_, _>>()?,
            ),
            "passes" => Value::Array(
                items()?
                    .iter()
                    .map(|p| {
                        let category = p.get("category").and_then(Value::as_str).unwrap_or("");
                        let (landed, late, ok) = debrief::pass_marks(category, num(p, "due_min")?, num(p, "passed_min")?);
                        with(p, vec![("landed", Value::Bool(landed)), ("late_min", opt(late)), ("ok", ok.map_or(Value::Null, Value::Bool))])
                    })
                    .collect::<Result<_, _>>()?,
            ),
            "patterns" => Value::Array(
                items()?
                    .iter()
                    .map(|e| {
                        let alt = num(e, "alt_ft")?.ok_or_else(|| format!("{n}: a pattern's \"alt_ft\" is missing"))?;
                        let pattern = num(e, "pattern_ft")?.ok_or_else(|| format!("{n}: a pattern's \"pattern_ft\" is missing"))?;
                        let (off, ok) = debrief::pattern_marks(alt, pattern);
                        with(e, vec![("off_ft", Value::Number(off)), ("ok", Value::Bool(ok))])
                    })
                    .collect::<Result<_, _>>()?,
            ),
            _ => value.clone(),
        };
        marked.push((key.clone(), value));
    }
    let mut out = String::from("{\"debrief\":");
    json::value(&mut out, &Value::Object(marked));
    out.push_str(",\"tolerances\":");
    out.push_str(&debrief::tolerances_json());
    out.push('}');
    Ok(out)
}

/// The flight's figures (crate::flight, phone, motion) as the
/// planner's wingtip_native functions of the same names work them out.
fn flight_rule(ask: &Ask) -> Result<String, String> {
    use crate::flight;
    let mut out = String::new();
    let figure = match ask.name {
        "reserve_min" => flight::reserve_min(ask.opt_bool("ifr")?, ask.opt_bool("night")?),
        "isa_temp_c" => flight::isa_temp_c(ask.num("altitude_ft")?),
        "density_ratio" => flight::density_ratio(ask.num("altitude_ft")?, ask.num("oat_c")?),
        "density_altitude_ft" => flight::density_altitude_ft(ask.num("sigma")?),
        "pressure_altitude_ft" => flight::pressure_altitude_ft(ask.num("elevation_ft")?, ask.num("altimeter_inhg")?),
        "lowest_vfr_cruising_altitude" => flight::lowest_vfr_cruising_altitude(ask.num("floor_ft")?, ask.num("magnetic_course_deg")?),
        "is_eastbound" => return Ok(flight::is_eastbound(ask.num("magnetic_course_deg")?).to_string()),
        "groundspeed_kt" => flight::groundspeed_kt(
            ask.num("true_course_deg")?,
            ask.num("wind_from_deg")?,
            ask.num("wind_kt")?,
            ask.num("tas_kt")?,
            ask.num("wca_deg")?,
        ),
        _ => {
            json::string(&mut out, &crate::pack_query::region_of(ask.num("lat")?, ask.num("lon")?));
            return Ok(out);
        }
    };
    json::number(&mut out, figure);
    Ok(out)
}

/// Night and civil twilight (crate::sun, 14 CFR 1.1).
fn sun_rule(ask: &Ask) -> Result<String, String> {
    use crate::sun;
    let pair = |key: &str| -> Result<(f64, f64), String> {
        match ask.v.get(key).and_then(Value::as_array) {
            Some([a, b]) => a.as_f64().zip(b.as_f64()).ok_or_else(|| format!("{}: \"{key}\" is not [lat, lon]", ask.name)),
            _ => Err(format!("{}: \"{key}\" is not [lat, lon]", ask.name)),
        }
    };
    let night = match ask.name {
        "night_on_the_way" => sun::night_on_the_way(pair("start")?, pair("end")?, ask.num("depart_s")?, ask.num("minutes")?),
        "passenger_night" => sun::passenger_night(ask.num("lat")?, ask.num("lon")?, ask.num("at_s")?),
        // The sky's own day and night (sunset to sunrise), not 1.1's.
        "sun_down" => sun::sun_down(ask.num("lat")?, ask.num("lon")?, ask.num("at_s")?),
        "passenger_night_on_the_way" => {
            sun::passenger_night_on_the_way(pair("start")?, pair("end")?, ask.num("depart_s")?, ask.num("minutes")?)
        }
        _ => sun::night_at_either_end(pair("start")?, ask.num("depart_s")?, pair("end")?, ask.num("arrive_s")?),
    };
    Ok(if night { "true" } else { "false" }.to_owned())
}

/// The nav log's checkpoints from the chart model's candidates
/// (route::checkpoints).
fn checkpoints_rule(ask: &Ask) -> Result<String, String> {
    use crate::route::checkpoints::{self, Candidate};
    let candidates: Vec<Candidate> = ask
        .list("candidates")?
        .iter()
        .map(|c| Candidate {
            along_track_nm: c.get("along_track_nm").and_then(Value::as_f64),
            score: c.get("predicted_score").and_then(Value::as_f64),
        })
        .collect();
    // A missing min_score is the planner's MIN_SCORE; null takes every score.
    let min_score = match ask.v.get("min_score") {
        None => Some(checkpoints::MIN_SCORE),
        Some(Value::Null) => None,
        Some(Value::Number(n)) => Some(*n),
        Some(_) => return Err(format!("{}: \"min_score\" is not a number or null", ask.name)),
    };
    let picked = checkpoints::select(
        &candidates,
        ask.opt_num("min_spacing_nm")?.unwrap_or(checkpoints::MIN_SPACING_NM),
        ask.opt_num("max_count")?.map(|n| n.max(0.0) as usize),
        min_score,
        ask.opt_num("length_nm")?,
    );
    let mut out = String::from("[");
    for (i, p) in picked.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str(&p.to_string());
    }
    out.push(']');
    Ok(out)
}

/// The altitudes a flight may be planned at (crate::limits).
fn limits_rule(ask: &Ask) -> Result<String, String> {
    use crate::limits;
    let mut out = String::new();
    match ask.name {
        "altitude_limits" => {
            let ifr = ask.opt_bool("ifr")?;
            out.push_str("{\"lowest_ft\":");
            json::number(&mut out, limits::LOWEST_FT);
            out.push_str(",\"highest_ft\":");
            json::number(&mut out, limits::highest_ft(ifr));
            out.push_str(",\"class_a_floor_ft\":");
            json::number(&mut out, limits::CLASS_A_FLOOR_FT);
            out.push_str(",\"flight_levels_from_ft\":");
            json::number(&mut out, limits::FLIGHT_LEVELS_FROM_FT);
            out.push_str(",\"step_ft\":");
            json::number(&mut out, limits::STEP_FT);
            out.push('}');
        }
        "altitude_allowed" => out.push_str(if limits::allowed(ask.num("ft")?, ask.opt_bool("ifr")?) { "true" } else { "false" }),
        "vfr_altitudes" => {
            out.push('[');
            for (i, ft) in limits::vfr_altitudes(ask.opt_num("from_ft")?.unwrap_or(1000.0)).iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                json::number(&mut out, *ft);
            }
            out.push(']');
        }
        // AIM 4-2-9: feet below 18,000 ft, a flight level from there up.
        "altitude_said" => {
            let ft = ask.num("ft")?;
            let said = if limits::is_flight_level(ft) { format!("FL{}", (ft / 100.0).round()) } else { crate::figures::words::feet(ft) };
            json::string(&mut out, &said);
        }
        _ => return Err(format!("the engine has no rule called {:?}", ask.name)),
    }
    Ok(out)
}

/// FAA Form 7233-4's items as AIM Appendix 4 writes them (crate::filing).
fn filing_rule(ask: &Ask) -> Result<String, String> {
    use crate::filing;
    let mut out = String::new();
    match ask.name {
        "filed_level" => json::string(&mut out, &filing::level(ask.num("ft")?)),
        "filed_speed" => json::string(&mut out, &filing::speed(ask.num("tas_kt")?)),
        "filed_duration" => json::string(&mut out, &filing::duration(ask.num("minutes")?)),
        "filed_wake" => json::opt_string(&mut out, filing::wake(ask.opt_num("max_takeoff_lb")?)),
        "filed_zzzz" => out.push_str(if filing::needs_zzzz(ask.str("ident")?) { "true" } else { "false" }),
        _ => {
            let words = |key: &str| -> Result<Vec<&str>, String> {
                match ask.v.get(key) {
                    None | Some(Value::Null) => Ok(Vec::new()),
                    Some(Value::Array(list)) => {
                        list.iter().map(|w| w.as_str().ok_or_else(|| format!("filed_route: \"{key}\" is not a list of strings"))).collect()
                    }
                    Some(_) => Err(format!("filed_route: \"{key}\" is not a list of strings")),
                }
            };
            let procedure = |key: &str| -> Result<Option<filing::Procedure>, String> {
                match ask.v.get(key) {
                    None | Some(Value::Null) => Ok(None),
                    Some(p) => Ok(Some(filing::Procedure {
                        id: p.get("id").and_then(Value::as_str).ok_or_else(|| format!("filed_route: \"{key}\" has no \"id\""))?,
                        transition: p.get("transition").and_then(Value::as_str),
                    })),
                }
            };
            let (stops, airways) = (words("stops")?, words("airways")?);
            let (departure, arrival) = (procedure("departure")?, procedure("arrival")?);
            json::string(&mut out, &filing::route(&stops, |w| airways.contains(&w), departure.as_ref(), arrival.as_ref()));
        }
    }
    Ok(out)
}

/// FAA Form 7233-4's items the web worked out itself before (crate::filing).
fn filing_more_rule(ask: &Ask) -> Result<String, String> {
    use crate::filing;
    let mut out = String::new();
    match ask.name {
        "filed_endurance" => match filing::endurance_minutes(ask.num("fuel_gal")?, ask.num("burn_gph")?) {
            Some(m) => out.push_str(&m.to_string()),
            None => out.push_str("null"),
        },
        "filed_dof" => json::opt_string(&mut out, filing::date_of_flight(ask.str("depart")?, ask.str("today")?).as_deref()),
        _ => {
            let airways: Vec<&str> = match ask.v.get("airways") {
                None | Some(Value::Null) => Vec::new(),
                Some(Value::Array(list)) => list.iter().filter_map(Value::as_str).collect(),
                Some(_) => return Err("filed_rnav: \"airways\" is not a list of strings".to_owned()),
            };
            out.push_str(if filing::rnav_route(&airways) { "true" } else { "false" });
        }
    }
    Ok(out)
}

/// A figure written as the web app writes it (crate::figures::words), for
/// the planner's words that are compared with the web's word for word.
fn words_rule(ask: &Ask) -> Result<String, String> {
    use crate::figures::words;
    let mut out = String::new();
    let written = match ask.name {
        "words_num" => words::js_opt(ask.opt_num("n")?),
        "words_one" => {
            json::number(&mut out, words::one(ask.num("n")?));
            return Ok(out);
        }
        "words_to_fixed" => {
            let digits = ask.opt_num("digits")?.unwrap_or(1.0);
            if !(0.0..=20.0).contains(&digits) || digits.fract() != 0.0 {
                return Err(format!("words_to_fixed: \"digits\" is a whole number from 0 to 20, not {digits}"));
            }
            words::to_fixed(ask.num("n")?, digits as usize)
        }
        "words_grouped" => words::grouped(ask.num("n")?),
        "words_alt_ft" => words::alt_ft(ask.opt_num("ft")?),
        "words_flight_level" => words::flight_level(ask.opt_num("ft")?),
        _ => words::ceiling_and_visibility(ask.opt_num("ceiling_ft")?, ask.opt_num("visibility_sm")?),
    };
    json::string(&mut out, &written);
    Ok(out)
}

/// The input of one call, read with the rule's name in each complaint.
struct Ask<'a> {
    name: &'a str,
    v: &'a Value,
}

impl Ask<'_> {
    fn opt_num(&self, key: &str) -> Result<Option<f64>, String> {
        opt_num_in(self.name, self.v, key)
    }

    fn num(&self, key: &str) -> Result<f64, String> {
        num_in(self.name, self.v, key)
    }

    fn str(&self, key: &str) -> Result<&str, String> {
        self.v.get(key).and_then(Value::as_str).ok_or_else(|| format!("{}: \"{key}\" is missing or not a string", self.name))
    }

    fn opt_str(&self, key: &str) -> Result<&str, String> {
        match self.v.get(key) {
            None | Some(Value::Null) => Ok(""),
            Some(Value::String(s)) => Ok(s),
            Some(_) => Err(format!("{}: \"{key}\" is not a string", self.name)),
        }
    }

    fn opt_bool(&self, key: &str) -> Result<bool, String> {
        match self.v.get(key) {
            None | Some(Value::Null) => Ok(false),
            Some(Value::Bool(b)) => Ok(*b),
            Some(_) => Err(format!("{}: \"{key}\" is not true or false", self.name)),
        }
    }

    fn list(&self, key: &str) -> Result<&[Value], String> {
        self.v.get(key).and_then(Value::as_array).ok_or_else(|| format!("{}: \"{key}\" is missing or not a list", self.name))
    }
}

fn opt_num_in(name: &str, v: &Value, key: &str) -> Result<Option<f64>, String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => Ok(Some(*n)),
        Some(_) => Err(format!("{name}: \"{key}\" is not a number")),
    }
}

fn num_in(name: &str, v: &Value, key: &str) -> Result<f64, String> {
    opt_num_in(name, v, key)?.ok_or_else(|| format!("{name}: \"{key}\" is missing"))
}

/// The route a clearance gives (clearance::cleared_route) from the words
/// heard, the planner's places for them and the route planned: the web's
/// lib/clearance clearedRoute, its input the places as ClearancePlaces
/// answers them.
fn cleared_route_rule(ask: &Ask) -> Result<String, String> {
    use crate::clearance::{self, Found, FoundPlaces, FoundProcedure, Route};
    let name = ask.name;
    let text = ask.str("text")?;
    let str_in = |v: &Value, key: &str| -> Option<String> { v.get(key).and_then(Value::as_str).map(str::to_owned) };
    let found_in = |v: &Value| -> Result<Found, String> {
        let kind = match v.get("kind").and_then(Value::as_str) {
            Some("airport") => Some("airport"),
            Some("navaid") => Some("navaid"),
            Some("fix") => Some("fix"),
            _ => None,
        };
        let sure = match v.get("sure") {
            Some(Value::Bool(b)) => *b,
            _ => true,
        };
        Ok(Found { said: str_in(v, "said").unwrap_or_default(), ident: str_in(v, "ident"), name: str_in(v, "name"), kind, sure })
    };
    let procedure_in = |v: Option<&Value>| -> Result<Option<FoundProcedure>, String> {
        match v {
            None | Some(Value::Null) => Ok(None),
            Some(p @ Value::Object(_)) => Ok(Some(FoundProcedure {
                id: str_in(p, "id").ok_or_else(|| format!("{name}: a procedure found has no \"id\""))?,
                transition: str_in(p, "transition"),
            })),
            Some(_) => Err(format!("{name}: a procedure found is not an object")),
        }
    };
    let found = match ask.v.get("found") {
        None | Some(Value::Null) => FoundPlaces::default(),
        Some(f @ Value::Object(_)) => FoundPlaces {
            limit: match f.get("limit") {
                Some(l @ Value::Object(_)) => Some(found_in(l)?),
                _ => None,
            },
            route: match f.get("route") {
                Some(Value::Array(runs)) => runs
                    .iter()
                    .map(|run| run.as_array().unwrap_or(&[]).iter().map(found_in).collect::<Result<Vec<_>, _>>())
                    .collect::<Result<Vec<_>, _>>()?,
                _ => Vec::new(),
            },
            departure: procedure_in(f.get("departure"))?,
            arrival: procedure_in(f.get("arrival"))?,
        },
        Some(_) => return Err(format!("{name}: \"found\" is not an object")),
    };
    let planned = match ask.v.get("planned") {
        Some(p @ Value::Object(_)) => Route {
            dep: str_in(p, "dep").unwrap_or_default(),
            stops: p
                .get("stops")
                .and_then(Value::as_array)
                .map(|s| s.iter().filter_map(|v| v.as_str().map(str::to_owned)).collect())
                .unwrap_or_default(),
            dest: str_in(p, "dest").unwrap_or_default(),
        },
        _ => return Err(format!("{name}: \"planned\" is missing or not an object")),
    };
    let (route, typed) = clearance::cleared_route(&clearance::read(text), &found, &planned);
    let mut out = String::from("{\"route\":{\"dep\":");
    json::string(&mut out, &route.dep);
    out.push_str(",\"stops\":[");
    for (i, stop) in route.stops.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        json::string(&mut out, stop);
    }
    out.push_str("],\"dest\":");
    json::string(&mut out, &route.dest);
    out.push_str("},\"typed\":[");
    for (i, t) in typed.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        out.push_str("{\"name\":");
        json::string(&mut out, &t.name);
        out.push_str(",\"before\":");
        json::opt_string(&mut out, t.before.as_deref());
        out.push_str(",\"after\":");
        json::opt_string(&mut out, t.after.as_deref());
        out.push('}');
    }
    out.push_str("]}");
    Ok(out)
}

fn holding_rule(ask: &Ask) -> Result<String, String> {
    let right = match ask.opt_str("turns")? {
        "" | "right" => true,
        "left" => false,
        other => return Err(format!("holding: turns are \"right\" or \"left\", not {other:?}")),
    };
    Ok(holding::holding_json(
        ask.num("inbound")?,
        ask.num("heading")?,
        right,
        ask.opt_num("tas_kt")?,
        ask.opt_num("wind_from")?,
        ask.opt_num("wind_kt")?,
        ask.opt_num("altitude_ft")?,
    ))
}

fn lost_comms_rule(ask: &Ask) -> Result<String, String> {
    let segments = ask
        .list("segments")?
        .iter()
        .map(|s| {
            let name = match s.get("name") {
                None | Some(Value::Null) => String::new(),
                Some(Value::String(n)) => n.clone(),
                Some(_) => return Err("lost_comms: a segment's \"name\" is not a string".to_owned()),
            };
            Ok((name, opt_num_in("lost_comms", s, "minimum_ft")?))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let expected_from = ask.opt_num("expected_from")?.unwrap_or(0.0);
    if expected_from.fract() != 0.0 {
        return Err("lost_comms: \"expected_from\" is a segment's index, a whole number".to_owned());
    }
    Ok(lost_comms::lost_comms_json(
        &segments,
        ask.opt_num("assigned_ft")?,
        ask.opt_num("expected_ft")?,
        expected_from as i64,
        ask.opt_bool("approach_fix")?,
        ask.opt_str("efc")?,
        ask.opt_str("eta")?,
    ))
}

fn diversion_rule(ask: &Ask) -> Result<String, String> {
    // No wind forecast is calm, as the planner flies the leg in.
    let (wind_from_deg, wind_kt) = match ask.v.get("wind") {
        None | Some(Value::Null) => (0.0, 0.0),
        Some(w @ Value::Object(_)) => {
            (opt_num_in("diversion", w, "wind_dir_true_deg")?.unwrap_or(0.0), opt_num_in("diversion", w, "wind_speed_kt")?.unwrap_or(0.0))
        }
        Some(_) => return Err("diversion: \"wind\" is not an object".to_owned()),
    };
    let air = diversion::Air {
        tas_kt: ask.num("tas_kt")?,
        fuel_burn_gph: ask.num("fuel_burn_gph")?,
        magnetic_variation_deg: ask.num("magnetic_variation_deg")?,
        wind_from_deg,
        wind_kt,
    };
    let typed = [ask.opt_num("mh")?, ask.opt_num("gs")?, ask.opt_num("ete")?, ask.opt_num("fuel")?];
    Ok(diversion::diversion_json(&air, ask.num("true_course_deg")?, ask.num("distance_nm")?, ask.opt_str("to")?, typed))
}

fn checkpoints(ask: &Ask) -> Result<Vec<debrief::Checkpoint>, String> {
    let n = ask.name;
    ask.list("checkpoints")?
        .iter()
        .map(|c| {
            let text = |key: &str| {
                c.get(key).and_then(Value::as_str).map(str::to_owned).ok_or_else(|| format!("{n}: a checkpoint's \"{key}\" is missing"))
            };
            let sequence_no = num_in(n, c, "sequence_no")?;
            if sequence_no.fract() != 0.0 {
                return Err(format!("{n}: a checkpoint's \"sequence_no\" is not a whole number"));
            }
            Ok(debrief::Checkpoint {
                sequence_no: sequence_no as i64,
                name: text("name")?,
                category: text("category")?,
                lat: num_in(n, c, "lat")?,
                lon: num_in(n, c, "lon")?,
                along_track_nm: num_in(n, c, "along_track_nm")?,
                true_course_deg: opt_num_in(n, c, "true_course_deg")?,
                ete_min: opt_num_in(n, c, "ete_min")?,
                altitude_ft: opt_num_in(n, c, "altitude_ft")?,
            })
        })
        .collect()
}

fn points(ask: &Ask) -> Result<Vec<debrief::Point>, String> {
    let n = ask.name;
    ask.list("points")?
        .iter()
        .map(|p| {
            Ok(debrief::Point {
                t: num_in(n, p, "t")?,
                lat: num_in(n, p, "lat")?,
                lon: num_in(n, p, "lon")?,
                alt_ft: opt_num_in(n, p, "alt_ft")?,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rule_by_name_answers_its_endpoints_json() {
        let held = call("holding", r#"{"inbound": 360, "heading": 112, "turns": "right"}"#).unwrap();
        assert!(held.starts_with(r#"{"entry":"teardrop","entry_name":"#), "{held}");
        assert!(held.contains(r#""either":"direct""#), "{held}");
        assert_eq!(call("holding_leg_minutes", r#"{"altitude_ft": 16000}"#).unwrap(), "1.5");
        assert_eq!(call("holding_leg_minutes", "{}").unwrap(), "1.0");
        assert_eq!(call("wind_triangle", r#"{"tc": 360, "tas": 50, "wind_from_deg": 270, "wind_kt": 60}"#).unwrap(), "null");
        assert_eq!(call("diversion_reasonable", r#"{"key": "mh", "typed": 2, "exact": 355}"#).unwrap(), "true");
    }

    #[test]
    fn bad_asks_are_errors_not_panics() {
        assert_eq!(call("nope", "{}").unwrap_err(), "the engine has no rule called \"nope\"");
        assert!(call("holding", "[1]").unwrap_err().contains("not a JSON object"));
        assert_eq!(call("holding", r#"{"inbound": 360}"#).unwrap_err(), "holding: \"heading\" is missing");
        assert!(call("holding", r#"{"inbound": "x", "heading": 1}"#).unwrap_err().contains("not a number"));
        assert!(call("holding", r#"{"inbound": 1, "heading": 1, "turns": "up"}"#).is_err());
        assert!(call("debrief", r#"{"checkpoints": [], "points": [{"t": 0}]}"#).is_err());
        assert!(call("diversion_reasonable", r#"{"key": "tc", "typed": 1, "exact": 1}"#).is_err());
        assert!(call("lost_comms", "{").unwrap_err().starts_with("JSON:"));
    }
}
