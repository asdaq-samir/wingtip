import SwiftUI
import UIKit

/// The app's looks, as the web's: Wingtip's own brand look by default,
/// its blue (#0066CC by day, #57A8FF at night) on everything tappable, and
/// Glass Cockpit's teal and Chart ink's as looks a pilot can pick in Setup
/// (the owner, 2026-11-09: the brand look is the default on all three
/// apps; the other two stay selectable), and Native, iOS's own: the
/// system's labels and grounds (the owner, 2026-11-10). The colours are
/// design/tokens.json's (WingtipPalette; Native's are UIColor's system
/// colours by name); AccentColor, the asset the system's controls start
/// from, is the brand's.
///
/// Native is iOS as it comes out of the box (the owner, 2026-11-10:
/// "Native means how they come out of the box, look and behavior wise"):
/// no tint of the app's, no brand haptics, type, corners or shadows, each
/// gated on `isStock` where it is applied. One thing it cannot undo at run
/// time: an untinted control draws in the AccentColor asset, which
/// project.yml names as the global accent
/// (ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME) and the asset catalog
/// compiles in at build time, so Native's controls are the brand's blue
/// (#0066CC, #57A8FF at night) rather than systemBlue unless the build
/// drops that setting for every look.
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

    /// iOS's own look, out of the box: no modifier of the app's applies.
    var isStock: Bool { self == .native }

    /// The tint set over everything, nil in Native, which leaves the
    /// system's own (the AccentColor asset; see above).
    func appliedTint(dark: Bool) -> Color? { isStock ? nil : Color(uiColor: tint(dark: dark)) }

    /// The look kept on this phone, the brand's until one is picked.
    static var current: Look { Look(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? standard }
}

extension EnvironmentValues {
    /// The picked look, for the modifiers that step aside in Native
    /// (isStock); set at the root by lookTint().
    @Entry var look: Look = .standard
}

/// The picked look's tint on everything under it, none in Native, and the
/// look itself in the environment.
private struct LookTint: ViewModifier {
    @AppStorage(Look.key) private var look = Look.standard.rawValue
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let picked = Look(rawValue: look) ?? .standard
        // tint(nil) rather than leaving the modifier off, so switching the
        // look keeps the whole tree's identity (and its state).
        content
            .tint(picked.appliedTint(dark: scheme == .dark))
            .environment(\.look, picked)
    }
}

extension View {
    /// The picked look's tint (Look) and the look itself, set once at the root.
    func lookTint() -> some View { modifier(LookTint()) }
}

extension View {
    /// A figure to read at a glance (a frequency, a squawk): the tokens'
    /// 26-point bold with tabular digits (WingtipType.figure), and in
    /// Native the system's own Title style, bold, its digits kept tabular.
    func figureFont() -> some View { modifier(FigureFont()) }
}

private struct FigureFont: ViewModifier {
    @Environment(\.look) private var look

    func body(content: Content) -> some View {
        content.font(look.isStock ? Font.title.bold().monospacedDigit() : WingtipType.figure)
    }
}
