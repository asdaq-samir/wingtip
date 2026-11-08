//! One way in for every host: a rule asked by its name, its input a JSON
//! object, its answer JSON. The web app (engine/bindings/wasm, from TypeScript),
//! the planner (wingtip_native.call) and the phones (wt_call) all come in
//! here, so a rule moved into the engine needs no new function on any of
//! them -- only a name below. The answers are the planner's endpoints'
//! own JSON, snake_case, where a rule has an endpoint. Each one's shapes
//! exactly: engine/contract/engine.schema.json, which tests/contract.rs
//! holds the answers to and the web's types are made from. In short:
//!
//! - `holding`: /api/holding's answer (AIM 5-3-8), from `{"inbound",
//!   "heading", "turns": "right"|"left", "tas_kt"?, "wind_from"?,
//!   "wind_kt"?, "altitude_ft"?}`, the endpoint's query;
//! - `holding_leg_minutes`: the inbound leg's minutes (AIM 5-3-8 j.4(a)),
//!   from `{"altitude_ft"?}`;
//! - `lost_comms`: /api/lost-comms's answer (14 CFR 91.185), from its
//!   body, `{"segments": [{"name", "minimum_ft"?}], "assigned_ft"?,
//!   "expected_ft"?, "expected_from"?, "approach_fix"?, "efc"?, "eta"?}`;
//! - `strip_fuel`: `{"required_gal", "short": [{"name", "short_gal"}]}`,
//!   the strip's fuel figure on web, iPhone and Android (figures::strip),
//!   from the planner's totals `{"fuel_required_gal"?, "fuel_margin_gal"?,
//!   "hops"?: [{"departure", "destination", "fuel_required_gal"?,
//!   "fuel_margin_gal"?}], "hop"?, "burnt_gal"?}`;
//! - `fuel_in_tanks`: `[{"gal", "low"}|null]`, a point each, the fuel in
//!   the tanks along the route, filled at each field landed at, from
//!   `{"points": [{"departure"?, "fuel_gal"?, "refuel"?}], "usable_gal",
//!   "taxi_gal", "reserve_gal"}`;
//! - `fuel_estimate`: `{"minutes", "trip_gal", "required_gal"}`, from the
//!   airplane's book alone before the nav log's, `{"distance_nm",
//!   "cruise_tas_kt"?, "fuel_burn_gph"?}`;
//! - `diversion`: /api/diversion's `solved`, `steps`, `problem` and
//!   `checks` (ACS PA.VI.C), from the leg's air the planner looks up for
//!   it, `{"true_course_deg", "distance_nm", "tas_kt", "fuel_burn_gph",
//!   "magnetic_variation_deg", "wind": {"wind_dir_true_deg",
//!   "wind_speed_kt"}|null, "to"?, "mh"?, "gs"?, "ete"?, "fuel"?}`;
//! - `wind_triangle`: `{"wca", "th", "gs"}` or null, from `{"tc", "tas",
//!   "wind_from_deg", "wind_kt"}`;
//! - `diversion_reasonable`: whether an estimate is within the drill's
//!   allowance, from `{"key", "typed", "exact"}`;
//! - `debrief`: /api/debrief's answer (ACS PA.VI.A), from its body,
//!   `{"checkpoints": [{"sequence_no", "name", "category", "lat", "lon",
//!   "along_track_nm", "true_course_deg"?, "ete_min"?, "altitude_ft"?}],
//!   "points": [{"t", "lat", "lon", "alt_ft"?}]}`, with the fields'
//!   pattern altitudes, which the planner looks up, as `"patterns":
//!   {ident: ft}`;
//! - `debrief_marked`: the web's debrief (snake_case, unmarked) marked as
//!   `debrief` marks its own, `{"debrief", "tolerances"}`, from
//!   `{"debrief"}`;
//! - `hold_entry`: a route hold's entry, "direct", "teardrop" or
//!   "parallel" (AIM 5-3-8 j.3), from `{"arrival_deg", "inbound_deg",
//!   "turns"?: "right"|"left"}`;
//! - `wind_correction_deg`, `groundspeed_kt`: the nav log's wind triangle
//!   a side at a time (a crosswind past the airspeed held at 90 degrees),
//!   from `{"true_course_deg", "wind_from_deg", "wind_kt", "tas_kt"}`, and
//!   `"wca_deg"` (the correction) for the ground speed;
//! - `debrief_airborne`: the track's flights as [first, last] indices,
//!   from `{"points"}`;
//! - `read_clearance`: an ATC clearance heard, read into its items as the
//!   web's lib/clearance read it (clearance.rs, AIM 4-4-3), from
//!   `{"text"}`, the answer the web's Clearance (camelCase);
//! - `read_atis`: an ATIS or AWOS/ASOS broadcast heard, read into its
//!   figures (atis.rs, AIM 4-1-13), from `{"text"}`: `{"information",
//!   "time_z", "wind": {"from_deg", "kt", "gust_kt", "variable"}|null,
//!   "visibility_sm", "sky": [{"cover", "base_ft"}], "temp_c",
//!   "dewpoint_c", "altimeter_inhg", "approach", "runways": {"landing",
//!   "departing"}, "remarks", "raw"}`;
//! - `cleared_route`: the route a clearance gives, `{"route": {"dep",
//!   "stops", "dest"}, "typed": [{"name", "before", "after"}]}`, from
//!   `{"text", "found"?: {"limit"?, "route"?, "departure"?, "arrival"?}
//!   (the planner's ClearancePlaces), "planned": {"dep", "stops", "dest"}}`;
//! - `our_call`: whether a transmission is said to the airplane `tail`
//!   (AIM 4-2-4), from `{"text", "tail"}`;
//! - `direct_of`: the place a "direct" sends us to, as words to find, or
//!   null, from `{"text"}`;
//! - `call_pattern`: our call sign as a regular expression over a
//!   recognizer's words (AIM 4-2-4), for a locked phone's listener, or
//!   null where `tail` is no registration, from `{"tail"}`;
//! - `tokens`: the words heard with each run of figures one number (AIM
//!   4-2-8, 4-2-9), `[{"word", "num"?}]`, from `{"text"}`;
//! - `place_words`: words for a place as the planner looks them up, the
//!   ICAO alphabet's spelled, from `{"tokens": [{"word", "num"?}]}`;
//! - `readback_check`: a readback against the clearance heard (AIM
//!   4-4-7), `{"items": [{"item", "cleared", "said"}], "words"}`, from
//!   `{"cleared", "said"}`, both as heard.
//!
//! The Brief's Go / No-Go (crate::gonogo, the web's lib/verdict and the
//! modules it is fed from), each from the planner's and the web's own
//! objects in snake_case:
//!
//! - POST /api/go-no-go's `items` and `line`, a step each:
//!   `gonogo_verdict_items` from a VerdictInput, `gonogo_alternate_finding`
//!   from `{"data"?}` (/api/alternate's answer), `gonogo_with_alternate`
//!   from `{"items", "found"?}` and `gonogo_verdict_line` from
//!   `{"items"}`. A VerdictInput
//!   is `{"weather": {"pending", "failed"?, "vfr_not_recommended",
//!   "under_minimums", "icing"?, "hazards", "unchecked", "worst"?},
//!   "airspace": {"pending", "unchecked", "in_force", "near",
//!   "special_use": [{"name", "when"}]}, "altitude": {"pending",
//!   "problem"?, "cautions", "flown"?}, "fuel": {"pending", "margin_gal"?,
//!   "required_gal"?, "reserve_min"?, "ifr"?}, "runways": {"pending",
//!   "worked", "short", "crosswind", "beyond"?, "unchecked"?}, "balance":
//!   {"pending", "worked", "problems", "takeoff"?}, "risk"?: {"level",
//!   "line"}}; a section that leaves out the lists it is decided by is
//!   "unknown", never "ok";
//! - `gonogo_under_minimums`: the sentences where the weather is under the
//!   pilot's minimums, from `{"minimums": {"ceiling_ft"?, "visibility_sm"?,
//!   "crosswind_kt"?, "wind_kt"?}, "landings": [ident], "dest", and the
//!   briefing's "metars", "airports" and "forecast"}`;
//!   `gonogo_best_crosswind` from `{"runways", "reported"?: {"speed_kt"?,
//!   "gust_kt"?}}`;
//! - `gonogo_icing`: icing at an altitude flown, with its line, or null,
//!   from `{"selection": {"freezing_level_ft"?, "icing_possible",
//!   "freezing_level_at_or_below"}, "flown_ft", "pireps": [{"icing"?}]}`;
//!   `gonogo_icing_line` from `{"icing"}`;
//! - `gonogo_risk`: the risk assessment, its line, what to do and every
//!   factor marked, from a FratInput, `{"vfr_not_recommended",
//!   "under_minimums", "tfr_on_route", "hazards", "night",
//!   "fuel_margin_gal"?, "ifr"?, "vor_check"? (left out for a stock
//!   profile, null for none recorded), "inspections"?, "squawks"?,
//!   "currency"?, "day", "ticked": {key: true}}`;
//!   `gonogo_inspection_factors` from `{"inspections", "day", "ifr"}`,
//!   `gonogo_squawk_factors` from `{"squawks", "night", "ifr"}`,
//!   `gonogo_self_checks` from `{}`, `gonogo_risk_line` from `{"level",
//!   "score"}`;
//! - `gonogo_runway_checks`: the runway check at every field, fields and
//!   runways by index, from `{"aircraft": {"takeoff"?, "landing"?,
//!   "crosswind"?}, "fields": [{"ident", "elevation_ft"?}], the briefing's
//!   "metars" and "airports", "takeoff_lb"?, "landing_lb"?, "picks"?:
//!   {"pattern", "takeoff"} (objects of field to end, or [field, end]
//!   pairs)}`; `gonogo_short_field`, `gonogo_end_distance`,
//!   `gonogo_density_altitude`, `gonogo_field_air`, `gonogo_soft_surface`
//!   from `{"surface"?}`, `gonogo_runway_number` from `{"ident"}`,
//!   `gonogo_runway_flown`
//!   and `gonogo_runway_in_use` (runway and end by index),
//!   `gonogo_picked_end`;
//! - `gonogo_balance` from `{"loading", "load", "trip_fuel_gal"?}`,
//!   `gonogo_default_load` from `{"loading", "fuel_gal"}`,
//!   `gonogo_in_envelope` from `{"envelope", "arm", "weight"}`;
//! - `gonogo_pass_minutes` (minutes after departure, or null) from
//!   `{"legs": [{"distance_nm", "ete_min"?}], "along_nm"}`;
//!   `gonogo_tfr_when` from `{"at_us", "effective_us"?, "expires_us"?}`
//!   (microseconds since 1970); `gonogo_sua_when` from `{"times_of_use"?,
//!   "utc": [day, minute], "local"?: [day, minute]}` (day 0 Sunday; the
//!   host works the clocks out in the area's own time zone, which the
//!   engine has no database of).
//! - `checklist_read`: a checklist typed as text read into the gateway's
//!   ChecklistDto, `{"sections": [{"title", "items": [{"challenge",
//!   "response"}]}]}`, from `{"text"}`;
//! - `checklist_write`: that checklist as text again, from `{"checklist"}`;
//! - `csv_rows`: a CSV file's rows of fields, from `{"text"}`;
//! - `logbook_csv_read`: a logbook CSV (ForeFlight's export or our own)
//!   read into `{"entries": [LogbookEntryRequest], "skipped": [{"line",
//!   "reason"}]}`, the entries camelCase as the gateway takes them, from
//!   `{"text"}`;
//! - `logbook_csv_write`: the logbook as a CSV file, from `{"entries":
//!   [LogbookEntry]}`, the gateway's own (camelCase);
//! - `handbook_within`: whether a figure typed or read in is within the
//!   bounds a light airplane's is believed within (handbook::BOUNDS),
//!   from `{"key", "value"}`;
//! - `handbook_figures`: a handbook specifications page's figures,
//!   `{"cruiseTasKt"?, "cruisePowerPct"?, "fuelBurnGph"?, "usableFuelGal"?,
//!   "climbTasKt"?, "serviceCeilingFt"?}` each `{"value", "words"}`, from
//!   `{"text"}`, the text read off its photo;
//! - `solo_standing`: `{"days", "standing"}` ("ok", "caution" within 7
//!   days, "stop", "unknown") from `{"until"?, "today"}`, a student's
//!   61.87(n) solo endorsement on the instructor's list;
//! - `endorsement_lapse`: the warning an instructor sees once their date
//!   has passed on the day of signing (14 CFR 61.197(a), (e)), or null,
//!   from `{"until"?, "until_kind"?: "RE"|"EXP", "signed_on"}`, days as
//!   "YYYY-MM-DD";
//! - `endorsements_in_force`: the latest not voided of each code, as
//!   `[[code, index]]` into the record (newest first), from `{"signed":
//!   [{"code", "voided"?}]}`;
//! - `endorsement_render`: an endorsement's words as they will be signed,
//!   from `{"template", "student", "fields"?: {name: text}}`;
//! - `acs_codes`: the ACS codes in pasted text, each once, from `{"text"}`;
//! - `pilot_currency`: where the pilot stands on a day, the gateway's
//!   CurrencyDto (14 CFR 61.56(c), 61.57(a)-(d)), from `{"entries":
//!   [LogbookEntry], "flight_review_on"?, "medical_expires_on"?,
//!   "ipc_on"?, "today"}`, days as "YYYY-MM-DD";
//! - `pilot_experience`: 61.109(a)'s aeronautical experience item by
//!   item, `[ExperienceItemDto]`, from `{"entries": [LogbookEntry],
//!   "today"}`.
//!
//! The things that move (crate::motion), each from the web's own shapes
//! in snake_case:
//!
//! - `traffic_marks`: `[{"label", "near"}]`, each airplane's height under
//!   it as TCAS writes it and whether it is within 1,000 ft of own ship's
//!   (14 CFR 91.159), from `{"own_ft"?, "planes": [{"altitude_ft"?,
//!   "vertical_fpm"?}]}`;
//! - `own_ship_hex`: which airplane heard is own ship's own transponder,
//!   its hex or null, from `{"planes": [TrafficAircraft], "fix": {"lat",
//!   "lon", "heading_deg"?, "speed_kt"?, "altitude_ft"?}|null}`;
//! - `closest_approach`: `{"in_min", "nm", "above_ft"}` or null, from
//!   `{"own": fix, "plane": TrafficAircraft}`;
//! - `airborne_now`: a watched airplane in the air, true, false or null,
//!   from `{"before": bool|null, "airborne", "arrived", "heard_s"?}`;
//! - `alert_fires`: `{"fires", "inside", "nm", "bearing_deg"}`, from
//!   `{"kind": "takeoff"|"land"|"near", "before_airborne", "was_inside"?,
//!   "airborne", "arrived"?, "plane": {"lat", "lon"}|null, "to"?,
//!   "limit_nm"?}`;
//! - `glide_range`: still-air glide nm or null, from `{"altitude_ft"?,
//!   "speed_kt"?, "ground_ft"?}`; `glide_reaches`: a field within it at
//!   pattern height, from `{"altitude_ft"?, "speed_kt"?, "distance_nm",
//!   "elevation_ft"?}`; `underway`: at flying speed, from `{"speed_kt"?}`;
//! - `plan_profile`: `{"points", "marks", "length_nm"}`, the plan's
//!   altitudes along the route, from `{"rows"}`, the web's nav log rows;
//! - `descent_altitude`: feet MSL, about where a three-to-one descent to
//!   pattern altitude has the airplane `nm_out` from the field, to the
//!   hundred, no higher than the cruise (the cruise with no pattern
//!   altitude), from `{"cruise_ft", "pattern_ft"?, "nm_out"}`;
//! - `dry_run`: the planned flight flown on paper (motion::dry_run's
//!   to_json), from `{"rows", "start_s", "line"?, "missed"?}`;
//! - `read_track`: `{"points": [{"t", "lat", "lon", "alt_ft"}]}` or
//!   `{"error"}`, a GPX or KML track read, from `{"text"}`; `thin_track`:
//!   at most `most` (4,000) of `points`, from `{"points", "most"?}`.
//! The route's pilot-made pieces (crate::route), as the address writes
//! them and the planner's query reads them; a hold is `{"fix", "inbound",
//! "right", "leg_min"|"leg_nm", "turns"|"minutes"}`, the others null:
//!
//! - `hold_read`: a hold, or null, from `{"text"}`
//!   ("VPBNG/090/30:270:R:1M:2T");
//! - `holds_read`: `[{"part", "hold"}]`, each piece of `{"text"}` trimmed,
//!   the empty left out, its hold or null;
//! - `hold_write`: the hold's text, from `{"hold"}`;
//! - `hold_length_read`: `{"turns"}`, `{"minutes"}` or null, from
//!   `{"text"}` ("2T", "10M"); `hold_length_write`: the code, from
//!   `{"turns"|"minutes"}`;
//! - `hold_figures`: `{"lap_min", "held_min", "turn_radius_nm"}`, from
//!   `{"hold", "tas_kt"}`;
//! - `procedures_read`: `[{"part", "pick": {"ident", "id", "transition",
//!   "direct"}|null, "exact"}]` from `{"text"}`: the pick as the web app
//!   reads it, and whether it is one exactly as the planner takes it;
//!   `procedures_write`: the text, from `{"picks": [{"ident", "id",
//!   "transition"?, "direct"?}]}`;
//! - `runways_read`: `[{"part", "pick": {"field", "runway"}|null}]`, from
//!   `{"text"}` ("KSTL:30R,KMSN:36");
//! - `altitude_lines`: `{"crossing": "at"|"between"|"at_or_above"|
//!   "at_or_below"|null, "lines": [{"ft", "under", "over"}]}`, from
//!   `{"min_ft"?, "max_ft"?}`;
//! - `point_kind`: "fix", "own" or null, from `{"text"}` as it is;
//! - `frd_read`: `{"base", "course", "distance_nm"}` or null, from
//!   `{"text"}`; `frd_write`: the point's ident, from `{"base", "course",
//!   "distance_nm"}`;
//! - `bare_field`: a field's FAA ident, from `{"ident"}`; `same_field`:
//!   whether `{"a", "b"}` name one field.
//!
//! Runways, the wind on them and the traffic pattern (crate::runway, the
//! web's lib/wind, lib/pattern, lib/runwayFit, lib/takeoffLanding and
//! lib/trafficPattern, and wingtip.runway_wind and wingtip.pattern), a runway as
//! the planner sends one, `{"closed"?, "surface"?, "length_ft"?,
//! "runway_ends": [{"ident", "heading_true_deg"?, "traffic"?, "lat"?,
//! "lon"?}], "wind"?: {"end", "headwind_kt", "crosswind_kt",
//! "gust_crosswind_kt"?, "in_use"?}}`:
//!
//! - `wind_components`: `{"headwind_kt", "crosswind_kt"}` (a tailwind
//!   negative, a crosswind from the right positive), from `{"from_deg",
//!   "kt", "heading_deg"}`; `wind_steady_or_gust` from `{"steady_kt",
//!   "gust_kt"?}`; `runway_crosswind` and `runway_calm` from `{"wind"}`;
//!   `wind_calm` (AIM 7-1-28) from `{"speed_kt"?}`;
//! - `runway_end_heading`: an end's true heading or null, from `{"ident"?,
//!   "heading_true_deg"?, "variation_deg"}`; `runway_favoured_end`: the
//!   planner's RunwayWind or null, from `{"ends": [[ident, heading]],
//!   "metar"?: {"wind_dir_true_deg"?, "wind_speed_kt"?, "wind_gust_kt"?},
//!   "variation_deg", "recent"?: {"wind_dir_true_deg", "wind_speed_kt"}}`;
//!   `runway_with_winds`: each runway's, from `{"runways": [{"end_headings":
//!   [[ident, heading]]}], "metar"?, "variation_deg", "recent"?}`;
//! - `wind_pick`: lib/pattern's WindPick (snake_case) or null, from
//!   `{"runways", "nearby"?: {"station", "distance_nm", "dir_true_deg"?,
//!   "speed_kt"?, "gust_kt"?}, "forecast_at"?}`;
//! - `runway_end_key` from `{"ident"?}`, `faa_ids` from `{"ident"}`;
//!   `pattern_side` (14 CFR 91.126(b)(1)) from `{"heading_true_deg"?,
//!   "traffic"?}`, `compass_word` from `{"bearing_deg"}`, `pattern_entry`
//!   (AC 90-66C 11.3) `{"from", "pattern_side", "words"}` from `{"end",
//!   "course_deg"}`, `pattern_exit` (11.8) from `{"traffic"?}`,
//!   `pattern_altitude` `{"agl_ft", "altitude_ft", "published"}` from
//!   `{"elevation_ft"?, "published_agl_ft"?}`; `runway_ends_traffic`: each
//!   end's `{"ident", "heading_true_deg", "traffic"}`, from
//!   `{"end_headings", "variation_deg", "right": [end key]}`;
//! - `runway_end_fit`: `{"crosswind_kt", "crosswind_over", "needed_ft",
//!   "length_ft", "short", "close", "unknown", "beyond"}` (SAFO 19001's
//!   15 per cent; unknown where the distance or length is not), from
//!   `{"aircraft"?: {"takeoff"?, "landing"?, "crosswind"?:
//!   {"demonstrated_kt"?}}, "runway", "end": {"heading_true_deg"?},
//!   "wind"?: {"dir_true_deg"?, "speed_kt"?, "gust_kt"?}, "elevation_ft"
//!   (null: not known, no distance), "altimeter_in_hg"?, "temp_c"?, "weight_lb"?, "kind"}`;
//! - `traffic_pattern` and `departure_pattern`: lib/trafficPattern's
//!   TrafficPattern (snake_case) or null, from `{"ident", "runway",
//!   "end_ident", "altitude_ft"?, "toward"?: {"lat", "lon"}}`;
//!   `arrival_circuit` `{"points": [[lat, lon]]}` and `departure_circuit`
//!   `{"points", "exit_deg"}` or null, the planner's, from `{"runway",
//!   "end_ident", "toward": [lat, lon]}`.
//! The FAA's words in the app's (crate::wording, the web's lib/advisories,
//! lib/frequencies, lib/stopServices, lib/airspace and lib/navaid):
//!
//! - `faa_words`: the FAA's capitals in sentence case, its codes kept (AIM
//!   3-2-1's "Class B"), from `{"text"?}`, or each of `{"texts": [text]}`
//!   as a list, a long list's rows in one call; `title_case` and
//!   `place_name` (a town as it is spelt, "McCook") the same way;
//! - `radio_script`: a route's radio calls (AIM 4-2, AC 90-66C), `[{"title",
//!   "ident", "kind", "calls": [{"to", "mhz", "words", "note"?,
//!   "listen"?}]}]` from `{"call_sign", "airports": [{"ident", "name"?,
//!   "airspace_class"?, "frequencies", "pattern_altitude_ft"?, "takeoff"?,
//!   "landing"?: {"ident", "traffic"?}}], "legs"}`; `radio_call_sign` from
//!   `{"make", "tail"?}` ("Cessna Three Four Five Sierra Papa", AIM 4-2-4);
//!   `radio_place_name`, a field as a pilot calls it, from `{"name"?,
//!   "ident"}`;
//! - `sigmet_hazard` from `{"hazard"?, "kind"?}`; `gairmet_title` from
//!   `{"hazard", "severity"?}`; `pirep_conditions`, a string or null, from
//!   `{"turbulence"?, "icing"?}`;
//! - `sua_altitudes`: a special-use area's limits, STD a flight level (14
//!   CFR 1.1), from `{"floor_ft"?, "floor_ref"?, "ceiling_ft"?,
//!   "ceiling_ref"?, "mid_sentence"?}`;
//! - `fuel_names` from `{"types": [code]}`; `short_airspace_name` from
//!   `{"name"}`;
//! - `airspace_entry_rules`: `{"rules": [{"rule", "cite"}], "call":
//!   [type]}`, a Class B, C or D's entry, equipment and speed rules (14 CFR
//!   91.117, 91.129-91.131, 91.215, 91.225) and whom to call, from
//!   `{"class"}`;
//! - `frequency_line`: `{"name", "kind", "detail"}`, from `{"type"?,
//!   "description"?}`; `frequency_of`: the index of the first frequency
//!   of the first of `types` listed, or null, from `{"frequencies":
//!   [{"type"?, "description"?, "frequency_mhz"?}], "types"}`; `ctaf_of`:
//!   the CTAF's index, or MULTICOM's 122.9 where none is listed (AC 90-66C
//!   9.6), `{"type": "MULTICOM", "description", "frequency_mhz"}`, from
//!   `{"frequencies"}`; `kneeboard_radio`: `[[name, mhz]]` from
//!   `{"frequencies"}`;
//! - `radial_of`: `{"radial", "to_course", "nm"}` or null, from
//!   `{"station": {"ident"?, "lat", "lon", "mag_var"?}, "at": {"lat",
//!   "lon"}}`; `fix_radial_distance`: "JOT 045° 12 nm" or null (AIM
//!   5-1-6), from `{"at", "stations"}`; `morse` (AIM 1-1-3) from
//!   `{"ident"}`; `service_volume` (AIM 1-1-8 TBL 1-1-1) from `{"code"?}`;
//!   `navaid_hours` from `{"hours"?}`;
//! - `weather_expires_at`: when a report stops counting, Unix seconds, or
//!   null where nothing says (crate::validity: a METAR an hour after it
//!   was observed, AIM 7-1-28's "METAR-hourly"; a SPECI when the next
//!   routine report is due; a TAF, the FB winds or an advisory at the end
//!   of its valid time), from `{"product": "metar"|"speci"|"taf"|"winds"|
//!   "advisory", "observed"?, "last_routine"?, "valid_to"?}`;
//!   `weather_in_force`: whether it still counts at `now`, from the same
//!   with `"now"` and, for a forecast, `"valid_from"?`;
//! - `magnetic_variation`: degrees east, the World Magnetic Model's (wmm,
//!   as wingtip.magnetic), from `{"lat", "lon", "date": "YYYY-MM-DD"}`, or
//!   `"year"`, the model's decimal year, in place of the date.
//!
//! The planner's own rules, moved here from its Python (#482 phase 0) so
//! the phones and the web answer as it does:
//!
//! - `airspace_column`: the bands over a point (crate::rules, the planner's
//!   AirspaceBand each), from `{"ground_ft"?, "volumes": [{"class", "name"?,
//!   "floor_ft", "floor_ref": "SFC"|"AGL"|"MSL", "ceiling_ft"}],
//!   "in_veil"?}`; `mode_c_veil`: `{"ident", "name", "distance_nm"}` or
//!   null, from `{"lat", "lon", "airports": [{"ident", "name"?, "lat"?,
//!   "lon"?}]}` (14 CFR 91.215(b)(2));
//! - `notams_fns`: an FNS message's NOTAMs, from `{"text"}`; `notam_text`:
//!   a NOTAM as sent, as a list of one, or null, from `{"text"}`;
//!   `metar_read` from `{"raw"}`, `taf_read` from `{"raw", "near"}`,
//!   `winds_read` from `{"text", "now"}`, `tfr_detail_read` from
//!   `{"text"}`: the planner's dicts, or null;
//! - `ceiling_ft` (14 CFR 1.1) from `{"layers": [{"cover", "base_ft"?}],
//!   "vert_vis_ft"?}`, null where there is none or it is not known;
//!   `sky_ceiling` from the same, `{"ceiling_ft", "ceiling_unknown"}`,
//!   which tells those apart (a lowest layer sent with no height,
//!   "OVC///"); `report_flight_category` (AC 00-45H, a missing figure no
//!   limit) from `{"ceiling_ft"?, "ceiling_unknown"?, "visibility_sm"?}`,
//!   with an unknown ceiling only what the visibility settles;
//!   `vfr_basic_minimums` (91.155(c), (d)) `{"ceiling_ft", "visibility_sm"}`
//!   from `{}`;
//! - `reserve_min` (91.151(a), 91.167(a)(3)) from `{"ifr"?, "night"?}`;
//!   `isa_temp_c` from `{"altitude_ft"}`, `density_ratio` from
//!   `{"altitude_ft", "oat_c"}`, `density_altitude_ft` from `{"sigma"}`,
//!   `pressure_altitude_ft` from `{"elevation_ft", "altimeter_inhg"}`;
//! - the altitude a flight is planned at (crate::altitude, #482 phase 3):
//!   `legal_cruising_altitudes` (91.159, 91.179(b)) from `{"floor_ft",
//!   "ceiling_ft"?, "magnetic_course_deg", "rule_from_ft"?, "rules"?}`,
//!   `tight_cruising_altitude`, `highest_under_clouds_ft` and
//!   `cloud_clearance_at_ft` (91.155(a)), `altitude_wheel` from
//!   `{"legal_ft", "flown_ft"?}`, `vfr_floors` (91.119) from `{"start",
//!   "end", "breaks_nm", "ground": {"along_nm", "high_ft", "low_ft",
//!   "congested"?}, "obstacles"}`, `ifr_floors` (91.177(a)(2)) from
//!   `{"legs": [{"a", "b", "ground_ft"}], "obstacles"}`,
//!   `ifr_obstacle_radius_nm`, `airway_floor_ft`, `altitude_blocked`
//!   (73.83), `mountainous_at` (Part 95), `select_cruise_altitude` from the
//!   data the planner read, `altitude_anyway` and `no_altitude` from
//!   `{"selection", "between"?, "via"?, "where"?}`;
//! - a pilot's own altitude's cautions (crate::altitude::cautions, #482
//!   phase 1): `own_altitude_caution` (91.119, 91.159, 91.131, 91.155,
//!   71.33, 91.211, 91.177(a), 91.179(b)) `{"from_ident", "to_ident",
//!   "altitude_ft", "reasons"}` or null from `{"selection", "legs":
//!   [{"altitude_ft"}], "between": [from, to], "profile"?}`;
//!   `floor_caution` (91.119) a sentence or null from `{"segment",
//!   "altitude_ft"}`; `oxygen_caution` (91.211(a)) and
//!   `prohibited_caution` (73.83) lists of sentences from
//!   `{"highest_ft"?, "profile"?}` and `{"selection"}`;
//! - the IFR alternate (crate::alternates, 14 CFR 91.169):
//!   `ifr_alternate_destination` and `ifr_alternate_check` from
//!   `{"ident", "approaches": {"any", "precision",
//!   "alternate_minimums_url"?}, "forecast": {"ceiling_ft"?,
//!   "ceiling_unknown"?, "visibility_sm"?, "raw"?} | null}`,
//!   `ifr_alternates_ranked` from `{"checks", "limit"}`;
//!   `is_eastbound` and `lowest_vfr_cruising_altitude` (91.159(a)) from
//!   `{"magnetic_course_deg", "floor_ft"}`, `distance_nm` from `{"lat1",
//!   "lon1", "lat2", "lon2"}`, `region_of` from `{"lat", "lon"}`,
//!   `descent_ft_per_nm` from `{}`;
//! - `words_num`, `words_one`, `words_to_fixed` (`{"n", "digits"?}`),
//!   `words_grouped` from `{"n"}`; `words_alt_ft` and `words_flight_level`
//!   from `{"ft"?}`; `words_ceiling_and_visibility` from `{"ceiling_ft"?,
//!   "visibility_sm"?}` (crate::figures::words);
//! - `gonogo_hazard_window`: "before", "during", "after" or null, from
//!   `{"enter", "leave", "valid_from"?, "valid_to"?, "margin_min"?}`
//!   (seconds since 1970; PASS_MARGIN_MIN where no margin is given).
//!
//! The apps' and the gateway's own copies, moved here (#482 phase 1):
//!
//! - `altitude_limits` `{"lowest_ft", "highest_ft", "class_a_floor_ft",
//!   "flight_levels_from_ft", "step_ft"}` from `{"ifr"?}`;
//!   `altitude_allowed` from `{"ft", "ifr"?}`; `vfr_altitudes` from
//!   `{"from_ft"?}`; `altitude_said` ("5,500 ft", "FL180") from `{"ft"}`
//!   (crate::limits: 71.33, 91.119(c), 91.121, 91.159, 91.179);
//! - `filed_level`, `filed_speed` (`{"tas_kt"}`), `filed_duration`
//!   (`{"minutes"}`), `filed_wake` (`{"max_takeoff_lb"?}`), `filed_zzzz`
//!   (`{"ident"}`), `filed_route` (`{"stops", "airways"?, "departure"?,
//!   "arrival"?}`): FAA Form 7233-4's items (crate::filing);
//! - `planning_figures` `{"turnaround_min", "cruise_reference_ft"}` from
//!   `{}`; `workings_right` from `{"key", "typed", "answer"}` (an E6B's
//!   tolerances, figures::diversion);
//! - `vfr_minimums` (91.155(a)) `{"day", "night"}` or null, from
//!   `{"class", "altitude_ft", "agl_ft"?}`; `drill_decks`, the light gun's
//!   and the minimums' cards, from `{}` (crate::drills);
//! - `ahead_frame` `{"box", "near_box", "lats", "lons"}` from `{"lat",
//!   "lon", "track_deg", "gs_kt", "alt_ft"?, "vs_fpm"?}`, where the data
//!   is wanted; then `alerts_ahead` `{"alerts", "unavailable",
//!   "tfrs_as_of"}` from the same with `"now"`, `"ground_ft"`, the
//!   `"airspace"`, `"special_use"` and `"tfrs"` with their `"polygons"`,
//!   `"near_field"`, `"swath_ground_ft"` and the DOF's `"obstacles"`, a
//!   list null where it was not read (crate::ahead);
//! - `congested_points` `[bool]` from `{"areas": [polygons], "points":
//!   [[lat, lon]], "candidates"?: [[index]]}`, 91.119(b)'s 2,000 ft
//!   (altitude::congested);
//! - `route_position` `{"along_nm", "total_nm", "left_nm", "off_nm",
//!   "on_route", "leg", "leg_fraction", "burnt_gal"}` or null, from
//!   `{"at", "line"? | "points"?, "legs"?}` (motion::along);
//! - `endorsement_records` `{"until", "solo_until", "checks"}` from
//!   `{"held": [{"code", "on", "make_model"?}], "flight_on"?}`;
//!   `inspections_due` from `{"annual_on"?, "elt_on"?, "static_check_on"?,
//!   "transponder_check_on"?, "hundred_hour_at_hours"?, "vor_check"?}`;
//!   `vor_check_limit_deg` from `{"kind"}` (pilot::records: 61.87, 61.93(d),
//!   61.95, 91.171, 91.207, 91.409, 91.411, 91.413).
//!
//! The FAA's data sets on their cycles (crate::cycles):
//!
//! - `data_cycle`: whether an edition is in force on a day, `{"kind",
//!   "cycle_days", "current", "current_ident", "next", "effective",
//!   "expires", "state": "in_force"|"expired"|"not_yet"|"unknown",
//!   "behind"}`, from `{"kind": "airac"|"chart"|"dof", "effective"?:
//!   "YYYY-MM-DD" (the date the edition is named by), "on": "YYYY-MM-DD"}`
//!   (the FAA's 28 and 56 Day Product Schedule; the DOF page).
//!
//! Instrument approaches taught and debriefed (crate::approach, the web's
//! lib/approachDebrief and lib/approachLesson), a drawing the planner's
//! /api/procedure answer as it comes, a track's points `{"t", "lat",
//! "lon", "alt_ft"?}` (t in ms), a debrief the web's ApproachDebrief in
//! snake_case:
//!
//! - `approach_guidance`: "localizer", "gps" or "other", from `{"id"}`
//!   (ARINC 424-18 5.10); `glidepath_ft`: the glidepath's height, ft MSL,
//!   from `{"runway_path": {"lat", "lon", "ft", "deg"}, "nm_out"}`;
//! - `approach_attempts`: `[{"faf", "from", "to"}]` point indices, from
//!   `{"drawing", "points"}`;
//! - `approach_debrief`: one attempt debriefed or null, from `{"drawing",
//!   "points", "attempt"?: {"faf", "from", "to"}, "minimums_ft"?}`;
//! - `approach_find`: the approaches flown, from `{"drawings", "points",
//!   "picked"?, "minimums_ft"?}`; `approach_transition`: the transition's
//!   debrief or null, from `{"drawings", "points", "faf_at", "passed",
//!   "minimums_ft"?}` (the vectors' debrief's figures);
//! - `approach_minimums`: the findings held to the pilot's minimums (14 CFR
//!   91.175(c), (e)), from `{"findings": [{"tone", "text", "minimums"?}],
//!   "lowest_ft"?, "outcome": "landed"|"missed"|"unknown", "minimums_ft"?}`;
//! - `approach_descent_fpm` from `{"gs_kt", "angle_deg"}`,
//!   `approach_rounded_fpm` from `{"fpm"}`, `approach_category` (14 CFR
//!   97.3) "A".."E" or null from `{"vref_kt"?, "vso_kt"?}`,
//!   `approach_minimums_kind` "DA", "MDA" or "DA or MDA" from `{"name"}`,
//!   `approach_fix_name` from `{"ident"}`, `approach_missed_words` from
//!   `{"legs"}`, `approach_brief_frequencies` from `{"frequencies"}`;
//! - `approach_lesson_path`: `[{"lat", "lon"}]` from `{"drawing"}`;
//!   `approach_path_between` from `{"path", "a", "b"}`; `approach_along_nm`
//!   from `{"path", "at"}`;
//! - `approach_brief`: `[{"key", "title", "lines", "focus": {"fix",
//!   "segment"}}]` from `{"drawing", "frequencies"?, "vref_kt"?,
//!   "vso_kt"?}`; `approach_coaching`: `[{"key", "title", "say", "why",
//!   "at", "focus", "altitude_ft"}]` from `{"drawing", "gs_kt"}`;
//!   `approach_profile`: `{"marks": [{"ident", "along_nm", "ft", "faf",
//!   "map"}], "path": {"from": {"nm", "ft"}, "to"}|null}` from
//!   `{"drawing"}`; `approach_quiz`: `[{"key", "prompt", "choices",
//!   "answer", "explain", "focus"}]` from `{"drawing", "gs_kt"}`.
//!
//! A field's weather as the app says it (crate::forecast, the web's
//! lib/map/flightCategory and lib/hourly, the planner's wingtip.glmp) and the
//! traffic list's filters and the registry's airplanes (crate::aircraft,
//! the web's lib/fbo and lib/aircraftChoice, the iPhone's Registered):
//!
//! - `flight_category`: "VFR", "MVFR", "IFR", "LIFR" or null (AIM 7-1-7),
//!   from `{"ceiling_ft"?, "visibility_sm"?}`, no visibility LIFR only
//!   under a 500 ft ceiling and else null;
//! - `ceiling_visibility`: `{"ceiling_ft", "visibility_sm"}`, each null
//!   where none is given, a report's or forecast group's ceiling (14 CFR
//!   1.1) and visibility in statute miles from the groups a host's reader
//!   found, `{"layers"?: [{"cover", "base_ft"?}], "vertical_visibility_ft"?,
//!   "visibility"?: {"value", "unit": "sm"|"m"}, "cavok"?}`;
//! - `field_hours`: a field's weather hour by hour for the airport card,
//!   `[{"at" (ms), "now", "category", "ceiling_ft", "visibility_sm", "sky",
//!   "precip", "wind_dir_true_deg", "wind_speed_kt", "wind_gust_kt",
//!   "at_times", "at_times_gust_kt", "at_times_thunder", "at_times_chance"}]`,
//!   Now from the METAR and each whole hour its TAF covers read from the
//!   TAF's groups in force (AC 00-45H), from `{"metar"?: the planner's
//!   report, "taf"?: the TAF as sent, "now" (ms), "count"?}`.
//!
//! The weather as the planner reads it (crate::forecast::awc and ::route,
//! crate::winds; #482 phase 2), from the products the weather service
//! fetches -- the engine never fetches:
//!
//! - `awc_metars_read`, `awc_tafs_read`, `awc_airsigmets_read`,
//!   `awc_pireps_read`, `awc_gairmets_read` from `{"text"}`, the AWC's
//!   national cache XML: the shapes the weather store keeps;
//!   `weather_held_until` (Unix seconds or null) from `{"product":
//!   "metars"|"tafs"|"airsigmets"|"pireps"|"gairmets", "data", "fetched"}`;
//!   `gairmet_hazards`: `{code: words}` from `{}`;
//! - `taf_window`: `{"periods", "worst": {"ceiling_ft", "ceiling_unknown",
//!   "visibility_sm"}|null, "current", "prevailing"}` from `{"fcsts",
//!   "start", "end"?}`; `tafs_along_route`: `{"min_ceiling_ft",
//!   "min_visibility_sm", "ceiling_unknown_at", "stations"}` from `{"tafs",
//!   "from": [lat, lon], "to", "corridor_nm"?, "start", "end"?}`;
//!   `vfr_not_recommended_reasons` (AIM 7-1-5; 91.155(c), (d)): a list of
//!   reasons from `{"idents", "metars", "forecast"}`;
//! - `sigmets_along_route` from `{"advisories", "from", "to",
//!   "corridor_nm"?, "now"}`; `pireps_along_route` from `{"reports",
//!   "path", "corridor_nm"?, "now"}`; `pireps_in_box` from `{"reports",
//!   "box": [s, w, n, e], "now"}`; `gairmets_along_route` from
//!   `{"advisories", "path", "start", "end"}`;
//! - `freezing_level`: `{"ft", "at_or_below"}` or null, and
//!   `temperature_at` from `{"profile": [[altitude_ft, temp_c]],
//!   "altitude_ft"}`; `wind_at_altitude`: `{"wind_dir_true_deg",
//!   "wind_speed_kt"}` or null (a list of them for `"altitudes"`) from
//!   `{"levels": {altitude_ft: {"wind_dir_true_deg", "wind_speed_kt"}},
//!   "altitude_ft"}`; `forecast_hour`: "06", "12" or "24" from
//!   `{"hours_ahead"?}`;
//! - `field_taf`: the TAF that speaks for a field, its own or the nearest
//!   within 25 nm, `{"index", "nm", "reach_nm"}` (index null for none, nm
//!   null for its own) from `{"ident", "at"?: {"lat", "lon"}, "stations":
//!   [{"icao_id", "lat"?, "lon"?}]}`.
//!
//! The traffic list's filters and the registry's airplanes, as above:
//!
//! - `traffic_kind` (GDL 90 Table 11's emitter categories) from
//!   `{"category"?}`; `emitter_category`, the category's DO-260B name
//!   ("rotorcraft", "glider", ...) or null, from `{"category"?}`; `altitude_band` (14 CFR 71.33(a)) from
//!   `{"altitude_ft"?}`; `operator_of` from `{"callsign"?}`;
//!   `in_emergency` (AIM 6-2-2, 6-3-4, 6-4-2) from `{"squawk"?,
//!   "emergency"?}`; `squawk_meaning`: "hijack", "lost radio",
//!   "emergency" or null, from `{"squawk"?}`;
//! - `field_relation`: `{"around", "inbound", "departing"}`, from
//!   `{"plane": {"lat", "lon", "altitude_ft"?, "track_deg"?,
//!   "vertical_fpm"?}, "field": {"lat", "lon", "elevation_ft"}}`;
//!   `traffic_matches` from `{"plane": {"category"?, "altitude_ft"?,
//!   "callsign"?, "squawk"?, "emergency"?}, "filter": {"kind", "band",
//!   "operator", "emergency"}}`;
//! - `n_number` (14 CFR 47.15(b)) from `{"text"}`; `registered_profile`:
//!   the stock profile's name or null, from `{"manufacturer"?, "model"?,
//!   "year"?}`, the registry's.
//!
//! The nav log and the airplane's performance (crate::navlog, the
//! planner's wingtip.navlog and wingtip.performance, #482 phase 4), the
//! air each leg is flown in given by the planner -- `air`, one a leg,
//! `[{"variation_deg", "at": [{"altitude_ft", "wind"?, "oat_c"?}]}]` --
//! and the airplane as its profile, `{"cruise_tas_kt", "fuel_burn_gph",
//! "service_ceiling_ft", "cruise_power_pct"?, "climb_tas_kt"?, ...}`:
//!
//! - `performance_reference_ft`, `performance_cruise` from `{"profile",
//!   "altitude_ft", "oat_c"?}`, `performance_climb` from `{"profile",
//!   "from_ft", "to_ft", "isa_dev_c"?}`;
//! - `navlog_leg` from `{"start", "end", "altitude_ft", "profile",
//!   "wind"?, "oat_c"?, "variation_deg"}`; `navlog_legs` from `{"fixes",
//!   "altitude_ft", "profile", "air"}`; `navlog_with_climbs` from
//!   `{"legs", "start_altitude_ft"?, "profile"}`; `navlog_with_descents`
//!   from `{"legs", "fixes", "end_altitude_ft"?, "end_before_nm"?,
//!   "end_fix"?}`, the end an approach gives as `navlog_approach_end` from
//!   `{"fixes", "cruise_ft"?, "field"}`; `navlog_totals` from `{"legs"}`; `navlog_fuel_plan`
//!   (14 CFR 91.151, 91.167) from `{"total_fuel_gal"?, "profile",
//!   "night"?, "rules"?, "alternate_gal"?}`; `navlog_alternate_leg` from
//!   `{"dest", "alternate", "altitude_ft", "profile", "air"?}`;
//! - `navlog_candidates` from `{"segments", "legs", "profile"}`,
//!   `navlog_plans` from `{"fixes", "segments", "profile",
//!   "departure_elevation_ft"?, "air"}` and `navlog_legs_at` with
//!   `"target_ft"`; `navlog_join_plans` and `navlog_join_figures` from
//!   `{"by_hop", "lengths"}`;
//! - `navlog_hold` (AIM 5-3-8) from `{"leg", "before"?, "hold", "fix",
//!   "variation_deg", "at_end"?}`; `navlog_racetrack` from `{"fix",
//!   "inbound_true_deg", "right"?, "tas_kt", "leg_nm", "steps"?}`.
//!
//! `?` marks a member that may be missing or null. A name not known, or
//! input not of its shape, is Err with a plain message, never a panic.

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

