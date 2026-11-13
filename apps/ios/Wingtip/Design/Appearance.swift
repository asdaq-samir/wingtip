import SwiftUI
import UIKit

/// Light or dark, Appearance as iOS names it (Display & Brightness), with
/// the chart at night folded in as the web's Appearance has it (the owner,
/// 2026-11-13; the web's lookPicks APPEARANCES): System follows the phone,
/// Light and Dark set the app's own, Dark dims the chart's tiles for night
/// vision (ChartNight.dimmed) and Dark + Bright keeps them as printed. Two
/// settings underneath, the app's scheme and ChartNight, so no new chart
/// setting: read back from them as the web reads its two.
enum Appearance: String, CaseIterable, Identifiable, Sendable {
    case system, light, dark, darkBright

    /// The key the app's own scheme is kept under: "system", "light" or "dark".
    static let schemeKey = "appearance"

    var id: String { rawValue }

    var label: LocalizedStringResource {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        case .darkBright: "Dark + Bright"
        }
    }

    var systemImage: String {
        switch self {
        case .system: "circle.lefthalf.filled"
        case .light: "sun.max"
        case .dark: "moon"
        case .darkBright: "sun.and.horizon"
        }
    }

    /// The pick read from the two settings it sets.
    static func of(scheme: String, chartNight: String) -> Appearance {
        switch scheme {
        case "light": .light
        case "dark": chartNight == ChartNight.normal.rawValue ? .darkBright : .dark
        default: .system
        }
    }

    /// The app's scheme it sets.
    var scheme: String {
        switch self {
        case .system: "system"
        case .light: "light"
        case .dark, .darkBright: "dark"
        }
    }

    /// The chart at night it sets: as printed with Dark + Bright alone,
    /// dimmed with the rest, the night's default.
    var chartNight: ChartNight { self == .darkBright ? .normal : .dimmed }

    /// The window's style for a kept scheme: unspecified follows the phone.
    static func style(_ scheme: String) -> UIUserInterfaceStyle {
        switch scheme {
        case "light": .light
        case "dark": .dark
        default: .unspecified
        }
    }
}

/// Appearance, a menu of four (a discrete setting, CLAUDE.md), in
/// Settings' Look group and on the welcome.
struct AppearanceRow: View {
    @AppStorage(Appearance.schemeKey) private var scheme = Appearance.system.scheme
    @AppStorage(ChartNight.key) private var chartNight = ChartNight.dimmed.rawValue

    var body: some View {
        Picker("Appearance", selection: Binding(
            get: { Appearance.of(scheme: scheme, chartNight: chartNight) },
            set: { picked in
                scheme = picked.scheme
                chartNight = picked.chartNight.rawValue
            })) {
                ForEach(Appearance.allCases) { pick in
                    Label { Text(pick.label) } icon: { Image(systemName: pick.systemImage) }.tag(pick)
                }
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("appearance-select")
    }
}

/// The app's look, its Theme (Look: Wingtip, Glass Cockpit, Chart Ink,
/// Native), a menu, in Settings' Look group and on the welcome.
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
    List { Section("Look") { ThemeRow(); AppearanceRow() } }
}
