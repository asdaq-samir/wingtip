import SwiftUI

/// The route's card at the top of the plan, right under the one search
/// (the owner's decision of 2026-11-10, the one-row header, as Apple
/// Maps puts its place under the field): the route and whether it is
/// ready to fly, with the route's ••• and its ✕ at its right, the figures
/// in one line -- distance, time, fuel, altitude and the airplane -- then
/// Brief, Nav Log and File, as the web's tab bar and its File button
/// (the owner, 2026-11-21). The ••• is More, the web's three: Route
/// Options, Share Link and Open in ForeFlight; the nav log's own Share
/// holds the rest of the sharing (ShareMenu). The ✕ clears the route,
/// asked first in the system's alert (the owner, 2026-11-20). The
/// Profile is the cruise altitude's button and the airplane's the
/// N-number's (RouteBoxRow); the map's choices are Map Settings'.
struct RouteCard: View {
    @Environment(Navigator.self) private var nav
    @Environment(Plan.self) private var plan
    /// A page of the plan's: a card on the iPhone, the inspector on the iPad.
    let open: (Screen) -> Void
    @Environment(ReadyToFly.self) private var ready
    @State private var clearing = false

    var body: some View {
        Section {
            HStack(alignment: .firstTextBaseline, spacing: WingtipSpace.sm) {
                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                    Text(plan.idents.joined(separator: " → ")).font(.headline)
                        .accessibilityIdentifier("route-card-title")
                    // The engine's Ready to Fly line (ReadyToFly), as the
                    // Brief's section heads with it.
                    if let answer = ready.answer {
                        Label(answer.line, systemImage: FindingStyle.symbol(answer.finding))
                            .font(WingtipType.detail).foregroundStyle(FindingStyle.colour(answer.finding))
                    }
                }
                Spacer(minLength: 0)
                RouteMoreMenu(open: open)
                clear
            }
            Text(figures).font(WingtipType.detail.monospacedDigit()).foregroundStyle(.secondary)
                .accessibilityLabel(spokenFigures)
            // What the figures lack of the airplane, asked in place.
            if plan.airplaneChosen { AskFigureRow(needs: [.fuelTotals, .climb]) }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: WingtipSpace.sm) { brief; navLog; file }
                VStack(alignment: .leading, spacing: WingtipSpace.sm) { brief; navLog; file }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .labelStyle(.titleAndIcon)
        }
        .alert("Clear Route?", isPresented: $clearing) {
            Button("Clear Route", role: .destructive) { plan.clear() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The route, its stops and what was set on it go. Shake to undo.")
        }
    }

    /// The ✕: one tap asks, in the centred alert, and the page stays.
    private var clear: some View {
        Button { clearing = true } label: {
            Label("Clear Route", systemImage: WingtipIcon.close).labelStyle(.iconOnly).imageScale(.large).hitArea()
        }
        .buttonStyle(.borderless)
        .accessibilityIdentifier("route-clear")
    }

    // MARK: The figures line

    /// "61.0 nm · 42m · 9.1 gal · FL-045 · N123AB": the time and the fuel
    /// only with an airplane picked, none assumed (docs/decisions/0011).
    private var figures: String {
        let distance = plan.totals?.distanceNm ?? plan.course?.distanceNm
        var parts = [distance.map { Format.distance($0) } ?? Format.none]
        if plan.airplaneChosen, let totals = plan.totals {
            parts.append(totals.eteMin.map(Format.duration) ?? Format.none)
            parts.append(Format.fuel(totals.fuelGal))
        }
        parts.append(Format.cruiseAltitude(plan.altitudeFt))
        parts.append(plan.airplaneName ?? "No airplane")
        return parts.joined(separator: " · ")
    }

    private var spokenFigures: String {
        let distance = plan.totals?.distanceNm ?? plan.course?.distanceNm
        var parts = [distance.map(SpokenFigures.nauticalMiles) ?? "distance not known"]
        if plan.airplaneChosen, let totals = plan.totals {
            if let minutes = totals.eteMin { parts.append(SpokenFigures.minutes(minutes)) }
            if let gallons = totals.fuelGal { parts.append(SpokenFigures.gallons(gallons)) }
        }
        parts.append(plan.altitudeFt.map { Format.spokenAltitude($0) } ?? "the planner's altitude")
        parts.append(plan.airplaneName ?? "no airplane picked")
        return parts.joined(separator: ", ")
    }

    // MARK: The buttons

    /// The AI brief, marked where the planner says VFR is not recommended,
    /// in the glyph too for a pilot who does not see the colour.
    private var brief: some View {
        let notRecommended = !(plan.briefing?.vfrNotRecommended?.isEmpty ?? true)
        return Button { open(.brief) } label: {
            Label("Brief", systemImage: notRecommended ? "exclamationmark.octagon.fill" : WingtipIcon.brief)
        }
        .hitArea()
        .tint(notRecommended ? WingtipInk.problem : nil)
        .accessibilityLabel(notRecommended ? "Brief, VFR flight not recommended" : "Brief")
    }

    private var navLog: some View {
        Button { open(.navlog) } label: { Label("Nav Log", systemImage: WingtipIcon.navLog) }
            .hitArea()
            .disabled(plan.legs.isEmpty)
    }

    /// Filing with Flight Service, a button of its own beside the two (the
    /// owner, 2026-11-21: "File flight plan should be a separate button
    /// next to tabs"), greyed until the nav log is in.
    private var file: some View {
        Button { nav.open(.flight("file")) } label: { Label("File", systemImage: WingtipIcon.send) }
            .hitArea()
            .disabled(plan.legs.isEmpty)
            .accessibilityLabel("File flight plan")
            .accessibilityIdentifier("route-file")
    }
}
