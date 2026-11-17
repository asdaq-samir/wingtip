use super::*;

/// A number written whole where it is one: 10, not 10.0, as the fixture
/// has it and the web's JSON.parse reads it either way.
pub(super) fn figure(out: &mut String, v: f64) {
    if v.fract() == 0.0 && v.abs() < 1e15 {
        out.push_str(&format!("{}", v as i64));
    } else {
        json::number(out, v);
    }
}

pub(super) fn opt_int(out: &mut String, v: Option<i64>) {
    match v {
        Some(v) => out.push_str(&v.to_string()),
        None => out.push_str("null"),
    }
}

pub(crate) fn strings(out: &mut String, items: &[String]) {
    out.push('[');
    for (k, s) in items.iter().enumerate() {
        if k > 0 {
            out.push(',');
        }
        json::string(out, s);
    }
    out.push(']');
}

impl Atis {
    /// The reading as the rule `read_atis` answers it: `{information,
    /// time_z, wind: {from_deg, kt, gust_kt, variable}|null,
    /// visibility_sm, sky: [{cover, base_ft}], temp_c, dewpoint_c,
    /// altimeter_inhg, approach, runways: {landing, departing}, remarks,
    /// raw}`, a figure not heard null.
    pub fn to_json(&self) -> String {
        let mut o = String::from("{\"information\":");
        json::opt_string(&mut o, self.information.map(String::from).as_deref());
        o.push_str(",\"time_z\":");
        json::opt_string(&mut o, self.time_z.as_deref());
        o.push_str(",\"wind\":");
        match &self.wind {
            None => o.push_str("null"),
            Some(w) => {
                o.push_str("{\"from_deg\":");
                opt_int(&mut o, w.from_deg);
                o.push_str(",\"kt\":");
                opt_int(&mut o, w.kt);
                o.push_str(",\"gust_kt\":");
                opt_int(&mut o, w.gust_kt);
                o.push_str(&format!(",\"variable\":{}}}", w.variable));
            }
        }
        o.push_str(",\"visibility_sm\":");
        match self.visibility_sm {
            Some(v) => figure(&mut o, v),
            None => o.push_str("null"),
        }
        o.push_str(",\"sky\":[");
        for (k, l) in self.sky.iter().enumerate() {
            if k > 0 {
                o.push(',');
            }
            o.push_str(&format!("{{\"cover\":\"{}\",\"base_ft\":", l.cover));
            opt_int(&mut o, l.base_ft);
            o.push('}');
        }
        o.push_str("],\"temp_c\":");
        opt_int(&mut o, self.temp_c);
        o.push_str(",\"dewpoint_c\":");
        opt_int(&mut o, self.dewpoint_c);
        o.push_str(",\"altimeter_inhg\":");
        match self.altimeter_inhg {
            Some(v) => json::number(&mut o, v),
            None => o.push_str("null"),
        }
        o.push_str(",\"approach\":");
        json::opt_string(&mut o, self.approach.as_deref());
        o.push_str(",\"runways\":{\"landing\":");
        strings(&mut o, &self.landing);
        o.push_str(",\"departing\":");
        strings(&mut o, &self.departing);
        o.push_str("},\"remarks\":");
        strings(&mut o, &self.remarks);
        o.push_str(",\"raw\":");
        json::string(&mut o, &self.raw);
        o.push('}');
        o
    }
}
