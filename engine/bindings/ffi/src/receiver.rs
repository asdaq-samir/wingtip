//! A portable ADS-B receiver's picture held by the engine between the
//! phone's once-a-second reads (wingtip_receiver::held): the phone hands
//! over only the bytes it heard and is answered only the receiver, own
//! ship and traffic, with a revision for the FIS-B texts and NEXRAD, so
//! the hundreds of kB of FIS-B are never copied across each second. A
//! UniFFI object, so the Swift and Kotlin class is the handle and lets the
//! picture go when the app does (Swift's deinit, Kotlin's close).

use crate::{guarded, EngineError};
use std::sync::{Mutex, MutexGuard};
use wingtip_engine::receiver::held::Held;

/// One receiver's picture, held from read to read. Every method takes the
/// lock for its call only; the phones read from one task at a time and
/// draw from another, so a view asked during a read waits for it.
#[derive(uniffi::Object, Default)]
pub struct ReceiverSession {
    held: Mutex<Held>,
}

impl ReceiverSession {
    /// The picture held. A read that panicked half-way leaves a picture
    /// nothing vouches for, so the lock it poisoned gives an empty one:
    /// the receiver's next second fills it again.
    fn held(&self) -> MutexGuard<'_, Held> {
        self.held.lock().unwrap_or_else(|poisoned| {
            self.held.clear_poison();
            let mut held = poisoned.into_inner();
            *held = Held::default();
            held
        })
    }
}

#[uniffi::export]
impl ReceiverSession {
    /// An empty picture: nothing heard yet.
    #[uniffi::constructor]
    pub fn new() -> Self {
        Self::default()
    }

    /// The bytes heard since the last read (whole UDP datagrams), read at
    /// `at` (Unix s) into the picture: the contract's ReceiverDelta, JSON.
    /// The bytes are borrowed for the call, not copied or encoded.
    pub fn read(&self, data: &[u8], at: f64) -> Result<String, EngineError> {
        guarded("receiver_delta", || self.held().read(data, at))
    }

    /// The traffic to draw, the receiver's first and then the internet's
    /// it does not hear (`internet`, a JSON array of HeardPlane), as
    /// receiver_traffic answers.
    pub fn traffic(&self, internet: &str, own_ft: Option<f64>, at: f64) -> Result<String, EngineError> {
        guarded("receiver_traffic", || self.held().traffic(internet, own_ft, at))?.map_err(EngineError::Refused)
    }

    /// A field's METAR and TAF as FIS-B sent them, as receiver_reports.
    pub fn reports(&self, ident: &str) -> Result<String, EngineError> {
        guarded("receiver_reports", || self.held().reports(ident))
    }

    /// The NEXRAD as rectangles of each level, as receiver_nexrad.
    pub fn nexrad(&self) -> Result<String, EngineError> {
        guarded("receiver_nexrad", || self.held().nexrad())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The specification's Heartbeat (GDL 90 Data Interface
    /// Specification, 2.2.4), framed with its CRC.
    const HEARTBEAT: [u8; 11] = [0x7e, 0x00, 0x81, 0x41, 0xdb, 0xd0, 0x08, 0x02, 0xb3, 0x8b, 0x7e];

    #[test]
    fn the_picture_stays_between_reads() {
        let session = ReceiverSession::new();
        let first = session.read(&HEARTBEAT, 100.0).unwrap();
        assert!(first.contains("\"live\":true"), "{first}");
        assert!(first.contains("\"traffic_revision\":1"), "{first}");
        // Nothing heard ten seconds on: the same receiver, not heard now.
        let later = session.read(&[], 110.0).unwrap();
        assert!(later.contains("\"live\":false") && later.contains("\"heartbeat_at\":100.0"), "{later}");
        assert!(session.nexrad().unwrap().starts_with("{\"levels\":"));
        assert!(session.reports("KMSN").unwrap().contains("\"metar\":null"));
        assert_eq!(session.traffic("[]", None, 110.0).unwrap(), "[]");
        assert!(matches!(session.traffic("no", None, 110.0), Err(EngineError::Refused(_))));
    }

    /// A read that panicked poisons the lock; the next call starts again
    /// from an empty picture rather than failing for good.
    #[test]
    fn a_poisoned_picture_starts_again() {
        let session = ReceiverSession::new();
        session.read(&HEARTBEAT, 100.0).unwrap();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _held = session.held.lock().unwrap();
            panic!("a read's bug");
        }));
        let again = session.read(&[], 101.0).unwrap();
        assert!(again.contains("\"heartbeat_at\":null"), "{again}");
    }
}
