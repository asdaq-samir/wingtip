import SwiftUI

/// A flight category's dot or ring on a dark surface cased in the chart's
/// casing, as the map draws its marks and the web its dots
/// (flightCategory.ts NIGHT_DOT_RING, ring-1 in --chart-casing): the FAA's
/// deep blue and red alone are 2.3 to 3.2:1 on the night's navy (the
/// round-4 themes audit: IFR 2.82:1 on the night's ground, 2.29 on the
/// card), under the 3:1 a mark needs (WCAG 2.2 1.4.11). By day the colour
/// stands on its own.
struct CategoryCasing: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    /// The casing's colour and width, in points, drawn outside the mark.
    static let colour = Color(uiColor: WingtipColor.Chart.casing)
    static let width: CGFloat = 1

    func body(content: Content) -> some View {
        content.overlay {
            if scheme == .dark { Circle().strokeBorder(Self.colour, lineWidth: Self.width).padding(-Self.width) }
        }
    }
}

extension View {
    /// A category's round dot or ring, cased at night (CategoryCasing).
    func categoryCased() -> some View { modifier(CategoryCasing()) }
}
