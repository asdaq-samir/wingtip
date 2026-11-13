import SwiftUI

/// What Siri, a Shortcut, a link or a tap in a card asked for (AppCommand),
/// done by the root view once it is on the screen (CommandHost): its own file, so the root view
/// stays the map and its sheet.
extension RootView {
    /// A route to the field, from the route's departure, else from the
    /// field nearest the airplane, as the airport card's Fly Here does
    /// (Plan.flyHere); with neither, the plan with the destination in for
    /// the pilot to give the departure.
    func route(to ident: String) async {
        await flight.plan.flyHere(ident, near: flight.ownShip.fix)
        showPlan()
    }

    /// Siri's or a Shortcut's command done in the app: a trip planned to
    /// the field, its Brief, direct to a place, the nearest airports, a
    /// field's card; then the screen a link or a card named after it.
    func apply(_ command: AppCommand, then next: Screen? = nil) async {
        defer { if let next { openScreen(next) } }
        let (plan, ownShip) = (flight.plan, flight.ownShip)
        switch command {
        case .planTo(let ident):
            await route(to: ident)
        case .brief(let ident):
            // The route planned as "plan a trip to" plans it, then its
            // Brief opened: in the inspector on the iPad, a page over the
            // plan, or the strip's own page (BriefAsk).
            await route(to: ident)
            openBrief()
        case .directTo(let said):
            // The place found near the route as a clearance's is (the
            // radio's Direct To does the same); not on the route, a
            // diversion to it from where the airplane is.
            var points: [(Double, Double)] = []
            if let course = plan.course {
                points += [(course.departure.lat, course.departure.lon), (course.destination.lat, course.destination.lon)]
            }
            if let fix = ownShip.fix { points.append((fix.coordinate.latitude, fix.coordinate.longitude)) }
            let near = points.map { String(format: "%.3f,%.3f", $0.0, $0.1) }.joined(separator: ";")
            let found = try? await Planner.clearancePlaces(ClearanceAsk(near: near, route: [said]))
            guard let ident = found?.route?.first?.first(where: { $0.ident != nil })?.ident ?? (IntentLookups.looksLikeIdent(said) ? said.uppercased() : nil) else { return }
            if plan.routed, plan.idents.contains(ident) {
                plan.directTo(ident, from: ownShip.fix)
            } else if let fix = ownShip.fix {
                plan.divert(to: ident, from: fix)
            } else {
                plan.dest = ident
                plan.plan()
            }
            showPlan()
        case .nearest:
            openScreen(.nearest)
        case .weather(let ident):
            open(ident)
        case .planRoute(let dep, let stops, let dest):
            // A route shared from the site, planned here as it was there.
            plan.dep = dep; plan.stops = stops; plan.dest = dest
            showPlan()
            plan.plan()
        case .aircraft(let hex):
            // The airplane's card, tracked from its next report on.
            flight.tracking.track(hex)
            nav.open(.traffic(hex.lowercased()))
        case .open(let screen):
            openScreen(screen)
        case .fly(let tail):
            await fly(tail)
        case .approach(let pick):
            approach(pick)
        case .airplane(let tail):
            nav.open(.tail(ProfileAsk(tail: tail.uppercased())))
        case .keepForAir:
            keepForAir()
        case .sharedFlight(let link):
            // Shown, not planned: the pilot's own plan stays until they
            // tap Use This Plan.
            screens.sharedFlight.open(link)
        case .track(let url):
            // A GPX or KML file handed over from Files or Mail: its track
            // flown again on the map (Replay), at the replay's pace, as a
            // saved flight's is from its card. A file with no timed points
            // is left alone; the card's own import says why.
            let reading = url.startAccessingSecurityScopedResource()
            defer { if reading { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url), let points = try? GPXTrack.points(data), !points.isEmpty else { return }
            replay.load(Replay.points(points), key: url.lastPathComponent)
            replay.play()
            if detent != RootView.pill { detent = RootView.pill }
        }
    }

    /// The route's Brief: the strip's own page there (BriefAsk), else its
    /// card (the iPad's inspector).
    func openBrief() {
        if layout == .sheet, layoutName == "strip" {
            screens.briefAsk.ask()
        } else {
            nav.open(.screen(.brief))
        }
    }
}
