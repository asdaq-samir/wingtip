import Foundation

/// Whether a weather timeline on the map is in sight, for the radar loop
/// and the model weather alike: out of sight with the app put away or
/// with the iPhone's sheet at full height over the map. Out of sight it
/// pauses, and plays again once back in sight if it was playing; put
/// away, its lists are not fetched either (the app stays alive in the
/// background while flying, and nobody sees them).
struct LoopSight: Equatable, Sendable {
    enum Reason: Hashable, Sendable { case away, covered }

    /// What the model does on a change.
    enum Act: Equatable, Sendable { case pause, play }

    private var unseen: Set<Reason> = []
    private var resume = false

    var inSight: Bool { unseen.isEmpty }
    var away: Bool { unseen.contains(.away) }

    /// A reason come or gone, `playing` as now: pause as it goes out of
    /// sight, play as it comes back if it was playing.
    mutating func set(_ reason: Reason, hidden: Bool, playing: Bool) -> Act? {
        let was = inSight
        if hidden { unseen.insert(reason) } else { unseen.remove(reason) }
        if was, !inSight {
            resume = playing
            return playing ? .pause : nil
        }
        if !was, inSight, resume {
            resume = false
            return .play
        }
        return nil
    }

    /// The pilot played or paused: their word stands over a resume.
    mutating func picked() { resume = false }
}
