use super::*;

impl Clearance {
    /// The words of each run of places, in order, for them to be found.
    pub fn place_runs(&self) -> Vec<&str> {
        self.route.iter().filter_map(|i| if let Item::Places(s) = i { Some(s.as_str()) } else { None }).collect()
    }

    /// The clearance as the web app's Clearance is written (its field
    /// names), JSON.
    pub fn to_json(&self) -> String {
        let mut o = String::from("{\"limit\":");
        json::opt_string(&mut o, self.limit.as_deref());
        o.push_str(",\"route\":[");
        for (k, item) in self.route.iter().enumerate() {
            if k > 0 {
                o.push(',');
            }
            match item {
                Item::Vectors => o.push_str("{\"kind\":\"vectors\"}"),
                Item::Heading(d) => o.push_str(&format!("{{\"kind\":\"heading\",\"degrees\":{d}}}")),
                Item::Airway(a) => {
                    o.push_str("{\"kind\":\"airway\",\"ident\":");
                    json::string(&mut o, a);
                    o.push('}');
                }
                Item::Places(s) => {
                    o.push_str("{\"kind\":\"places\",\"said\":");
                    json::string(&mut o, s);
                    o.push('}');
                }
                Item::Procedure { kind, name, number, transition } => {
                    o.push_str(&format!("{{\"kind\":\"{kind}\",\"name\":"));
                    json::string(&mut o, name);
                    o.push_str(",\"number\":");
                    json::string(&mut o, number);
                    o.push_str(",\"transition\":");
                    json::opt_string(&mut o, transition.as_deref());
                    o.push('}');
                }
            }
        }
        o.push_str("],\"asFiled\":");
        o.push_str(if self.as_filed { "true" } else { "false" });
        let int = |o: &mut String, v: Option<i64>| match v {
            Some(v) => o.push_str(&v.to_string()),
            None => o.push_str("null"),
        };
        o.push_str(",\"maintainFt\":");
        int(&mut o, self.maintain_ft);
        o.push_str(",\"maintainLimit\":");
        json::opt_string(&mut o, self.maintain_limit.as_deref());
        o.push_str(",\"vfr\":");
        o.push_str(if self.vfr { "true" } else { "false" });
        o.push_str(",\"expectFt\":");
        int(&mut o, self.expect_ft);
        o.push_str(",\"expectMin\":");
        int(&mut o, self.expect_min);
        o.push_str(",\"frequency\":");
        json::opt_string(&mut o, self.frequency.as_deref());
        o.push_str(",\"facility\":");
        json::opt_string(&mut o, self.facility.as_deref());
        o.push_str(",\"squawk\":");
        json::opt_string(&mut o, self.squawk.as_deref());
        o.push_str(",\"classB\":");
        o.push_str(if self.class_b { "true" } else { "false" });
        o.push('}');
        o
    }
}

/// Two idents one field: "KDLH" and "DLH" (the web's sameField).
pub fn same_field(a: &str, b: &str) -> bool {
    fn bare(s: &str) -> String {
        let s = s.trim().to_uppercase();
        if s.len() == 4 && s.starts_with('K') && s[1..].bytes().all(|c| c.is_ascii_alphanumeric()) {
            s[1..].to_owned()
        } else {
            s
        }
    }
    bare(a) == bare(b)
}

pub(super) fn is_airway(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 2 && b.len() <= 5 && matches!(b[0], b'V' | b'T' | b'J' | b'Q') && b[1..].iter().all(u8::is_ascii_digit)
}
