//! What a receiver has told the app so far, carried from one read to the
//! next by the host (the engine keeps nothing between calls and has no
//! clock: the host gives the time the bytes came): the receiver's own
//! state, own ship, the traffic it hears and the FIS-B products it was
//! sent, each dropped once it is no longer being heard.

use crate::fisb::{self, Product, Text};
use crate::frame::{self, Frame};
use crate::message::{self, Message};
use crate::nexrad::Block;
use crate::report::{self, Report};
use crate::uplink;

/// No Heartbeat for this long, s, and the receiver is not heard: it sends
/// one a second (GDL 90 Data Interface Specification, 3.1), so five missed
/// is the link gone, not a datagram lost.
pub const LIVE_S: f64 = 5.0;
/// A target not reported for this long, s, is dropped. AIM 4-5-8: TIS-B
/// updates "approximately once every 3-13 seconds" with the radar, ADS-B
/// "nominally once per second" (4-5-7), so 20 s is more than one TIS-B
/// update missed. A design choice, under the internet traffic's 30 s
/// (Traffic.staleS) as a receiver's reports are its own, not relayed.
pub const TARGET_HOLD_S: f64 = 20.0;
/// How long a NEXRAD block is drawn after it was last sent, s: four of the
/// regional product's 2.5-minute transmission intervals and two of the
/// CONUS product's 15 (AIM 4-5-9, TBL 4-5-9), so a block is gone once the
/// station has stopped sending it, not when one uplink is missed.
pub const REGIONAL_HOLD_S: f64 = 4.0 * 150.0;
pub const CONUS_HOLD_S: f64 = 2.0 * 900.0;

