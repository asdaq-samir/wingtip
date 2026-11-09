import SwiftUI
import UIKit

/// The app's looks, as the web's: Wingtip's own brand look by default,
/// its blue (#0066CC by day, #57A8FF at night) on everything tappable, and
/// Glass Cockpit's teal and Chart ink's as looks a pilot can pick in Setup
/// (the owner, 2026-11-09: the brand look is the default on all three
/// apps; the other two stay selectable). The colours are design/tokens.json's
/// (WingtipPalette); AccentColor, the asset the system's controls start
/// from, is the brand's.
enum Look: String, CaseIterable, Identifiable, Sendable {
    case wingtip, cockpit, ink

    /// The key the look is kept under, the web's preference's.
    static let key = "look"
    static let standard = Look.wingtip

    var id: String { rawValue }

    var label: String {
        switch self {
        case .wingtip: "Wingtip"
        case .cockpit: "Glass Cockpit"
        case .ink: "Chart Ink"
        }
    }

    /// The tint of everything tappable, by day or at night.
    func tint(dark: Bool) -> UIColor {
        switch self {
        case .wingtip: (dark ? WingtipPalette.dark : WingtipPalette.light).tint
        case .cockpit: (dark ? WingtipPalette.cockpitDark : WingtipPalette.cockpitLight).tint
        case .ink: (dark ? WingtipPalette.inkDark : WingtipPalette.inkLight).tint
        }
    }

    /// The look kept on this phone, the brand's until one is picked.
    static var current: Look { Look(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? standard }
}

/// The picked look's tint on everything under it.
private struct LookTint: ViewModifier {
    @AppStorage(Look.key) private var look = Look.standard.rawValue
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content.tint(Color(uiColor: (Look(rawValue: look) ?? .standard).tint(dark: scheme == .dark)))
    }
}

extension View {
    /// The picked look's tint (Look), set once at the root.
    func lookTint() -> some View { modifier(LookTint()) }
}
