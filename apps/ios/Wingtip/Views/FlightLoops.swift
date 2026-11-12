import SwiftUI

/// The flight's own work while the map is up, beside the root view rather
/// than in it: the traffic and the airplanes tracked asked again, the
/// in-flight copilot and the ATC copilot, the alerts ahead said aloud,
/// the flight logged once landed, and each fix asked of the engine for
/// the instruments, the strip and the glide ring.
struct FlightLoops: ViewModifier {
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    @Environment(Traffic.self) private var traffic
    @Environment(Verdict.self) private var verdict
    @Environment(Tracking.self) private var tracking
    @Environment(InFlight.self) private var inFlight
    @Environment(Copilot.self) private var copilot
    @Environment(AtcCopilot.self) private var atc
    @Environment(ClearanceListener.self) private var listener

    func body(content: Content) -> some View {
        content
            // About own ship's real fix, never the dry run's: the traffic near
            // it is told in a notification (Traffic.tellNear).
            .task { await traffic.run { [ownShip] in ownShip.fix } }
            // The airplane tracked, its reports from the map's answers and its
            // own; the watches set; the alerts ahead said aloud where asked.
            .task { await tracking.run() }
            // The in-flight copilot looks again every few seconds while flying
            // with a route (Copilot): own ship's fix or the dry run's.
            .task {
                while !Task.isCancelled {
                    await copilot.look(fix: dryRun.fix ?? ownShip.fix, flying: inFlight.underway, plan: plan,
                                       ahead: ownShip.ahead, minimums: verdict.minimums)
                    try? await Task.sleep(for: .seconds(3))
                }
            }
            .onChange(of: traffic.planes) { _, planes in tracking.heard(planes) }
            .onChange(of: ownShip.ahead) { _, alerts in SpokenAlerts.shared.hear(alerts) }
            // The ATC copilot: each settled transmission read, the radio listened to while flying where turned on.
            .onChange(of: listener.heard) { _, heard in atc.observe(heard, tail: plan.tail) }
            .task(id: "\(inFlight.underway)|\(plan.tail ?? "")|\(atc.mode.rawValue)") {
                await atc.follow(flying: inFlight.underway, tail: plan.tail)
            }
            .modifier(AutoLogbookHost()) // The flight logged from its track once landed and at rest.
            .modifier(AirplaneHost()) // The airplanes' figures in step with the sign-in (Airplane/).
            // Each fix, own ship's or the dry run's airplane, asked of the
            // engine once for the instruments, the strip and the glide ring
            // (InFlight); again when the route changes under it.
            .onChange(of: dryRun.fix ?? ownShip.fix, initial: true) { _, fix in inFlight.took(fix, plan: plan) }
            .onChange(of: plan.course) { _, _ in inFlight.took(dryRun.fix ?? ownShip.fix, plan: plan) }
            .onChange(of: ownShip.groundFt) { _, ft in inFlight.terrainFt = ft }
    }
}
