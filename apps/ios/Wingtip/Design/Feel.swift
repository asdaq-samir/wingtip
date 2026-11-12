import Observation
import SwiftUI

/// The taps a pilot feels on a key action, one token each (WingtipHaptic,
/// design/tokens.json's haptic group): an altitude set, Direct To or Fly
/// Here taken, an alert or a copilot warning shown, a point held on the
/// map. Whatever does the
/// action counts it here, a model or a view alike; FeelHost, on the root,
/// plays it. Whether it is felt is the system's own haptics switch's to
/// say: a tap is not motion, so Reduce Motion leaves it be.
@MainActor
@Observable
final class Feel {
    static let shared = Feel()

    enum Kind { case altitude, directTo, warning, held }

    private(set) var altitude = 0
    private(set) var directTo = 0
    private(set) var warning = 0
    private(set) var held = 0

    static func tap(_ kind: Kind) {
        switch kind {
        case .altitude: shared.altitude += 1
        case .directTo: shared.directTo += 1
        case .warning: shared.warning += 1
        case .held: shared.held += 1
        }
    }
}

/// Plays Feel's taps, and counts a warning as an alert ahead or the
/// copilot's message comes onto the map. In Native (Look.isStock) only the
/// warning is felt: the altitude, Direct To and held taps are the brand's
/// feel, which an app out of the box does not have, while a warning carries
/// a safety meaning, as the caution colours do.
struct FeelHost: ViewModifier {
    @Environment(Copilot.self) private var copilot
    @Environment(OwnShip.self) private var ownShip
    @AppStorage(Look.key) private var look = Look.standard.rawValue
    @Environment(Feel.self) private var feel

    func body(content: Content) -> some View {
        let brand = !(Look(rawValue: look) ?? .standard).isStock
        content
            .sensoryFeedback(WingtipHaptic.altitude, trigger: feel.altitude) { _, _ in brand }
            .sensoryFeedback(WingtipHaptic.directTo, trigger: feel.directTo) { _, _ in brand }
            .sensoryFeedback(WingtipHaptic.warning, trigger: feel.warning)
            // A point held on the map, Maps' pin drop: the medium tap the
            // map's UIKit generator gave it, the direct-to token's weight,
            // since the point's card offers Direct To first.
            .sensoryFeedback(WingtipHaptic.directTo, trigger: feel.held) { _, _ in brand }
            // A new alert ahead, not the same ones asked again.
            .onChange(of: ownShip.ahead.map(\.id)) { was, now in
                if !Set(now).subtracting(was).isEmpty { Feel.tap(.warning) }
            }
            .onChange(of: copilot.message?.title) { _, now in
                if now != nil { Feel.tap(.warning) }
            }
    }
}
