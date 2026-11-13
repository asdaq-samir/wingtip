import SwiftUI

/// The commands Siri's newer intents leave (FlyAirplaneIntent,
/// BriefApproachIntent, KeepForAirIntent), done as
/// the screens' own buttons do them, in a file of their own so the root
/// view's stays the map's.
extension RootView {
    /// The route flown with the airplane, as its profile's Fly This
    /// Airplane picks it, then the plan shown.
    func fly(_ tail: String) async {
        let airplanes = Airplanes.shared
        await flight.plan.fly(tail: tail, own: airplanes.records, names: Array(airplanes.books.keys))
        showPlan()
    }

    /// The approach put on the route at its field (a stop or the
    /// destination; the destination where the field is not on the route
    /// yet), then its Brief opened, as the approach row's Brief does.
    func approach(_ pick: ProcedurePick) {
        let plan = flight.plan
        if !plan.idents.contains(pick.ident) {
            plan.dest = pick.ident
        }
        plan.pick(pick, kind: "approach", at: pick.ident)
        showPlan()
        openBrief()
    }

    /// The route kept for the air, as the plan's Keep for the Air button
    /// keeps it; where there is no route or no chart yet, the plan, whose
    /// button says why.
    func keepForAir() {
        showPlan()
        let ready = ReadyToFly.shared, plan = flight.plan
        guard plan.course != nil, let template = ready.charts?.template else { return }
        KeepForAir.shared.keep(plan: plan, template: template, minZoom: ready.charts?.base?.minZoom ?? 6,
                               verdict: ready.verdict, signedIn: ready.session?.signedIn ?? false)
    }
}
