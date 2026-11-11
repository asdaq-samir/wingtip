//! The engine's one stable sort. The standard library's `sort_by` is
//! generic over what it sorts and how it compares, so every call site
//! compiled a copy of driftsort of its own: about seventy of them, some
//! 160 KB of the web app's WebAssembly before wasm-opt (twiggy monos,
//! 2026-11-10). Here every sort orders the positions 0..n, through a
//! comparator behind `dyn`, with the one copy of driftsort for `usize`,
//! then moves the items into that order. Driftsort is stable, so the
//! order is the one `sort_by` would give, ties kept as they came: the
//! answers do not change, only the size of the code that finds them.
//!
//! The slices' own `sort*` methods are refused by clippy in the engine
//! (engine/clippy.toml), so a new call site comes here too.

use std::cmp::Ordering;

/// The stable sorts, on any slice (and so any `Vec`): `sort_by`,
/// `sort_by_key` and `sort` as the standard library has them, through
/// the one shared copy of the sort.
pub trait StableSort<T> {
    /// Sorts by `cmp`, stably, as `slice::sort_by` does.
    fn stable_sort_by(&mut self, cmp: impl Fn(&T, &T) -> Ordering);

    /// Sorts by the key `key` gives, stably, as `slice::sort_by_key` does.
    fn stable_sort_by_key<K: Ord>(&mut self, key: impl Fn(&T) -> K) {
        self.stable_sort_by(|a, b| key(a).cmp(&key(b)));
    }

    /// Sorts in the items' own order, stably, as `slice::sort` does.
    fn stable_sort(&mut self)
    where
        T: Ord,
    {
        self.stable_sort_by(T::cmp);
    }
}

impl<T> StableSort<T> for [T] {
    fn stable_sort_by(&mut self, cmp: impl Fn(&T, &T) -> Ordering) {
        if self.len() < 2 {
            return;
        }
        let items: &[T] = self;
        let order = positions(items.len(), &|a, b| cmp(&items[a], &items[b]));
        permute(self, order);
    }
}

/// The positions 0..len in the order `cmp` puts them, stably. Not generic,
/// so the engine holds one copy of the standard library's sort.
#[inline(never)]
fn positions(len: usize, cmp: &dyn Fn(usize, usize) -> Ordering) -> Vec<usize> {
    let mut order: Vec<usize> = (0..len).collect();
    #[allow(clippy::disallowed_methods)] // the one sort the rest come through
    order.sort_by(|&a, &b| cmp(a, b));
    order
}

/// Moves the items so that `items[i]` is what was at `order[i]`, in place,
/// one cycle of the permutation at a time (each item moved once).
fn permute<T>(items: &mut [T], mut order: Vec<usize>) {
    for start in 0..items.len() {
        let mut at = start;
        loop {
            let from = order[at];
            // Marks the place done, so the cycle is not walked again.
            order[at] = at;
            if from == start {
                break;
            }
            items.swap(at, from);
            at = from;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A small linear congruential generator, for test data with no crate.
    fn numbers(n: usize, seed: u64, modulo: u64) -> Vec<u64> {
        let mut x = seed;
        (0..n)
            .map(|_| {
                x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                (x >> 33) % modulo
            })
            .collect()
    }

    #[test]
    fn the_order_is_the_standard_librarys_ties_and_all() {
        for (n, modulo) in [(0, 1), (1, 1), (2, 1), (7, 3), (50, 5), (1000, 10), (5000, 1_000_000)] {
            // Each item tagged with where it came from, so a tie put out of
            // its first order would show.
            let items: Vec<(u64, usize)> = numbers(n, n as u64 + 1, modulo).into_iter().zip(0..).collect();
            let mut ours = items.clone();
            let mut theirs = items.clone();
            ours.stable_sort_by(|a, b| a.0.cmp(&b.0));
            #[allow(clippy::disallowed_methods)]
            theirs.sort_by_key(|a| a.0);
            assert_eq!(ours, theirs, "n = {n}");

            let mut ours = items.clone();
            let mut theirs = items;
            ours.stable_sort_by_key(|a| std::cmp::Reverse(a.0));
            #[allow(clippy::disallowed_methods)]
            theirs.sort_by_key(|a| std::cmp::Reverse(a.0));
            assert_eq!(ours, theirs, "n = {n}, by key");
        }
    }

    #[test]
    fn sorts_owned_items_in_their_own_order() {
        let mut words: Vec<String> = ["kilo", "alpha", "echo", "alpha", "bravo"].iter().map(|s| s.to_string()).collect();
        words.stable_sort();
        assert_eq!(words, ["alpha", "alpha", "bravo", "echo", "kilo"]);
        let mut floats = [3.5, -1.0, 2.0, f64::NAN, 0.0];
        floats.stable_sort_by(f64::total_cmp);
        assert_eq!(&floats[..4], &[-1.0, 0.0, 2.0, 3.5]);
        assert!(floats[4].is_nan());
    }
}
