import SwiftUI

/// The flight's own work while the map is up, beside the root view rather
/// than in it: the traffic and the airplanes tracked asked again, the
/// in-flight copilot and the ATC copilot, the alerts ahead said aloud,
/// the flight logged once landed, and each fix asked of the engine for
/// the instruments, the strip and the glide ring.
struct FlightLoops: ViewModifier {
    /// The flight (FlightSession) the loops keep going.
    @Environment(FlightSession.self) private var flight
    @Environment(Copilot.self) private var copilot
    @Environment(AtcCopilot.self) private var atc
    @Environment(ClearanceListener.self) private var listener
    @Environment(Emergency.self) private var emergency
    /// The ATC Copilot's switch in Settings' Extras: turned off, listening stops.
    @AppStorage(Extra.atcCopilot.key) private var atcCopilot = false

    func body(content: Content) -> some View {
        let (plan, ownShip, dryRun, traffic) = (flight.plan, flight.ownShip, flight.dryRun, flight.traffic)
        let (verdict, tracking, inFlight) = (flight.verdict, flight.tracking, flight.inFlight)
        return content
            // About own ship's real fix, never the dry run's: the traffic near
            // it is told in a notification (Traffic.tellNear).
            .task { await traffic.run { [ownShip] in ownShip.fix } }
            // The airplane tracked, its reports from the map's answers and its
            // own; the watches set; the alerts ahead said aloud where asked.
            .task { await tracking.run() }
            // The in-flight copilot looks again every few seconds while flying
            // with a route (Copilot): own ship's fix or the dry run's. On
            // Repeating's clock, its wakes let fall in with the other loops'.
            .task {
                await Repeating.every(3) {
                    await copilot.look(fix: dryRun.fix ?? ownShip.fix, flying: inFlight.underway, plan: plan,
                                       ahead: ownShip.ahead, minimums: verdict.minimums)
                }
            }
            .onChange(of: traffic.planes) { _, planes in tracking.heard(planes) }
            .onChange(of: ownShip.ahead) { _, alerts in flight.spoken.hear(alerts) }
            // The ATC copilot: each settled transmission read, the radio listened to while flying where turned on.
            .onChange(of: listener.heard) { _, heard in atc.observe(heard, tail: plan.tail) }
            .task(id: "\(inFlight.underway)|\(plan.tail ?? "")|\(atc.mode.rawValue)|\(atcCopilot)") {
                await atc.follow(flying: inFlight.underway, tail: plan.tail)
            }
            .modifier(AutoLogbookHost()) // The flight logged from its track once landed and at rest.
            .modifier(AirplaneHost()) // The airplanes' figures in step with the sign-in (Airplane/).
            // Each fix, own ship's or the dry run's airplane, asked of the
            // engine once for the instruments, the strip and the glide ring
            // (InFlight); again when the route changes under it.
            // Own ship's flying speed as OwnShip already asked it of this
            // fix (hazardFix), not asked of the engine a second time.
            .onChange(of: dryRun.fix ?? ownShip.fix, initial: true) { _, fix in
                inFlight.took(fix, plan: plan, emergency: emergency.open != nil, underway: dryRun.fix == nil ? ownShip.hazardFix?.underway : nil)
            }
            .onChange(of: plan.course) { _, _ in
                inFlight.took(dryRun.fix ?? ownShip.fix, plan: plan, emergency: emergency.open != nil,
                              underway: dryRun.fix == nil ? ownShip.hazardFix?.underway : nil)
            }
            // The route's line for the packs read ahead (regions_ahead).
            .onChange(of: plan.course, initial: true) { _, course in ownShip.routeLine = course?.coordinates.map { [$0.latitude, $0.longitude] } }
            .onChange(of: ownShip.groundFt) { _, ft in inFlight.terrainFt = ft }
            // The screen kept on while flying, as EFBs keep it in flight
            // (the web's Screen Wake Lock, the in-flight audit's Q2, owner
            // rec 16): a phone that dimmed and locked on its own timer took
            // the map and the copilot's voice with it. Let go on the ground,
            // where iOS's own timer dims it again.
            .onChange(of: inFlight.underway && dryRun.fix == nil, initial: true) { _, flying in
                UIApplication.shared.isIdleTimerDisabled = flying
            }
    }
}
