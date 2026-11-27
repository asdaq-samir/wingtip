import SwiftUI

/// A flight category's dot or ring cased in the chart's casing, day and
/// night, as the map draws its marks and the web its dots
/// (flightCategory.ts DOT_RING, ring-1 in --chart-casing), so each reads
/// 3:1 and more against what is next to it (WCAG 2.2 1.4.11): at night
/// the FAA's deep blue and red alone are 2.3 to 3.2:1 on the night's navy
/// (IFR 2.82:1 on the night's ground, 2.29 on the card); by day LIFR's
/// purple is 2.75 to 2.89:1 on the muted fills, 3.35:1 against the ring
/// (the round-4 and round-5 themes audits). On white the ring is unseen.
struct CategoryCasing: ViewModifier {
    /// The casing's colour and width, in points, drawn outside the mark.
    static let colour = Color(uiColor: WingtipColor.Chart.casing)
    static let width: CGFloat = 1

    func body(content: Content) -> some View {
        content.overlay {
            Circle().strokeBorder(Self.colour, lineWidth: Self.width).padding(-Self.width)
        }
    }
}

extension View {
    /// A category's round dot or ring, cased (CategoryCasing).
    func categoryCased() -> some View { modifier(CategoryCasing()) }
}
