import Observation

/// A screen asked for by its name (design/screens.json) and not yet open:
/// the strip layout's way in for a link, Siri and the app's own
/// shortcuts. RootView says it is the strip's (openScreen); the strip's
/// own stack, which only it can push onto, takes it from here
/// (StripSheetView), as BriefAsk's Brief is taken. The plan's sheet needs
/// none: its stack is RootView's own path.
@MainActor
@Observable
final class ScreenAsk {
    private(set) var wanted: Screen?

    func ask(_ screen: Screen) { wanted = screen }

    /// The screen asked for, when it is one of `these`, and none left.
    func take(_ these: Set<Screen>) -> Screen? {
        guard let wanted, these.contains(wanted) else { return nil }
        self.wanted = nil
        return wanted
    }
}
