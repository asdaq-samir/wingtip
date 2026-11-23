//! A receiver's picture held by the engine between reads, for a host that
//! reads once a second: the phones' ReceiverSession (bindings/ffi). The
//! picture keeps every FIS-B text and NEXRAD block heard, often hundreds
//! of kB, and handing it across as JSON each way each second cost more
//! than the read itself. Held, it stays here: a read hands over only the
//! bytes and answers only the small part (the receiver, own ship and its
//! traffic, the contract's ReceiverDelta) with a revision for each of the
//! rest, and the host asks for the traffic merged, a field's reports or
//! the NEXRAD only where the revision it has is old.

use crate::picture::Picture;
use crate::{picture_json, views};
use wingtip_core::json;

/// What the host asks again when it changes, counted from 0, a new count
/// each read that changed it: the traffic to merge (the targets, or
/// whether a receiver has been heard at all), the texts a field's reports
/// are read from, and the NEXRAD blocks.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Revisions {
    pub traffic: u64,
    pub texts: u64,
    pub nexrad: u64,
}

#[derive(Debug, Default)]
pub struct Held {
    picture: Picture,
    revisions: Revisions,
}

impl Held {
    /// A held picture to start from: empty, or one a host kept.
    pub fn new(picture: Picture) -> Self {
        Held { picture, revisions: Revisions::default() }
    }

    /// The bytes received at `at` read into the picture held, and what it
    /// is now as the contract's ReceiverDelta.
    pub fn read(&mut self, bytes: &[u8], at: f64) -> String {
        let heard = self.picture.receiver.heartbeat_at.is_some();
        // The targets are a few dozen reports at most: copied to compare,
        // where the texts and blocks are told by the read (Changed).
        let targets = self.picture.targets.clone();
        let changed = self.picture.read(bytes, at);
        let r = &mut self.revisions;
        if targets != self.picture.targets || heard != self.picture.receiver.heartbeat_at.is_some() {
            r.traffic += 1;
        }
        if changed.texts {
            r.texts += 1;
        }
        if changed.blocks {
            r.nexrad += 1;
        }
        picture_json::write_delta(&self.picture, at, &self.revisions)
    }

    /// The traffic to draw, the receiver's merged with the internet's
    /// (`internet`, a JSON array of the contract's HeardPlane), as
    /// receiver_traffic answers it.
    pub fn traffic(&self, internet: &str, own_ft: Option<f64>, at: f64) -> Result<String, String> {
        let internet = json::parse(internet).map_err(|e| format!("the internet's traffic: {e}"))?;
        let planes = internet.as_array().ok_or("the internet's traffic is not a list")?;
        Ok(views::traffic(&self.picture, planes, own_ft, at))
    }

    /// A field's METAR and TAF as FIS-B sent them, as receiver_reports.
    pub fn reports(&self, ident: &str) -> String {
        views::reports(&self.picture, ident)
    }

    /// The NEXRAD as rectangles of each level, as receiver_nexrad.
    pub fn nexrad(&self) -> String {
        views::nexrad(&self.picture)
    }

    /// The whole picture, as receiver_read answers it.
    pub fn picture(&self, at: f64) -> String {
        picture_json::write(&self.picture, at)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wingtip_core::json::Value;

    /// A Heartbeat (3.1) with its GPS valid.
    fn heartbeat() -> Vec<u8> {
        crate::frame::framed(&[0x00, 0x81, 0x00, 0x00, 0x00, 0x00, 0x00])
    }

    fn delta(text: &str) -> Value {
        json::parse(text).unwrap()
    }

    fn revision(d: &Value, k: &str) -> f64 {
        d.get(k).and_then(Value::as_f64).unwrap()
    }

    #[test]
    fn a_read_counts_what_it_changed() {
        let mut held = Held::default();
        let quiet = delta(&held.read(&[], 0.0));
        assert_eq!(revision(&quiet, "traffic_revision"), 0.0);
        let first = delta(&held.read(&heartbeat(), 1.0));
        // A receiver heard at all is new traffic to merge.
        assert_eq!(revision(&first, "traffic_revision"), 1.0);
        assert_eq!(first.get("receiver").and_then(|r| r.get("live")), Some(&Value::Bool(true)));
        assert_eq!((revision(&first, "texts_revision"), revision(&first, "nexrad_revision")), (0.0, 0.0));
        let again = delta(&held.read(&heartbeat(), 2.0));
        assert_eq!(revision(&again, "traffic_revision"), 1.0, "nothing new was heard");
        assert_eq!(revision(&again, "texts"), 0.0);
    }

    #[test]
    fn its_views_are_the_rules_views() {
        let mut held = Held::default();
        held.read(&heartbeat(), 1.0);
        let picture = picture_json::read(Some(&json::parse(&held.picture(1.0)).unwrap()));
        assert_eq!(held.nexrad(), views::nexrad(&picture));
        assert_eq!(held.reports("KMSN"), views::reports(&picture, "KMSN"));
        assert_eq!(held.traffic("[]", None, 1.0).unwrap(), views::traffic(&picture, &[], None, 1.0));
        assert!(held.traffic("{}", None, 1.0).is_err());
    }
}
