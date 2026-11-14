import SwiftUI

extension PresentationDetent {
    /// Half height: the plan's sheet and every card that opens half way,
    /// 45% of the screen as Apple Maps' half covers it, where the stock
    /// .medium covered 53.5% (the iOS sheet audit, 2026-11-10; the owner's
    /// decision of 2026-11-10, docs/design/ios.md §0). A fraction, so the
    /// system moves between it and the others with its own animation.
    static let half = PresentationDetent.fraction(halfShare)
    /// The share of the screen it covers, for the map to keep a mark
    /// tapped clear of the card coming up (MapCamera).
    nonisolated static let halfShare = 0.45
}

extension EnvironmentValues {
    /// The plan's sheet down at its pill (RootView.pill), where only the
    /// search's row shows: the route's figures strip stays out of it, as it
    /// drew 25 points over the search field (the iOS sheet audit,
    /// 2026-11-10; the owner's decision of 2026-11-10), and shows from
    /// half height up.
    @Entry var sheetAtPill = false
}
