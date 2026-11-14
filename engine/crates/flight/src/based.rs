//! Where an airplane is usually based: the field its own past flights keep
//! to. No public data says where an airplane is kept -- the FAA's registry
//! gives its owner's town, not its hangar -- so the field it takes off from
//! and comes back to is taken for it, at the owner's ask (the Aircraft
//! tab's "based at" filter, 2026-10-13; the airplane card's "usually based
//! at", 2026-11-14), and said only where the flights show it clearly.
//!
//! The flights are those ADS-B receivers heard (the planner's
//! wingtip.traffic.history, adsb.lol's traces): each one's ends are its
//! takeoff field and, where it was heard landing, its landing field. A
//! field is the base where
//! - at least `MIN_ENDS` of those ends are there: two flights out and back
//!   from one field (four ends) clear it, one round trip (two) does not;
//! - at least `MIN_SHARE` of all the ends are there: an airplane on a
//!   cross-country tour, at a new field each night, has none;
//! - no other field has as many: a tie is not clear, so none is said.
//!
//! The figures are the owner's (2026-10-13), not a rule of the FAA's.

/// The fewest takeoffs and landings at a field for it to be the base.
pub const MIN_ENDS: usize = 3;
/// The least share of all the flights' ends at a field for it to be the base.
pub const MIN_SHARE: f64 = 0.4;

/// One past flight's ends: the field it took off from, the field it landed
/// at, and whether it was heard landing there (a flight whose landing was
/// not heard ends nowhere known).
pub struct Flight<'a> {
    pub origin: Option<&'a str>,
    pub destination: Option<&'a str>,
    pub landed: bool,
}

/// The base and the counts it was judged on.
#[derive(Debug, PartialEq)]
pub struct Base<'a> {
    /// The field, or None where the flights do not show one clearly.
    pub ident: Option<&'a str>,
    /// The field most of the ends are at (the base, where it is one), and
    /// how many are there; None where the flights have no ends.
    pub most: Option<(&'a str, usize)>,
    /// All the ends counted.
    pub ends: usize,
}

/// The field these flights usually start or end at, by `MIN_ENDS`,
/// `MIN_SHARE` and no tie; fields are compared as given (the host sends
/// one identifier per field).
pub fn usual_base<'a>(flights: &[Flight<'a>]) -> Base<'a> {
    let mut counts: Vec<(&str, usize)> = Vec::new();
    let mut ends = 0;
    let takeoffs = flights.iter().filter_map(|f| f.origin);
    let landings = flights.iter().filter(|f| f.landed).filter_map(|f| f.destination);
    for ident in takeoffs.chain(landings).filter(|i| !i.is_empty()) {
        ends += 1;
        match counts.iter_mut().find(|(i, _)| *i == ident) {
            Some((_, n)) => *n += 1,
            None => counts.push((ident, 1)),
        }
    }
    // The first field to reach the highest count, as the ends were given.
    let mut most: Option<(&str, usize)> = None;
    for &(ident, n) in &counts {
        if most.is_none_or(|(_, best)| n > best) {
            most = Some((ident, n));
        }
    }
    let tied = most.is_some_and(|(_, best)| counts.iter().filter(|(_, n)| *n == best).count() > 1);
    let clear = most.is_some_and(|(_, n)| n >= MIN_ENDS && n as f64 >= MIN_SHARE * ends as f64) && !tied;
    Base { ident: if clear { most.map(|(i, _)| i) } else { None }, most, ends }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hop<'a>(from: &'a str, to: &'a str) -> Flight<'a> {
        Flight { origin: Some(from), destination: Some(to), landed: true }
    }

    #[test]
    fn two_round_trips_from_one_field_make_it_the_base() {
        let base = usual_base(&[hop("LWM", "LCI"), hop("LCI", "LWM"), hop("LWM", "MHT"), hop("MHT", "LWM")]);
        assert_eq!(base, Base { ident: Some("LWM"), most: Some(("LWM", 4)), ends: 8 });
    }

    #[test]
    fn one_round_trip_is_too_few() {
        assert_eq!(usual_base(&[hop("LWM", "LCI"), hop("LCI", "LWM")]).ident, None);
    }

    #[test]
    fn a_tour_has_no_base() {
        let tour = [hop("LWM", "LCI"), hop("LCI", "MHT"), hop("MHT", "BOS"), hop("BOS", "LWM"), hop("LWM", "ORH"), hop("ORH", "PVD")];
        // LWM has 3 of 12 ends: a quarter, short of MIN_SHARE.
        assert_eq!(usual_base(&tour).ident, None);
    }

    #[test]
    fn a_tie_is_not_clear() {
        let base = usual_base(&[hop("LWM", "LCI"), hop("LCI", "LWM"), hop("LWM", "LCI"), hop("LCI", "LWM")]);
        assert_eq!((base.ident, base.most), (None, Some(("LWM", 4))));
    }

    #[test]
    fn a_landing_not_heard_is_no_end() {
        let unheard = Flight { origin: Some("LWM"), destination: Some("LWM"), landed: false };
        let base = usual_base(&[hop("LWM", "LCI"), hop("LCI", "LWM"), unheard]);
        assert_eq!((base.ident, base.ends), (Some("LWM"), 5));
        assert_eq!(usual_base(&[]), Base { ident: None, most: None, ends: 0 });
    }
}
