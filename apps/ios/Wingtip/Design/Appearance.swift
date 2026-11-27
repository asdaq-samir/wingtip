import SwiftUI
import UIKit

/// Light or dark, Appearance as iOS names it (Display & Brightness), as the
/// web's Appearance has it (lookPicks): System follows the phone, Light and
/// Dark set the app's own. How far the chart is dimmed is the Map card's
/// Dimmer, one for each appearance (ChartLook), where Dark + Bright was the
/// chart undimmed under the dark scheme until the web's 2026-11-18 change
/// (the owner: "can we have a dimmer and contrast sliders under sunlight
/// and remove it from the appearance?"); a kept one is Dark with a dark
/// Dimmer of 0 (ChartLook.migrate).
enum Appearance: String, CaseIterable, Identifiable, Sendable {
    case system, light, dark

    /// The key the app's own scheme is kept under: "system", "light" or "dark".
    static let schemeKey = "appearance"

    var id: String { rawValue }

    var label: LocalizedStringResource {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var systemImage: String {
        switch self {
        case .system: "circle.lefthalf.filled"
        case .light: "sun.max"
        case .dark: "moon"
        }
    }

    /// The pick read from the scheme it sets.
    static func of(scheme: String) -> Appearance {
        switch scheme {
        case "light": .light
        case "dark": .dark
        default: .system
        }
    }

    /// The app's scheme it sets.
    var scheme: String { rawValue }

    /// The window's style for a kept scheme: unspecified follows the phone.
    static func style(_ scheme: String) -> UIUserInterfaceStyle {
        switch scheme {
        case "light": .light
        case "dark": .dark
        default: .unspecified
        }
    }
}

/// Appearance, a menu of three (a discrete setting, CLAUDE.md), in the Map
/// card's Look section and on the welcome.
struct AppearanceRow: View {
    @AppStorage(Appearance.schemeKey) private var scheme = Appearance.system.scheme

    var body: some View {
        Picker("Appearance", selection: Binding(
            get: { Appearance.of(scheme: scheme) },
            set: { scheme = $0.scheme })) {
                ForEach(Appearance.allCases) { pick in
                    Label { Text(pick.label) } icon: { Image(systemName: pick.systemImage) }.tag(pick)
                }
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("appearance-select")
    }
}

/// The app's look, its Theme (Look: Wingtip, Glass Cockpit, Chart Ink,
/// Native), a menu, in the Map card's Look section and on the welcome.
struct ThemeRow: View {
    @AppStorage(Look.key) private var look = Look.standard.rawValue

    var body: some View {
        Picker("Theme", selection: $look) {
            ForEach(Look.allCases) { Text($0.label).tag($0.rawValue) }
        }
        .pickerStyle(.menu)
        .accessibilityIdentifier("theme-select")
    }
}

#Preview("Look rows") {
    List { Section("Look") { ThemeRow(); AppearanceRow(); ChartLookRows() } }
}