/// How long a text product is kept after it was last sent, s. While a
/// station is in range it sends each again every 5 or 10 minutes (TBL
/// 4-5-9); out of range, the last one heard is kept for as long as it can
/// still be of use, and its age is shown with it: a METAR two routine
/// hours (FMH-1's hourly observations; the airport card calls it old
/// after the first, weather::validity), a TAF its longest valid period
/// (30 hours, FAA-H-8083-28B 27.4.1), winds aloft their 12-hour update interval
/// (TBL 4-5-9), a PIREP an hour, and a NOTAM, TFR, AIRMET or SIGMET an
/// hour -- a cancelled one goes at once. Design choices, all of them
/// erring toward showing an old product, marked old, over showing none.
pub fn text_hold_s(kind: &str) -> f64 {
    match kind {
        "METAR" | "SPECI" => 2.0 * 3600.0,
        "TAF" => 30.0 * 3600.0,
        "WINDS" => 12.0 * 3600.0,
        _ => 3600.0,
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Receiver {
    /// The name its ID message gives ("Stratux", "Sentry", "SkyEcho").
    pub name: Option<String>,
    pub long_name: Option<String>,
    /// It sent Stratux's own messages.
    pub stratux: bool,
    pub heartbeat_at: Option<f64>,
    pub gps: bool,
    pub utc_ok: bool,
    pub battery_low: bool,
    pub maintenance: bool,
    /// Its GPS heights are above mean sea level, not the ellipsoid.
    pub msl: bool,
    pub frames: f64,
    pub bad_frames: f64,
    /// The last FIS-B ground station heard, and when.
    pub station: Option<(f64, f64)>,
    pub station_at: Option<f64>,
}

/// A report kept, with when it was heard.
#[derive(Clone, Debug, PartialEq)]
pub struct Heard {
    pub report: Report,
    pub at: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Ownship {
    pub heard: Heard,
    /// The GPS height (ID 11), ft, its datum `Receiver::msl`'s.
    pub geometric_ft: Option<f64>,
    pub vfom_m: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct KeptText {
    pub text: Text,
    pub at: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct KeptBlock {
    pub block: Block,
    pub regional: bool,
    pub time: String,
    pub at: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Picture {
    pub receiver: Receiver,
    pub ownship: Option<Ownship>,
    pub targets: Vec<Heard>,
    pub texts: Vec<KeptText>,
    pub blocks: Vec<KeptBlock>,
}

impl Picture {
    /// Whether the receiver is heard at `at`.
    pub fn live(&self, at: f64) -> bool {
        self.receiver.heartbeat_at.is_some_and(|t| at - t <= LIVE_S)
    }

    /// The bytes received at `at` read into the picture, and what is no
    /// longer heard dropped.
    pub fn read(&mut self, bytes: &[u8], at: f64) {
        for f in frame::frames(bytes) {
            match f {
                Frame::Message(m) => {
                    self.receiver.frames += 1.0;
                    self.take(message::read(&m), at);
                }
                Frame::BadCheck => self.receiver.bad_frames += 1.0,
            }
        }
        self.age(at);
    }

    fn take(&mut self, m: Message, at: f64) {
        let r = &mut self.receiver;
        match m {
            Message::Heartbeat(h) => {
                r.heartbeat_at = Some(at);
                (r.gps, r.utc_ok, r.battery_low, r.maintenance) = (h.gps_valid, h.utc_ok, h.battery_low, h.maintenance);
            }
            Message::Identity(i) => {
                r.name = (!i.name.is_empty()).then_some(i.name);
                r.long_name = (!i.long_name.is_empty()).then_some(i.long_name);
                r.msl = i.msl;
            }
            Message::Stratux => r.stratux = true,
            Message::Ownship(report) => {
                // With no fix a receiver sends own ship at 0, 0 with NIC 0.
                if report.nic == 0 && report.lat == 0.0 && report.lon == 0.0 {
                    self.ownship = None;
                    return;
                }
                let (geometric_ft, vfom_m) = self.ownship.as_ref().map_or((None, None), |o| (o.geometric_ft, o.vfom_m));
                self.ownship = Some(Ownship { heard: Heard { report, at }, geometric_ft, vfom_m });
            }
            Message::Geometric(g) => {
                if let Some(o) = &mut self.ownship {
                    (o.geometric_ft, o.vfom_m) = (Some(g.altitude_ft), g.vfom_m);
                }
            }
            Message::Traffic(report) => self.traffic(report, at),
            Message::Uplink(payload) => {
                let Some(u) = uplink::read(&payload) else { return };
                self.receiver.station = Some((u.station_lat, u.station_lon));
                self.receiver.station_at = Some(at);
                for apdu in &u.apdus {
                    let time = format!("{:02}{:02}Z", apdu.hours, apdu.minutes);
                    self.product(fisb::read(apdu), time, at);
                }
            }
            Message::Other(_) => {}
        }
    }

    fn traffic(&mut self, report: Report, at: f64) {
        // A target with no position, and own ship heard back as traffic
        // (a receiver may hear its own airplane's ADS-B Out, ADS-R or
        // TIS-B), are not drawn.
        if report.lat == 0.0 && report.lon == 0.0 {
            return;
        }
        if self.ownship.as_ref().is_some_and(|o| o.heard.report.address == report.address) {
            return;
        }
        let hex = report::hex(report.address_type, report.address);
        self.targets.retain(|t| report::hex(t.report.address_type, t.report.address) != hex);
        self.targets.push(Heard { report, at });
    }

    fn product(&mut self, product: Product, time: String, at: f64) {
        match product {
            Product::Texts(texts) => {
                for text in texts {
                    self.texts.retain(|k| !same_text(&k.text, &text));
                    if !text.cancelled {
                        self.texts.push(KeptText { text, at });
                    }
                }
            }
            Product::Nexrad { regional, blocks, empty } => {
                self.blocks.retain(|k| k.regional != regional || !empty.contains(&k.block.id));
                for block in blocks {
                    self.blocks.retain(|k| k.regional != regional || k.block.id != block.id);
                    self.blocks.push(KeptBlock { block, regional, time: time.clone(), at });
                }
            }
            Product::Other => {}
        }
    }

    fn age(&mut self, at: f64) {
        self.targets.retain(|t| at - t.at <= TARGET_HOLD_S);
        if self.ownship.as_ref().is_some_and(|o| at - o.heard.at > TARGET_HOLD_S) {
            self.ownship = None;
        }
        self.texts.retain(|k| at - k.at <= text_hold_s(&k.text.kind));
        self.blocks.retain(|k| at - k.at <= if k.regional { REGIONAL_HOLD_S } else { CONUS_HOLD_S });
    }

    /// One line for the receiver's chip: "Stratux · 12 targets · GPS".
    pub fn summary(&self, at: f64) -> String {
        let r = &self.receiver;
        let name = r.name.clone().unwrap_or_else(|| if r.stratux { "Stratux".into() } else { "Receiver".into() });
        if !self.live(at) {
            return format!("{name} · not heard");
        }
        let n = self.targets.len();
        let targets = if n == 1 { "1 target".to_owned() } else { format!("{n} targets") };
        format!("{name} · {targets} · {}", if r.gps { "GPS" } else { "no GPS" })
    }
}

/// Whether a text sent replaces one kept: a station's METAR or SPECI its
/// last one, its TAF and winds theirs, a TWGO record its number, a PIREP
/// only its own words again.
fn same_text(kept: &Text, sent: &Text) -> bool {
    let kind = |k: &str| if k == "SPECI" { "METAR".to_owned() } else { k.to_owned() };
    if kind(&kept.kind) != kind(&sent.kind) || kept.location != sent.location {
        return false;
    }
    match (kept.number, sent.number) {
        (Some(a), Some(b)) => a == b,
        _ if sent.kind == "PIREP" => kept.text == sent.text,
        _ => true,
    }
}
