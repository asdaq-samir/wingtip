//! The picture as JSON, both ways: written for the host, which hands it
//! back with the next bytes (the contract's ReceiverPicture), and read
//! from what the host handed back. A picture the host could not hand back
//! (the first read, or one it dropped) is an empty one.

use crate::fisb::Text;
use crate::nexrad::Block;
use crate::picture::{Heard, KeptBlock, KeptText, Ownship, Picture, Receiver};
use crate::report::{self, Report};
use wingtip_core::json::{self, Value};

/// A JSON object written member by member.
struct Obj<'a>(&'a mut String, bool);

impl<'a> Obj<'a> {
    fn new(out: &'a mut String) -> Self {
        out.push('{');
        Obj(out, false)
    }
    fn key(&mut self, k: &str) -> &mut String {
        if self.1 {
            self.0.push(',');
        }
        self.1 = true;
        json::string(self.0, k);
        self.0.push(':');
        self.0
    }
    fn num(&mut self, k: &str, v: f64) {
        json::number(self.key(k), v);
    }
    fn opt(&mut self, k: &str, v: Option<f64>) {
        json::opt_number(self.key(k), v);
    }
    fn str(&mut self, k: &str, v: Option<&str>) {
        json::opt_string(self.key(k), v);
    }
    fn bool(&mut self, k: &str, v: bool) {
        self.key(k).push_str(if v { "true" } else { "false" });
    }
    fn end(self) {
        self.0.push('}');
    }
}

fn report(o: &mut Obj, r: &Report, at: f64) {
    o.str("hex", Some(&report::hex(r.address_type, r.address)));
    o.num("address", r.address as f64);
    o.num("address_type", r.address_type as f64);
    o.str("source", Some(report::source(r.address_type)));
    o.str("callsign", r.callsign.as_deref());
    o.num("lat", r.lat);
    o.num("lon", r.lon);
    o.opt("pressure_ft", r.pressure_ft);
    o.bool("airborne", r.airborne);
    o.bool("extrapolated", r.extrapolated);
    o.opt("track_deg", r.track_deg);
    o.str("track_kind", Some(r.track_kind));
    o.opt("speed_kt", r.speed_kt);
    o.opt("vertical_fpm", r.vertical_fpm);
    o.num("emitter", r.emitter as f64);
    o.str("category", report::category(r.emitter).as_deref());
    o.num("emergency", r.emergency as f64);
    o.num("nic", r.nic as f64);
    o.num("nacp", r.nacp as f64);
    o.bool("alert", r.alert);
    o.num("at", at);
}

fn list<T>(out: &mut String, items: &[T], each: impl Fn(&mut Obj, &T)) {
    out.push('[');
    for (i, item) in items.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        let mut o = Obj::new(out);
        each(&mut o, item);
        o.end();
    }
    out.push(']');
}

/// The picture as the contract's ReceiverPicture, `at` deciding whether
/// the receiver is heard.
pub fn write(p: &Picture, at: f64) -> String {
    let mut out = String::new();
    let mut o = Obj::new(&mut out);
    {
        let r = &p.receiver;
        let mut x = Obj::new(o.key("receiver"));
        x.str("name", r.name.as_deref());
        x.str("long_name", r.long_name.as_deref());
        x.bool("stratux", r.stratux);
        x.opt("heartbeat_at", r.heartbeat_at);
        x.bool("live", p.live(at));
        x.str("summary", Some(&p.summary(at)));
        x.bool("gps", r.gps);
        x.bool("utc_ok", r.utc_ok);
        x.bool("battery_low", r.battery_low);
        x.bool("maintenance", r.maintenance);
        x.bool("msl", r.msl);
        x.num("frames", r.frames);
        x.num("bad_frames", r.bad_frames);
        x.opt("station_lat", r.station.map(|s| s.0));
        x.opt("station_lon", r.station.map(|s| s.1));
        x.opt("station_at", r.station_at);
        x.end();
    }
    match &p.ownship {
        None => o.key("ownship").push_str("null"),
        Some(own) => {
            let mut x = Obj::new(o.key("ownship"));
            report(&mut x, &own.heard.report, own.heard.at);
            x.opt("geometric_ft", own.geometric_ft);
            x.opt("vfom_m", own.vfom_m);
            x.end();
        }
    }
    list(o.key("targets"), &p.targets, |x, t| report(x, &t.report, t.at));
    list(o.key("texts"), &p.texts, |x, k| {
        let t = &k.text;
        x.num("product", t.product as f64);
        x.str("kind", Some(&t.kind));
        x.str("location", t.location.as_deref());
        x.opt("number", t.number.map(|n| n as f64));
        x.str("text", Some(&t.text));
        x.str("time", Some(&t.time));
        x.num("at", k.at);
    });
    list(o.key("nexrad"), &p.blocks, |x, k| {
        let b = &k.block;
        x.num("id", b.id as f64);
        x.bool("regional", k.regional);
        x.num("north", b.north);
        x.num("west", b.west);
        x.num("south", b.south);
        x.num("east", b.east);
        let bins: String = b.bins.iter().map(|&l| (b'0' + l) as char).collect();
        x.str("bins", Some(&bins));
        x.str("time", Some(&k.time));
        x.num("at", k.at);
    });
    o.end();
    out
}

