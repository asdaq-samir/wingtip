import SwiftUI
import UIKit

/// The app's looks, as the web's: Wingtip's own brand look by default,
/// its blue (#0066CC by day, #57A8FF at night) on everything tappable, and
/// Glass Cockpit's teal and Chart ink's as looks a pilot can pick in Setup
/// (the owner, 2026-11-09: the brand look is the default on all three
/// apps; the other two stay selectable), and Native, iOS's own: the
/// system's blue, labels and grounds (the owner, 2026-11-10). The colours
/// are design/tokens.json's (WingtipPalette; Native's are UIColor's system
/// colours by name); AccentColor, the asset the system's controls start
/// from, is the brand's.
enum Look: String, CaseIterable, Identifiable, Sendable {
    case wingtip, cockpit, ink, native

    /// The key the look is kept under, the web's preference's.
    static let key = "look"
    static let standard = Look.wingtip

    var id: String { rawValue }

    var label: String {
        switch self {
        case .wingtip: "Wingtip"
        case .cockpit: "Glass Cockpit"
        case .ink: "Chart Ink"
        case .native: "Native"
        }
    }

    /// The look's palette, by day or at night.
    func palette(dark: Bool) -> WingtipPalette {
        switch self {
        case .wingtip: dark ? WingtipPalette.dark : WingtipPalette.light
        case .cockpit: dark ? WingtipPalette.cockpitDark : WingtipPalette.cockpitLight
        case .ink: dark ? WingtipPalette.inkDark : WingtipPalette.inkLight
        case .native: dark ? WingtipPalette.nativeDark : WingtipPalette.nativeLight
        }
    }

    /// The tint of everything tappable, by day or at night: Native's is
    /// UIColor.systemBlue, the blue iOS gives an app with no tint of its own.
    func tint(dark: Bool) -> UIColor { palette(dark: dark).tint }

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
