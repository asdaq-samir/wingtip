import SwiftUI

/// What can be done at a point of the route, in one order and one set of
/// words wherever its menu is (the web app's PointMenuItems): its card,
/// Change, Direct To, Set Altitude, a fix off it, a hold, Remove. The
/// items of the menu FPL's timeline opens from the point's mark
/// (TimelineMark, RouteTimelineSection).
struct RoutePointActions: View {
    @Environment(FlightUI.self) private var flightUI
    @Environment(Navigator.self) private var nav
    @Environment(\.appCommand) private var appCommand
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    let ident: String
    /// Where it is in the route: the departure, a stop or the destination.
    var role: Role = .stop
    /// Change: the one search asked to pick another in its place
    /// (PointAsk); nil where it cannot be changed here.
    var change: (() -> Void)?

    enum Role { case departure, stop, destination }

    var body: some View {
        Text(ident)
        // Its card first, for its weather, frequencies, runways and
        // approaches (tap what you see, docs/navigation.md); the
        // destination's Brief beside it.
        Button { appCommand(.weather(ident: ident)) } label: { Label("More Info", systemImage: "info.circle") }
        if let change {
            Button(action: change) { Label(role == .stop ? "Change Stop…" : "Change…", systemImage: "arrow.triangle.swap") }
        }
        if role == .destination {
            Button { appCommand(.open(.brief)) } label: { Label("Brief", systemImage: "checklist") }
        }
        if role != .departure {
            Button {
                if plan.extras.direct == ident { plan.cancelDirect() } else { plan.directTo(ident, from: dryRun.fix ?? ownShip.fix) }
            } label: {
                Label(plan.extras.direct == ident ? String(localized: "Fly as Planned") : Wording.directTo, systemImage: WingtipIcon.directTo)
            }
            // The Profile, open on this point's Start At / Cross At
            // popover: the app's one altitude control.
            Button {
                flightUI.altitudeAt = ident
                appCommand(.open(.profile))
            } label: {
                Label(plan.extras.altitudes[ident.uppercased()].map { "Set Altitude… (\(Format.altitude(Double($0))))" } ?? "Set Altitude…", systemImage: "arrow.up.and.down")
            }
        }
        Button { flightUI.fixFrom = ident } label: { Label("Create a Fix from Here…", systemImage: "scope") }
        Button { nav.push(.hold(ident)) } label: {
            Label(plan.hold(at: ident) == nil ? "Hold Here…" : "Change Hold…", systemImage: WingtipIcon.holdHere)
        }
        if role == .stop {
            Divider()
            Button(role: .destructive) {
                plan.stops.removeAll { $0 == ident }
                plan.plan()
            } label: { Label("Remove", systemImage: "trash") }
        }
    }

    /// The point's marks in words, for its menu's name: "KHIB, four
    /// thousand five hundred feet, hold set, flown direct".
    static func spoken(_ ident: String, plan: Plan) -> String {
        var parts = [ident]
        if let feet = plan.extras.altitudes[ident.uppercased()] { parts.append(Format.spokenAltitude(Double(feet))) }
        if plan.hold(at: ident) != nil { parts.append("hold set") }
        if plan.extras.direct == ident { parts.append("flown direct") }
        return parts.joined(separator: ", ")
    }
}
