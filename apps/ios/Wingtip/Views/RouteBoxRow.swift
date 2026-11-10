import SwiftUI

/// The route box's last row, as the web's (RouteControls, the owner's of
/// 2026-11-09: the iPhone's FPL matches the web): the airplane and its
/// cruise altitude, then the route's buttons -- Profile, Brief and the
/// route's ••• menu, which holds the nav log (docs/decisions/0029) and
/// Clear. The buttons carry their words (docs/design/icons.md, "Small
/// buttons have words": the audit's item 12 found two bare glyphs), and
/// their glyphs are the shared concept table's. Where one line does not
/// hold them at the pilot's text size, the buttons take a line of their
/// own under the airplane, as the web's row wraps.
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
        ViewThatFits(in: .horizontal) {
            HStack(spacing: WingtipSpace.sm) { airplane; Spacer(minLength: 0); buttons }
            VStack(alignment: .leading, spacing: WingtipSpace.md) {
                airplane
                HStack(spacing: WingtipSpace.sm) { Spacer(minLength: 0); buttons }
            }
        }
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
                .contentShape(Rectangle().inset(by: -12))
                .accessibilityLabel("No airplane picked")
                .accessibilityHint("Pick one for the time, fuel and groundspeed")
            }
            TextField(Format.cruiseAltitude(plan.altitudeFt), text: $altitude)
                .borderedField().keyboardType(.numberPad).font(WingtipType.row.monospaced())
                .frame(width: altitudeWidth).multilineTextAlignment(.trailing)
                .focused(focused, equals: .altitude)
                .onSubmit(fly)
                .accessibilityLabel("Cruise altitude, hundreds of feet")
                .accessibilityValue(plan.altitudeFt.map { Format.spokenAltitude($0) } ?? "the planner's pick")
        }
        .fixedSize()
    }

    private var buttons: some View {
        HStack(spacing: WingtipSpace.sm) {
            // The profile, marked where the pilot's own altitude breaks a
            // limit: in the glyph too, for a pilot who does not see the colour.
            let cautioned = !(plan.altitude?.cautions?.isEmpty ?? true)
            Button { open(.profile) } label: {
                Label("Profile", systemImage: cautioned ? "exclamationmark.triangle.fill" : WingtipIcon.profile)
            }
            .tint(cautioned ? WingtipInk.caution : nil)
            .accessibilityLabel(cautioned ? "Profile, your altitude has a caution" : "Profile")
            // The AI brief, marked where the planner says VFR is not
            // recommended.
            let notRecommended = !(plan.briefing?.vfrNotRecommended?.isEmpty ?? true)
            Button { open(.brief) } label: {
                Label("Brief", systemImage: notRecommended ? "exclamationmark.octagon.fill" : WingtipIcon.brief)
            }
            .tint(notRecommended ? WingtipInk.problem : nil)
            .accessibilityLabel(notRecommended ? "Brief, VFR flight not recommended" : "Brief")
            more
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .labelStyle(.titleAndIcon)
        .fixedSize()
    }

    /// The route's menu: the nav log and Clear (the web's ••• keeps them
    /// with Share; here Share has the bar's left, the owner's of 2026-11-09).
    /// Clear asks nothing: "Route cleared · Undo" follows it (UndoBar), the
    /// owner's warn-never-limit.
    private var more: some View {
        Menu {
            Button { open(.navlog) } label: { Label("Nav Log", systemImage: WingtipIcon.navLog) }
                .disabled(plan.legs.isEmpty)
            Divider()
            Button(role: .destructive) { plan.clear() } label: { Label("Clear Route", systemImage: WingtipIcon.close) }
        } label: {
            Image(systemName: WingtipIcon.more)
        }
        .accessibilityLabel("More")
    }
}