fn num(v: &Value, k: &str) -> Option<f64> {
    v.get(k).and_then(Value::as_f64)
}
fn text(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(Value::as_str).map(str::to_owned)
}
fn flag(v: &Value, k: &str) -> bool {
    matches!(v.get(k), Some(Value::Bool(true)))
}
fn items<'a>(v: &'a Value, k: &str) -> &'a [Value] {
    v.get(k).and_then(Value::as_array).unwrap_or(&[])
}

fn read_report(v: &Value) -> Option<Heard> {
    let kind = match v.get("track_kind").and_then(Value::as_str) {
        Some("magnetic") => "magnetic",
        Some("heading") => "heading",
        _ => "track",
    };
    let report = Report {
        alert: flag(v, "alert"),
        address_type: num(v, "address_type")? as u8,
        address: num(v, "address")? as u32,
        lat: num(v, "lat")?,
        lon: num(v, "lon")?,
        pressure_ft: num(v, "pressure_ft"),
        airborne: flag(v, "airborne"),
        extrapolated: flag(v, "extrapolated"),
        track_deg: num(v, "track_deg"),
        track_kind: kind,
        nic: num(v, "nic").unwrap_or(0.0) as u8,
        nacp: num(v, "nacp").unwrap_or(0.0) as u8,
        speed_kt: num(v, "speed_kt"),
        vertical_fpm: num(v, "vertical_fpm"),
        emitter: num(v, "emitter").unwrap_or(0.0) as u8,
        callsign: text(v, "callsign"),
        emergency: num(v, "emergency").unwrap_or(0.0) as u8,
    };
    Some(Heard { report, at: num(v, "at")? })
}

/// A picture handed back; an empty one for null or nothing.
pub fn read(v: Option<&Value>) -> Picture {
    let Some(v) = v.filter(|v| !matches!(v, Value::Null)) else { return Picture::default() };
    let r = v.get("receiver").unwrap_or(&Value::Null);
    let receiver = Receiver {
        name: text(r, "name"),
        long_name: text(r, "long_name"),
        stratux: flag(r, "stratux"),
        heartbeat_at: num(r, "heartbeat_at"),
        gps: flag(r, "gps"),
        utc_ok: flag(r, "utc_ok"),
        battery_low: flag(r, "battery_low"),
        maintenance: flag(r, "maintenance"),
        msl: flag(r, "msl"),
        frames: num(r, "frames").unwrap_or(0.0),
        bad_frames: num(r, "bad_frames").unwrap_or(0.0),
        station: num(r, "station_lat").zip(num(r, "station_lon")),
        station_at: num(r, "station_at"),
    };
    let ownship = v
        .get("ownship")
        .and_then(|o| Some(Ownship { heard: read_report(o)?, geometric_ft: num(o, "geometric_ft"), vfom_m: num(o, "vfom_m") }));
    let targets = items(v, "targets").iter().filter_map(read_report).collect();
    let texts = items(v, "texts")
        .iter()
        .filter_map(|t| {
            let text = Text {
                product: num(t, "product")? as u16,
                kind: text(t, "kind")?,
                location: text(t, "location"),
                number: num(t, "number").map(|n| n as u32),
                text: text(t, "text")?,
                cancelled: false,
                time: text(t, "time").unwrap_or_default(),
            };
            Some(KeptText { text, at: num(t, "at")? })
        })
        .collect();
    let blocks = items(v, "nexrad")
        .iter()
        .filter_map(|b| {
            let bins: Vec<u8> = text(b, "bins")?.bytes().map(|c| c.wrapping_sub(b'0').min(7)).collect();
            (bins.len() == crate::nexrad::BINS).then_some(())?;
            let block = Block {
                id: num(b, "id")? as u32,
                north: num(b, "north")?,
                west: num(b, "west")?,
                south: num(b, "south")?,
                east: num(b, "east")?,
                bins,
            };
            Some(KeptBlock { block, regional: flag(b, "regional"), time: text(b, "time").unwrap_or_default(), at: num(b, "at")? })
        })
        .collect();
    Picture { receiver, ownship, targets, texts, blocks }
}
