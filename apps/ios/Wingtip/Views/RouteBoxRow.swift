import SwiftUI

/// The route's airplane and cruise altitude, in the route's section
/// under the route card (RouteCard), whose Brief, Nav Log, Airplane and
/// ••• took the row's buttons (the owner's one-row header, 2026-11-10).
struct RouteBoxRow: View {
    @Environment(Plan.self) private var plan
    /// A page of the plan's: pushed on the iPhone, the inspector on the iPad.
    let open: (Screen) -> Void

    var body: some View {
        airplane
    }

    /// The airplane and the cruise altitude, written FL-045 (docs/decisions/
    /// 0009): the altitude a button to the Profile, its slider and Altitude
    /// Advisor the one place the cruise is set (one control, one source of
    /// truth; a typed field here was a second).
    private var airplane: some View {
        HStack(spacing: WingtipSpace.sm) {
            if let tail = plan.tail {
                // The N-number opens its profile (the owner, 2026-11-09).
                TailButton(tail: tail) { Text(tail).font(WingtipType.row.monospaced()) }
            } else if let name = plan.airplaneName {
                Text(name).font(WingtipType.row.monospaced())
            } else {
                // No airplane picked: the chip asks for one, tinted as a
                // tap is, rather than flying a type unasked (docs/decisions/0011).
                Button { open(.airplane) } label: {
                    Label("Airplane", systemImage: WingtipIcon.airplane)
                }
                .font(WingtipType.row)
                // Its own tap in the row, the tint's blue, and a 44-point
                // area round the words without the chip growing (HIG).
                .buttonStyle(.borderless)
                .hitArea()
                .accessibilityLabel("No airplane picked")
                .accessibilityHint("Pick one for the time, fuel and groundspeed")
            }
            Button { open(.profile) } label: {
                Text(Format.cruiseAltitude(plan.altitudeFt)).font(WingtipType.row.monospaced())
            }
            .buttonStyle(.borderless)
            .hitArea()
            .accessibilityLabel("Cruise altitude")
            .accessibilityValue(plan.altitudeFt.map { Format.spokenAltitude($0) } ?? "the planner's pick")
            .accessibilityHint("Opens the profile and the Altitude Advisor")
            .accessibilityIdentifier("route-cruise")
            Spacer(minLength: 0)
        }
    }
}
