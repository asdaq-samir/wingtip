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
//! tables each), the oldest let go first.

use crate::pack::Pack;
use std::any::Any;
use std::sync::{Arc, Mutex};

/// The readings kept at most: four or five region packs round the
/// airplane, five readings each, with room for the next cycle's.
pub const KEEP: usize = 32;

type Entry = ((u32, u64, usize), &'static str, Arc<dyn Any + Send + Sync>);

static KEPT: Mutex<Vec<Entry>> = Mutex::new(Vec::new());

/// `make(pack)`, the reading `what` of this pack, made once and kept. A
/// lock another call's panic left poisoned only costs the reading again.
pub(crate) fn kept<T: Any + Send + Sync>(pack: &Pack, what: &'static str, make: impl FnOnce(&Pack) -> T) -> Arc<T> {
    let key = pack.identity();
    if let Ok(all) = KEPT.lock()
        && let Some(found) = all.iter().find(|e| e.0 == key && e.1 == what)
        && let Ok(t) = found.2.clone().downcast::<T>()
    {
        return t;
    }
    // Made outside the lock: a big table's reading holds up no other call.
    let made = Arc::new(make(pack));
    if let Ok(mut all) = KEPT.lock() {
        all.retain(|e| !(e.0 == key && e.1 == what));
        if all.len() >= KEEP {
            all.remove(0);
        }
        all.push((key, what, made.clone()));
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
}
