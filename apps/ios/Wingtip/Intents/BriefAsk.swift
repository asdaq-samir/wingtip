import Foundation
import Observation

/// The Brief asked for from outside the sheet (BriefFlightIntent, through
/// RootView's commands): FPL's page stack and the strip's each own their
/// path, so the ask is left here and whichever is on the screen opens its
/// Brief page and takes it, once.
@MainActor
@Observable
final class BriefAsk {
    private(set) var wanted = false
    /// The departure time said with the ask ("tomorrow at 9"), for the
    /// Brief's departure window to pick its hour, once.
    private(set) var departAt: Date?

    func ask() { wanted = true }

    /// The departure time the next Brief opens on, said before the route
    /// it briefs is planned (PlanTripIntent's "tomorrow at 9").
    func expect(departAt: Date) { self.departAt = departAt }

    /// The departure time said, and none left.
    func takeDepart() -> Date? {
        defer { departAt = nil }
        return departAt
    }

    /// Whether the Brief was asked for, and none left.
    func take() -> Bool {
        defer { wanted = false }
        return wanted
    }
}
