//! A TFR's window against the pass, both sides of its half hour.

use super::*;

#[test]
fn a_tfr_is_in_force_within_half_an_hour_of_its_window_and_not_past_it() {
    // PASS_MARGIN_MIN: the window widened by 30 minutes either way.
    let min = 60_000_000_i64;
    let (from, to) = (1_000 * min, 2_000 * min);
    assert_eq!(tfr_when(from - 30 * min, Some(from), Some(to)), "in-force");
    assert_eq!(tfr_when(from - 30 * min - 1, Some(from), Some(to)), "before");
    assert_eq!(tfr_when(to + 30 * min, Some(from), Some(to)), "in-force");
    assert_eq!(tfr_when(to + 30 * min + 1, Some(from), Some(to)), "after");
    assert_eq!(tfr_when(0, None, None), "in-force");
}
