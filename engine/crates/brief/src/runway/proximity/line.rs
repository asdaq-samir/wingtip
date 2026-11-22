//! A runway in a flat frame about own ship, in feet, and own ship against
//! it: along and across, the end named by a track, lined up with it.

use super::figures::LINED_UP_DEG;
use super::{End, Strip};
use wingtip_core::flat::Flat;
use wingtip_core::geo::{angle_between, py_mod};
use wingtip_core::units::FT_PER_NM;

/// A runway in the flat frame about own ship (at the origin), ft: end 0,
/// the unit vector from end 0 to end 1 and its length.
pub(super) struct Line {
    pub a: (f64, f64),
    pub dir: (f64, f64),
    pub length: f64,
}

/// (east, north) of a point from own ship, ft.
pub(super) fn ft(frame: &Flat, lat: f64, lon: f64) -> (f64, f64) {
    let (x, y) = frame.nm(lat, lon);
    (x * FT_PER_NM, y * FT_PER_NM)
}

pub(super) fn line(frame: &Flat, s: &Strip) -> Option<Line> {
    let at = |e: &End| ft(frame, e.lat, e.lon);
    let (a, b) = (at(&s.ends[0]), at(&s.ends[1]));
    let length = ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt();
    (length > 1.0).then(|| Line { a, dir: ((b.0 - a.0) / length, (b.1 - a.1) / length), length })
}

impl Line {
    /// Own ship against the runway: how far along it from end 0 (negative
    /// short of it) and how far off its centerline, ft.
    pub fn along_across(&self) -> (f64, f64) {
        let (px, py) = (-self.a.0, -self.a.1);
        (px * self.dir.0 + py * self.dir.1, (px * self.dir.1 - py * self.dir.0).abs())
    }

    /// The way from end 0 to end 1, degrees true clockwise from north: end
    /// 0's runway heading (runway 9's, at the west end, is east).
    pub fn heading(&self) -> f64 {
        py_mod(self.dir.0.atan2(self.dir.1).to_degrees(), 360.0)
    }

    /// The end whose runway a track runs along: 0 where it runs end 0's
    /// way (east on 9/27 is runway 9), else 1.
    pub fn named_end(&self, track: f64) -> usize {
        usize::from(angle_between(track, self.heading()) > 90.0)
    }

    /// The end whose threshold is on the left looking along `track`: by
    /// the cross product of the track and the way to each end.
    pub fn left_end(&self, track: f64) -> usize {
        let t = (track.to_radians().sin(), track.to_radians().cos());
        let b = (self.a.0 + self.dir.0 * self.length, self.a.1 + self.dir.1 * self.length);
        let left_of = |p: (f64, f64)| t.0 * p.1 - t.1 * p.0;
        usize::from(left_of(b) > left_of(self.a))
    }

    /// The nearest point of the centerline, its ends included, from own
    /// ship: (east, north), ft.
    pub fn nearest(&self) -> (f64, f64) {
        let t = self.along_across().0.clamp(0.0, self.length);
        (self.a.0 + self.dir.0 * t, self.a.1 + self.dir.1 * t)
    }

    /// The end landed on, its threshold's distance ahead and own ship's
    /// distance off the extended centerline where `track` is lined up with
    /// the runway: the track within AIM 5-4-20's 30° of the runway's, and
    /// own ship inside the same 30° either side of the centerline seen from
    /// the threshold, which is within `reach_ft`. A base leg or a downwind
    /// is never lined up, whatever its place.
    pub fn lined_up(&self, track: f64, reach_ft: f64) -> Option<(usize, f64, f64)> {
        let end = self.named_end(track);
        let runway_heading = if end == 0 { self.heading() } else { py_mod(self.heading() + 180.0, 360.0) };
        if angle_between(track, runway_heading) > LINED_UP_DEG {
            return None;
        }
        let (along, off) = self.along_across();
        // The landing threshold is the named end's: end 0's ahead at
        // -along when flying its way, end 1's at along - length the other.
        let ahead = if end == 0 { -along } else { along - self.length };
        let inside = off <= ahead * LINED_UP_DEG.to_radians().tan();
        (ahead > 0.0 && ahead <= reach_ft && inside).then_some((end, ahead, off))
    }
}
