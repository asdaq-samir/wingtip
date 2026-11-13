import SwiftUI

/// What can be done at a point of the route, in one order and one set of
/// words wherever its menu is (the web app's PointMenuItems): Direct To,
/// Set Altitude, a fix off it, a hold, Remove.
struct RoutePointMenu: View {
    @Environment(FlightUI.self) private var flightUI
    @Environment(Navigator.self) private var nav
    @Environment(\.appCommand) private var appCommand
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    let ident: String
    /// Where it is in the route: the departure, a stop or the destination.
    var role: Role = .stop

    enum Role { case departure, stop, destination }

    var body: some View {
        Menu {
            Text(ident)
            // Its card first, for its weather, frequencies, runways and
            // approaches (tap what you see, docs/navigation.md); the
            // destination's Brief beside it.
            Button { appCommand(.weather(ident: ident)) } label: { Label("More Info", systemImage: "info.circle") }
            if role == .destination {
                Button { appCommand(.open(.brief)) } label: { Label("Brief", systemImage: "checklist") }
            }
            if role != .departure {
                Button {
                    if plan.extras.direct == ident { plan.cancelDirect() } else { plan.directTo(ident, from: dryRun.fix ?? ownShip.fix) }
                } label: {
                    Label(plan.extras.direct == ident ? "Fly as Planned" : "Direct To", systemImage: WingtipIcon.directTo)
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
        } label: {
            HStack {
                Text(ident).font(.body.monospaced()).foregroundStyle(.primary)
                Spacer()
                if let feet = plan.extras.altitudes[ident.uppercased()] {
                    Text(Format.altitude(Double(feet))).font(.footnote.monospacedDigit()).foregroundStyle(.tint)
                }
                if plan.hold(at: ident) != nil { Image(systemName: WingtipIcon.holdHere).foregroundStyle(.tint) }
                if plan.extras.direct == ident { Image(systemName: "arrow.up.right").foregroundStyle(.tint) }
                Image(systemName: WingtipIcon.more).foregroundStyle(.tint)
            }
        }
        .accessibilityLabel(spoken)
    }

    /// The row's glyphs in words: "KHIB, four thousand five hundred feet,
    /// hold set, flown direct: more".
    private var spoken: String {
        var parts = [ident]
        if let feet = plan.extras.altitudes[ident.uppercased()] { parts.append(Format.spokenAltitude(Double(feet))) }
        if plan.hold(at: ident) != nil { parts.append("hold set") }
        if plan.extras.direct == ident { parts.append("flown direct") }
        return parts.joined(separator: ", ") + ": more"
    }
}
