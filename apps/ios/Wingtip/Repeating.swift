import UIKit

/// Work the app repeats while a task lives -- the traffic about the map,
/// the tracked and watched airplanes, what is ahead on the track, the
/// flight on the Lock Screen -- on Swift's own clock (ContinuousClock)
/// rather than a scheduler of the app's own: each is the `.task` or the
/// Task that runs it, and stops as that task is cancelled.
///
/// With the app in the background or the phone locked each interval is
/// twice as long -- twice, not more, since what is ahead is still said
/// aloud in flight with the screen off, and the planner looks five
/// minutes along the track. The second half is waited only if the app is
/// still put away when the first ends, so once it is back on the screen
/// nothing waits longer than its own interval.
enum Repeating {
    /// How much longer each interval is with the app put away or the
    /// phone locked.
    static let slowed = 2

    /// `work` now, then again `seconds` after each run ends, so a run
    /// that took longer than the interval is not piled up behind.
    @MainActor
    static func every(_ seconds: Double, _ work: @MainActor () async -> Void) async {
        let clock = ContinuousClock()
        while !Task.isCancelled {
            await work()
            for half in 1...slowed where half == 1 || putAway {
                try? await clock.sleep(for: .seconds(seconds))
            }
        }
    }

    /// The app in the background, or the phone locked (its protected
    /// data gone), as the system says it now.
    @MainActor
    private static var putAway: Bool {
        let app = UIApplication.shared
        return app.applicationState == .background || !app.isProtectedDataAvailable
    }
}