/// A ChecklistDto's sections, `{"checklist": {"sections": [...]}}`.
fn checklist_sections(ask: &Ask) -> Result<Vec<checklist::Section>, String> {
    let bad = || "checklist_write: \"checklist\" is not {\"sections\": [{\"title\", \"items\": [{\"challenge\", \"response\"}]}]}".to_owned();
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
    let ask = json::parse(input)?;
    if !matches!(ask, Value::Object(_)) {
        return Err(format!("{name}: the input is not a JSON object"));
    }
    let ask = Ask { name, v: &ask };
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
                    Ok(strip::TankPoint { departure: flag("departure"), fuel_gal: opt_num_in(name, p, "fuel_gal")?, refuel: flag("refuel") })
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
            let (minutes, trip, required) = strip::estimate(ask.num("distance_nm")?, ask.opt_num("cruise_tas_kt")?, ask.opt_num("fuel_burn_gph")?);
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
            let mut out = String::from("{\"days\":");
            json::opt_number(&mut out, days.map(|d| d as f64));
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
                    let code = e.get("code").and_then(Value::as_str).ok_or("endorsements_in_force: an endorsement's \"code\" is missing")?;
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
        "readback_check" => Ok(crate::readback::check_json(ask.str("cleared")?, ask.str("said")?)),
        // Runways, the wind on them and the traffic pattern (runway::calls).
        "wind_components" | "wind_steady_or_gust" | "runway_crosswind" | "wind_calm" | "runway_calm" | "runway_end_heading"
        | "runway_favoured_end" | "runway_with_winds" | "wind_pick" | "runway_end_key" | "faa_ids" | "pattern_side" | "compass_word"
        | "pattern_entry" | "pattern_exit" | "pattern_altitude" | "runway_ends_traffic" | "runway_end_fit" | "traffic_pattern"
        | "departure_pattern" | "arrival_circuit" | "departure_circuit" => {
            crate::runway::calls::call(name, ask.v).unwrap_or_else(|| Err(format!("the engine has no rule called {name:?}")))
        }
        "weather_expires_at" | "weather_in_force" => weather_validity_rule(&ask),
        "airspace_column" => crate::rules::column_json(ask.v),
        "mode_c_veil" => crate::rules::veil_json(ask.v),
        "notams_fns" | "notam_text" | "metar_read" | "taf_read" | "winds_read" | "tfr_detail_read" | "ceiling_ft"
        | "sky_ceiling" | "report_flight_category" | "vfr_basic_minimums" | "vfr_not_recommended_reasons" => weather_rule(&ask),
        "reserve_min" | "isa_temp_c" | "density_ratio" | "density_altitude_ft" | "pressure_altitude_ft" | "is_eastbound"
        | "lowest_vfr_cruising_altitude" | "distance_nm" | "region_of" | "descent_ft_per_nm" | "wind_correction_deg"
        | "groundspeed_kt" => flight_rule(&ask),
        "words_num" | "words_one" | "words_to_fixed" | "words_grouped" | "words_alt_ft" | "words_flight_level"
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
        "magnetic_variation" => {
            // The model's time, a decimal year: as given (the planner's
            // test against pygeomag asks at any instant), else the day's.
            let decimal = match ask.opt_num("year")? {
                Some(year) => year,
                None => {
                    let date = ask.str("date")?;
                    let bad = || format!("magnetic_variation: \"date\" is not YYYY-MM-DD: {date:?}");
                    let mut parts = date.splitn(3, '-').map(|p| p.parse::<i64>().map_err(|_| bad()));
                    let (year, month, day) = (parts.next().ok_or_else(bad)??, parts.next().ok_or_else(bad)??, parts.next().ok_or_else(bad)??);
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
            let kind = crate::cycles::Kind::from_name(kind).ok_or_else(|| format!("data_cycle: \"kind\" is not airac, chart or dof: {kind:?}"))?;
            let on = ask.str("on")?;
            let on = crate::cycles::day_of(on).ok_or_else(|| format!("data_cycle: \"on\" is not YYYY-MM-DD: {on:?}"))?;
            let effective = match ask.opt_str("effective")? {
                "" => None,
                e => Some(crate::cycles::day_of(e).ok_or_else(|| format!("data_cycle: \"effective\" is not YYYY-MM-DD: {e:?}"))?),
            };
            Ok(crate::cycles::to_json(&crate::cycles::cycle(kind, effective, on)))
        }
        _ if crate::drills::NAMES.contains(&name) => crate::drills::call(name, ask.v),
        // What is ahead of own ship from the planner's data (ahead.rs).
        _ if crate::ahead::NAMES.contains(&name) => crate::ahead::call(name, ask.v),
        _ if crate::pilot::records::NAMES.contains(&name) => crate::pilot::records::call(name, ask.v),
        _ if crate::wording::NAMES.contains(&name) => crate::wording::answer(name, ask.v),
        // A field's weather (forecast::calls), the traffic list's filters and
        // the registry's airplanes (aircraft::calls).
        _ if crate::forecast::calls::NAMES.contains(&name) => crate::forecast::calls::call(name, ask.v),
        _ if crate::altitude::calls::NAMES.contains(&name) => crate::altitude::calls::call(name, ask.v),
        _ if crate::aircraft::calls::NAMES.contains(&name) => crate::aircraft::calls::call(name, ask.v),
        // Instrument approaches taught and debriefed (approach::calls).
        _ if crate::approach::calls::NAMES.contains(&name) => crate::approach::calls::call(name, ask.v),
        // The IFR alternate, 14 CFR 91.169 (alternates).
        _ if crate::alternates::NAMES.contains(&name) => crate::alternates::call(name, ask.v),
        _ if crate::route::answers::NAMES.contains(&name) => crate::route::answers::answer(name, ask.v),
        _ if crate::navlog::calls::NAMES.contains(&name) => crate::navlog::calls::call(name, ask.v),
        // Route options, the way round high ground and a point named off a
        // fix (route::options).
        _ if crate::route::options::NAMES.contains(&name) => crate::route::options::call(name, ask.v),
        // The things that move (motion::call), then the Go / No-Go's, by
        // their own names (gonogo::calls), last.
        _ => match crate::motion::call(name, ask.v) {
            Some(answer) => answer,
            None => crate::gonogo::calls::call(name, ask.v).unwrap_or_else(|| Err(format!("the engine has no rule called {name:?}"))),
        },
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

/// A report, a NOTAM or a TFR as sent, read (crate::metar, taf, winds,
/// notam, tfr), each answer the planner's own dicts; and the figures read
/// off a report: its ceiling, its flight category and the basic VFR
/// minimums they are held to.
fn weather_rule(ask: &Ask) -> Result<String, String> {
    let read = |found: Option<String>| found.unwrap_or_else(|| "null".to_owned());
    // Whole seconds, as the reports' own times are.
    let secs = |key: &str| ask.num(key).map(|s| s.floor() as i64);
    match ask.name {
        "notams_fns" => Ok(crate::notam::to_json(&crate::notam::from_fns(ask.str("text")?))),
        "notam_text" => Ok(read(crate::notam::from_text(ask.str("text")?).map(|n| crate::notam::to_json(&[n])))),
        "metar_read" => Ok(read(crate::metar::parse(ask.str("raw")?).map(|m| crate::metar::to_json(&m)))),
        "taf_read" => Ok(read(crate::taf::parse(ask.str("raw")?, secs("near")?).map(|t| crate::taf::to_json(&t)))),
        "winds_read" => Ok(read(crate::winds::parse(ask.str("text")?, secs("now")?).map(|p| crate::winds::to_json(&p)))),
        "tfr_detail_read" => {
            let text = ask.str("text")?;
            if let Err(e) = crate::xml::parse(text) {
                return Err(format!("tfr_detail_read: not XML: {} at {}", e.what, e.at));
            }
            Ok(read(crate::tfr::parse_detail(text).map(|d| crate::tfr::to_json(&d))))
        }
        "ceiling_ft" | "sky_ceiling" => {
            let mut layers = Vec::new();
            if let Some(listed) = ask.v.get("layers").filter(|l| !matches!(l, Value::Null)) {
                for l in listed.as_array().ok_or_else(|| format!("{}: \"layers\" is not a list", ask.name))? {
                    layers.push((l.get("cover").and_then(Value::as_str).unwrap_or(""), opt_num_in(ask.name, l, "base_ft")?));
                }
            }
            let (ceiling, unknown) = crate::metar::sky_ceiling_of(layers, ask.opt_num("vert_vis_ft")?);
            let mut out = String::new();
            if ask.name == "ceiling_ft" {
                json::opt_number(&mut out, ceiling);
            } else {
                out.push_str("{\"ceiling_ft\":");
                json::opt_number(&mut out, ceiling);
                out.push_str(",\"ceiling_unknown\":");
                out.push_str(if unknown { "true" } else { "false" });
                out.push('}');
            }
            Ok(out)
        }
        "report_flight_category" => {
            let mut out = String::new();
            let category = crate::metar::flight_category_of(
                ask.opt_num("ceiling_ft")?,
                ask.opt_bool("ceiling_unknown")?,
                ask.opt_num("visibility_sm")?,
            );
            json::opt_string(&mut out, category);
            Ok(out)
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

/// The flight's figures (crate::flight, geo, phone, motion) as the
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
        "distance_nm" => crate::geo::distance_nm(ask.num("lat1")?, ask.num("lon1")?, ask.num("lat2")?, ask.num("lon2")?),
        "descent_ft_per_nm" => crate::motion::profile::DESCENT_FT_PER_NM,
        "is_eastbound" => return Ok(flight::is_eastbound(ask.num("magnetic_course_deg")?).to_string()),
        "wind_correction_deg" => flight::wind_correction_deg(ask.num("true_course_deg")?, ask.num("wind_from_deg")?, ask.num("wind_kt")?, ask.num("tas_kt")?),
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
            let said = if limits::is_flight_level(ft) {
                format!("FL{}", (ft / 100.0).round())
            } else {
                crate::figures::words::feet(ft)
            };
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
                    Some(Value::Array(list)) => list.iter().map(|w| w.as_str().ok_or_else(|| format!("filed_route: \"{key}\" is not a list of strings"))).collect(),
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
            stops: p.get("stops").and_then(Value::as_array).map(|s| s.iter().filter_map(|v| v.as_str().map(str::to_owned)).collect()).unwrap_or_default(),
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
        Some(w @ Value::Object(_)) => (
            opt_num_in("diversion", w, "wind_dir_true_deg")?.unwrap_or(0.0),
            opt_num_in("diversion", w, "wind_speed_kt")?.unwrap_or(0.0),
        ),
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
