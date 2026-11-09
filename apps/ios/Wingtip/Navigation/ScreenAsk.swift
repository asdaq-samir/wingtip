import Observation

/// A screen asked for by its name (design/screens.json) and not yet open:
/// the one way in for a link, Siri and the app's own shortcuts. RootView
/// says which tab it is on (openScreen); the tab's own stack, which only
/// it can push onto, takes it from here (FPLView, AircraftView, SetupView,
/// and the strip's StripSheetView), as BriefAsk's Brief is taken.
@MainActor
@Observable
final class ScreenAsk {
    static let shared = ScreenAsk()

    private(set) var wanted: Screen?

    func ask(_ screen: Screen) { wanted = screen }

    /// The screen asked for, when it is one of `these`, and none left.
    func take(_ these: Set<Screen>) -> Screen? {
        guard let wanted, these.contains(wanted) else { return nil }
        self.wanted = nil
        return wanted
    }
}
