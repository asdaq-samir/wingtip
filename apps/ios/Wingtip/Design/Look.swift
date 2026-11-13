import SwiftUI
import UIKit

/// The app's looks, as the web's: Wingtip's own brand look by default,
/// its blue (#0066CC by day, #57A8FF at night) on everything tappable, and
/// Glass Cockpit's teal and Chart ink's as looks a pilot can pick in Setup
/// (the owner, 2026-11-09: the brand look is the default on all three
/// apps; the other two stay selectable), and Native, iOS's own: the
/// system's labels and grounds (the owner, 2026-11-10). The colours are
/// design/tokens.json's (WingtipPalette; Native's are UIColor's system
/// colours by name).
///
/// Native is iOS as it comes out of the box (the owner, 2026-11-10:
/// "Native means how they come out of the box, look and behavior wise"):
/// no tint of the app's, no brand haptics, type, corners or shadows, each
/// gated on `isStock` where it is applied. The app names no global accent
/// colour (project.yml), so with no tint set an untinted control draws in
/// the system's own, systemBlue; the brand looks set theirs at the root
/// (lookTint), over SwiftUI and the window the alerts are drawn in.
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
    /// system's own (systemBlue; see above).
    func appliedTint(dark: Bool) -> Color? { isStock ? nil : Color(uiColor: tint(dark: dark)) }

    /// The look kept on this phone, the brand's until one is picked.
    static var current: Look { Look(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? standard }
}

extension EnvironmentValues {
    /// The picked look, for the modifiers that step aside in Native
    /// (isStock); set at the root by lookTint().
    @Entry var look: Look = .standard
    /// The look's tint as a Color, for what needs a Color rather than the
    /// tint shape style (a gradient, a swipe action, a ternary): the
    /// brand's in the brand looks, the system's systemBlue in Native. Not
    /// Color.accentColor, which reads the app's global accent and not the
    /// root's tint, and the app names none (project.yml).
    @Entry var lookAccent: Color = .blue
}

/// The picked look's tint on everything under it, none in Native, and the
/// look itself in the environment.
private struct LookTint: ViewModifier {
    @AppStorage(Look.key) private var look = Look.standard.rawValue
    /// Settings' Appearance (Appearance): the app's own light or dark, or
    /// the phone's.
    @AppStorage(Appearance.schemeKey) private var appearance = Appearance.system.scheme
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let picked = Look(rawValue: look) ?? .standard
        // tint(nil) rather than leaving the modifier off, so switching the
        // look keeps the whole tree's identity (and its state).
        content
            .tint(picked.appliedTint(dark: scheme == .dark))
            .environment(\.look, picked)
            .environment(\.lookAccent, picked.appliedTint(dark: scheme == .dark) ?? .blue)
            .background(WindowTint(tint: picked.windowTint, style: Appearance.style(appearance)).allowsHitTesting(false).accessibilityHidden(true))
    }
}

extension Look {
    /// The window's tint: what the system draws itself in the app's window
    /// takes it, an alert's and a confirmation's buttons among them, which
    /// SwiftUI's tint does not reach. The look's own by day and at night,
    /// nil in Native (the system's).
    var windowTint: UIColor? {
        isStock ? nil : UIColor { [self] traits in tint(dark: traits.userInterfaceStyle == .dark) }
    }
}

/// Sets the window's tint (Look.windowTint) and its light or dark
/// (Appearance) once the root is in a window, and again as either changes:
/// the window's own style, so every sheet, alert and the map under them
/// follow it, as UIKit's overrideUserInterfaceStyle is meant to be used.
private struct WindowTint: UIViewRepresentable {
    let tint: UIColor?
    let style: UIUserInterfaceStyle

    func makeUIView(context _: Context) -> Probe { Probe() }

    func updateUIView(_ view: Probe, context _: Context) {
        view.tint = tint
        view.style = style
        view.apply()
    }

    final class Probe: UIView {
        var tint: UIColor?
        var style: UIUserInterfaceStyle = .unspecified

        override func didMoveToWindow() {
            super.didMoveToWindow()
            apply()
        }

        func apply() {
            window?.tintColor = tint
            window?.overrideUserInterfaceStyle = style
        }
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
    /// The token's size scaled as Title 1 is, redrawn as the text size
    /// changes: WingtipType.figure, a UIFont scaled once, was not, and
    /// Apple's audit found the emergency's squawk and Guard not growing.
    @ScaledMetric(relativeTo: .title) private var size = WingtipType.figureSize

    func body(content: Content) -> some View {
        content.font(look.isStock ? Font.title.bold().monospacedDigit() : Font(UIFont.systemFont(ofSize: size, weight: .bold)).monospacedDigit())
    }
}
