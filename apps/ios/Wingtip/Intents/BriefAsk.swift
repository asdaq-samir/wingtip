import Observation

/// The Brief asked for from outside the sheet (BriefFlightIntent, through
/// RootView's commands): FPL's page stack and the strip's each own their
/// path, so the ask is left here and whichever is on the screen opens its
/// Brief page and takes it, once.
@MainActor
@Observable
final class BriefAsk {
    static let shared = BriefAsk()

    private(set) var wanted = false

    func ask() { wanted = true }

    /// Whether the Brief was asked for, and none left.
    func take() -> Bool {
        defer { wanted = false }
        return wanted
    }
}
