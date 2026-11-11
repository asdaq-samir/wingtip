import SwiftUI

/// The Map's Glide Ring: the still-air glide ring about own ship kept on
/// outside an emergency, where the pilot wants it (the owner, 2026-11-09:
/// off by default, on by itself in the emergency assistant). Drawn at the
/// picked airplane's own glide ratio alone (InFlight.ringRatio), so the
/// switch is off and says why with no airplane or no glide ratio.
struct GlideRingToggle: View {
    @Environment(Plan.self) private var plan
    @AppStorage(InFlight.ringKey) private var on = false

    var body: some View {
        let why = Self.unavailable(plan: plan)
        Toggle(isOn: Binding(get: { on && why == nil }, set: { on = $0 })) {
            Text("Glide Ring")
            Text(why ?? "Shown in an emergency whatever this says")
        }
        .disabled(why != nil)
    }

    /// Why the ring cannot be drawn for the plan's airplane; nil where it can.
    static func unavailable(plan: Plan, airplanes: Airplanes = .shared) -> String? {
        guard plan.airplaneChosen else { return "Pick an airplane: the ring is its own glide" }
        guard airplanes.value(.glideRatio, plan: plan) != nil else {
            return "\(plan.airplaneName ?? "This airplane") has no glide ratio: add it in its profile"
        }
        return nil
    }
}

#Preview("GlideRingToggle") {
    List { GlideRingToggle() }
        .environment(Plan())
}
