//! An instruction's items as the apps take them (`atc_call`'s `items`).

use super::Item;

/// The items as the apps take them: `[{"kind", ...}]`, snake_case.
pub fn items_json(items: &[Item]) -> String {
    use crate::json;
    let mut o = String::from("[");
    for (n, item) in items.iter().enumerate() {
        if n > 0 {
            o.push(',');
        }
        o.push_str("{\"kind\":");
        json::string(&mut o, item.kind());
        let int = |o: &mut String, key: &str, v: Option<i64>| {
            o.push_str(&format!(",\"{key}\":"));
            match v {
                Some(v) => o.push_str(&v.to_string()),
                None => o.push_str("null"),
            }
        };
        let text = |o: &mut String, key: &str, v: Option<&str>| {
            o.push_str(&format!(",\"{key}\":"));
            json::opt_string(o, v);
        };
        match item {
            Item::Altitude { ft, verb, limit } => {
                int(&mut o, "ft", Some(*ft));
                text(&mut o, "verb", Some(verb));
                text(&mut o, "limit", limit.as_deref());
            }
            Item::Expect { ft, min } => {
                int(&mut o, "ft", Some(*ft));
                int(&mut o, "min", *min);
            }
            Item::Heading { deg, turn, by_deg } => {
                int(&mut o, "deg", *deg);
                text(&mut o, "turn", *turn);
                int(&mut o, "by_deg", *by_deg);
            }
            Item::Direct { said } => text(&mut o, "said", Some(said)),
            Item::Route { limit, places, as_filed } => {
                text(&mut o, "limit", limit.as_deref());
                o.push_str(",\"places\":[");
                for (k, p) in places.iter().enumerate() {
                    if k > 0 {
                        o.push(',');
                    }
                    json::string(&mut o, p);
                }
                o.push_str("],\"as_filed\":");
                o.push_str(if *as_filed { "true" } else { "false" });
            }
            Item::ClassB => {}
            Item::Hold { fix, direction, on, turns, published, efc } => {
                text(&mut o, "fix", Some(fix));
                text(&mut o, "direction", direction.as_deref());
                text(&mut o, "on", on.map(|(what, _)| what));
                int(&mut o, "on_deg", on.map(|(_, d)| d));
                text(&mut o, "turns", *turns);
                o.push_str(",\"published\":");
                o.push_str(if *published { "true" } else { "false" });
                text(&mut o, "efc", efc.as_deref());
            }
            Item::Frequency { mhz, facility } => {
                text(&mut o, "mhz", Some(mhz));
                text(&mut o, "facility", facility.as_deref());
            }
            Item::Squawk { code } => text(&mut o, "code", Some(code)),
            Item::Altimeter { inhg } => text(&mut o, "inhg", Some(inhg)),
            Item::Approach { name, runway, cleared } => {
                text(&mut o, "name", Some(name));
                text(&mut o, "runway", runway.as_deref());
                o.push_str(",\"cleared\":");
                o.push_str(if *cleared { "true" } else { "false" });
            }
            Item::Runway { runway, what } => {
                text(&mut o, "runway", Some(runway));
                text(&mut o, "what", *what);
            }
        }
        o.push('}');
    }
    o.push(']');
    o
}
