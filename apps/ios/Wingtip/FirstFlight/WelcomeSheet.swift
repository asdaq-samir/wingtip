import CoreLocation
import SwiftUI
import TipKit
import UIKit

/// The first flight's welcome (FirstFlightModel; the web's WelcomeSheet,
/// the owner's option A of 2026-11-13 and his later asks), in Apple's own
/// welcome layout as its apps show one on a first launch: the app's name
/// large and centred, three rows each a tinted glyph, a bold title and a
/// line, then the look -- Settings' own Theme and Appearance rows, applied
/// at once -- and at the foot Apple's permission priming: Turn On Location
/// with Later under it, or Let's Go Flying alone where the position is
/// allowed already. A system sheet at the large detent; a swipe down is
/// Later.
struct WelcomeSheet: View {
    @Environment(OwnShip.self) private var ownShip
    @Environment(\.openURL) private var openURL
    /// Goes on to the map with the search asking for the destination.
    let go: () -> Void

    /// What the app is, three rows of it (the owner's aim, 2026-11-13: "a
    /// simple app with search like Apple/Google and a plan page like an
    /// EFB that can be easily accessed"); the web's words.
    private static let rows: [(icon: String, title: LocalizedStringResource, line: LocalizedStringResource)] = [
        ("magnifyingglass", "Search, like Maps", "Find any airport, town or fix the way you would in Apple or Google Maps."),
        (WingtipIcon.flightPlan, "FPL, like your EFB", "The route, nav log, profile and brief, one tap away on the FPL button."),
        ("map", "FAA charts that move like Maps", "Sectional and IFR charts you pinch, pan and tap, with the weather on top."),
    ]

    var body: some View {
        List {
            Section {
                Text("Welcome to Wingtip Maps")
                    .font(.largeTitle.bold())
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, WingtipSpace.xl)
                    .accessibilityAddTraits(.isHeader)
                ForEach(Array(Self.rows.enumerated()), id: \.offset) { _, row in
                    HStack(alignment: .top, spacing: WingtipSpace.lg) {
                        Image(systemName: row.icon)
                            .font(.title)
                            .foregroundStyle(.tint)
                            .frame(width: 44)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                            Text(row.title).font(.headline)
                            Text(row.line).foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            // The look, picked here as in Settings and applied at once.
            Section {
                ThemeRow()
                AppearanceRow()
            }
        }
        .listStyle(.insetGrouped)
        .safeAreaInset(edge: .bottom) { foot }
        .accessibilityIdentifier("welcome")
    }

    @ViewBuilder private var foot: some View {
        let state = WelcomeFoot.of(ownShip.authorization)
        VStack(spacing: WingtipSpace.sm) {
            switch state {
            case .go:
                button("Let's Go Flying", id: "welcome-go") { go() }
            case .ask, .askInSettings:
                button("Turn On Location", id: "welcome-location") {
                    if state == .ask {
                        // iOS's own question, asked at the tap; on to the
                        // map whatever the answer.
                        ownShip.askLocation()
                        go()
                    } else if let settings = URL(string: UIApplication.openSettingsURLString) {
                        // Refused before (the owner: "If refused before, ask
                        // again"): iOS asks an app only once, so its own
                        // page of Settings, where Location is turned on.
                        openURL(settings)
                    }
                }
                Button("Later", action: go)
                    .frame(minHeight: WingtipSize.tapTarget)
                    .accessibilityIdentifier("welcome-later")
            }
        }
        .padding(.horizontal, WingtipSpace.xl)
        .padding(.bottom, WingtipSpace.md)
        // Allowed in Settings and back: on to the map.
        .onChange(of: ownShip.authorization) { _, now in if state == .askInSettings, WelcomeFoot.of(now) == .go { go() } }
    }

    private func button(_ title: LocalizedStringResource, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget)
        }
        .glassProminentButton()
        .accessibilityIdentifier(id)
    }
}

/// The welcome's foot by the position's permission: asked at the tap where
/// iOS has never asked, the app's Settings where it was refused, Let's Go
/// Flying alone where it is allowed.
enum WelcomeFoot: Equatable {
    case ask, askInSettings, go

    static func of(_ status: CLAuthorizationStatus) -> WelcomeFoot {
        switch status {
        case .notDetermined: .ask
        case .denied, .restricted: .askInSettings
        default: .go
        }
    }
}

/// The one tip after the first route, at the page toggle (MapSideButtons):
/// where the flight plan is, one tap away (the web's FplTip). TipKit's own
/// popover, shown once.
struct FplTip: Tip {
    /// A route made: the tip may show.
    @Parameter static var routed: Bool = false

    var title: Text { Text("Your flight plan is one tap away") }
    var message: Text? { Text("Route, nav log, profile and brief, like your EFB. Tap here any time.") }
    var rules: [Rule] { [#Rule(Self.$routed) { $0 }] }
    var options: [any TipOption] { [Tips.MaxDisplayCount(1)] }
}
