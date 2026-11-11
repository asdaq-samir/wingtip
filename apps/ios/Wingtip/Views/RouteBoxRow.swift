import SwiftUI

/// The route's airplane and cruise altitude, in the route's section
/// under the route card (RouteCard), whose Brief, Nav Log, Airplane and
/// ••• took the row's buttons (the owner's one-row header, 2026-11-10).
struct RouteBoxRow: View {
    @Environment(Plan.self) private var plan
    @Binding var altitude: String
    var focused: FocusState<PlanView.Field?>.Binding
    /// A page of the plan's: pushed on the iPhone, the inspector on the iPad.
    let open: (Screen) -> Void
    let fly: () -> Void
    /// "FL-045" fits at the larger sizes too.
    @ScaledMetric(relativeTo: .body) private var altitudeWidth = 92.0

    var body: some View {
        airplane
    }

    /// The airplane and the altitude: the planner's pick until one is
    /// typed, in hundreds of feet, written FL-045 (docs/decisions/0009);
    /// cleared, the planner's again.
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
            TextField(Format.cruiseAltitude(plan.altitudeFt), text: $altitude)
                .textFieldStyle(.plain).keyboardType(.numberPad).font(WingtipType.row.monospaced())
                .frame(width: altitudeWidth).multilineTextAlignment(.trailing)
                .focused(focused, equals: .altitude)
                .onSubmit(fly)
                .accessibilityLabel("Cruise altitude, hundreds of feet")
                .accessibilityValue(plan.altitudeFt.map { Format.spokenAltitude($0) } ?? "the planner's pick")
            Spacer(minLength: 0)
        }
    }
}
