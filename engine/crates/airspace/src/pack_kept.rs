//! What a pack's tables come to, kept between calls. A phone asks the
//! map's view of the same packs on every pan (view, view_airports,
//! view_marks) and the places a clearance names on every transmission
//! (spoken), and each call read the `airports`, `navaids` and `fixes`
//! tables' JSON and `airspace.attr` whole again, tens of thousands of rows,
//! to keep the few hundred in the box (waste-server.md item K). Each is
//! now read once per pack and kept here, by what the pack is -- its
//! CRC-32 of every byte after the header, when it was built and its length
//! (crate::pack), so a pack replaced by the next cycle's, or rewritten, is
//! read anew -- and each call filters what is kept. A rule's answer is
//! still a pure function of the bytes it is given: the same pack gives the
//! same rows whether read now or kept from before. No format changes, so
//! every pack written so far is read as it was.
//!
//! At most KEEP readings are kept (a few region packs, a handful of
//! tables each), the one used longest ago let go first: a reading found is
//! moved to the back, so the readings a phone asks in turn stay kept.

use crate::pack::Pack;
use std::any::Any;
use std::sync::{Arc, Mutex};

/// The readings kept at most: the eight kinds (airports, primaries,
/// landing fields, navaids, fixes, places, airspace attributes and SUA
/// heights) of five region packs round the airplane are 40, with room for
/// the next cycle's. At 32 a phone asking
/// the five packs' eight readings in turn let each go before it came round
/// again, and read the airports table anew every few seconds in flight.
pub const KEEP: usize = 64;

type Key = (u32, u64, usize);
type Reading = Arc<dyn Any + Send + Sync>;

/// The readings, the one used longest ago first.
struct Kept {
    entries: Vec<(Key, &'static str, Reading)>,
    limit: usize,
}

impl Kept {
    const fn new(limit: usize) -> Self {
        Self { entries: Vec::new(), limit }
    }

    /// The reading kept, moved to the back as the one used last.
    fn find(&mut self, key: Key, what: &'static str) -> Option<Reading> {
        let at = self.entries.iter().position(|e| e.0 == key && e.1 == what)?;
        let entry = self.entries.remove(at);
        let reading = entry.2.clone();
        self.entries.push(entry);
        Some(reading)
    }

    /// Keeps a reading, letting go of the one used longest ago when full.
    fn keep(&mut self, key: Key, what: &'static str, reading: Reading) {
        self.entries.retain(|e| !(e.0 == key && e.1 == what));
        if self.entries.len() >= self.limit {
            self.entries.remove(0);
        }
        self.entries.push((key, what, reading));
    }
}

static KEPT: Mutex<Kept> = Mutex::new(Kept::new(KEEP));

/// `make(pack)`, the reading `what` of this pack, made once and kept. A
/// lock another call's panic left poisoned only costs the reading again.
pub(crate) fn kept<T: Any + Send + Sync>(pack: &Pack, what: &'static str, make: impl FnOnce(&Pack) -> T) -> Arc<T> {
    let key = pack.identity();
    if let Ok(mut all) = KEPT.lock()
        && let Some(found) = all.find(key, what)
        && let Ok(t) = found.downcast::<T>()
    {
        return t;
    }
    // Made outside the lock: a big table's reading holds up no other call.
    let made = Arc::new(make(pack));
    if let Ok(mut all) = KEPT.lock() {
        all.keep(key, what, made.clone());
    }
    made
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pack::tests::written;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn a_pack_is_read_once_and_another_pack_on_its_own() {
        let (one, two) = (written(&[("kept-a", b"1".to_vec())]), written(&[("kept-a", b"2".to_vec())]));
        let made = AtomicUsize::new(0);
        let read = |bytes: &[u8]| {
            let pack = Pack::read(bytes).unwrap();
            kept(&pack, "kept-test", |p| {
                made.fetch_add(1, Ordering::SeqCst);
                p.section("kept-a").unwrap().to_vec()
            })
        };
        assert_eq!(*read(&one), b"1");
        assert_eq!(*read(&one), b"1");
        assert_eq!(made.load(Ordering::SeqCst), 1);
        // The same header, other bytes: its CRC-32 tells it apart.
        assert_eq!(*read(&two), b"2");
        assert_eq!(made.load(Ordering::SeqCst), 2);
    }

    /// Eight readings of five packs asked in turn, as a phone in flight
    /// asks them: after the first round every one is found.
    #[test]
    fn a_round_of_forty_readings_is_found_after_the_first() {
        const WHAT: [&str; 8] = ["a", "b", "c", "d", "e", "f", "g", "h"];
        let mut kept = Kept::new(KEEP);
        let mut missed = 0;
        for round in 0..3 {
            for pack in 0..5u32 {
                for what in WHAT {
                    let key = (pack, 0, 0);
                    if kept.find(key, what).is_none() {
                        assert_eq!(round, 0, "{pack} {what} let go in round {round}");
                        missed += 1;
                        kept.keep(key, what, Arc::new(()));
                    }
                }
            }
        }
        assert_eq!(missed, 40);
    }

    /// Full, the one used longest ago goes, not the one first kept.
    #[test]
    fn the_reading_used_longest_ago_goes_first() {
        let mut kept = Kept::new(2);
        kept.keep((1, 0, 0), "a", Arc::new(()));
        kept.keep((2, 0, 0), "a", Arc::new(()));
        assert!(kept.find((1, 0, 0), "a").is_some());
        kept.keep((3, 0, 0), "a", Arc::new(()));
        assert!(kept.find((1, 0, 0), "a").is_some());
        assert!(kept.find((2, 0, 0), "a").is_none());
    }
}
