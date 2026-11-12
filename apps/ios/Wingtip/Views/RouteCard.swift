import SwiftUI

/// The route's card at the top of the plan, right under the one search
/// (the owner's decision of 2026-11-10, the one-row header, as Apple
/// Maps puts its place under the field): the route and whether it is
/// ready to fly with the route's ••• at its right, the figures in one
/// line -- distance, time, fuel, altitude and the airplane -- then Brief,
/// Nav Log and Airplane. The bar it replaces held Share, Saved Flights and
/// Undo; they are in the ••• now, with the profile and Clear, and Undo
/// stays on shake and the Edit menu (UndoManager).
struct RouteCard: View {
    @Environment(Navigator.self) private var nav
    @Environment(Plan.self) private var plan
    @Environment(\.undoManager) private var undoManager
    /// A page of the plan's: a card on the iPhone, the inspector on the iPad.
    let open: (Screen) -> Void
    @Environment(ReadyToFly.self) private var ready

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
                more
            }
            Text(figures).font(WingtipType.detail.monospacedDigit()).foregroundStyle(.secondary)
                .accessibilityLabel(spokenFigures)
            // What the figures lack of the airplane, asked in place.
            if plan.airplaneChosen { AskFigureRow(needs: [.fuelTotals, .climb]) }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: WingtipSpace.sm) { brief; navLog; airplane }
                VStack(alignment: .leading, spacing: WingtipSpace.sm) { brief; navLog; airplane }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .labelStyle(.titleAndIcon)
        }
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

    /// The airplane flown: its profile by its N-number, else the Airplane
    /// page to pick one.
    private var airplane: some View {
        Button {
            if let tail = plan.tail { nav.open(.tail(ProfileAsk(tail: tail))) } else { open(.airplane) }
        } label: {
            Label("Airplane", systemImage: WingtipIcon.airplane)
        }
        .hitArea()
        .accessibilityHint(plan.airplaneChosen ? "Its profile" : "Pick one for the time, fuel and groundspeed")
    }

    // MARK: The route's •••

    /// The profile, marked where the pilot's altitude breaks a limit; the
    /// saved flights, Share and Undo from the bar this card replaced; and
    /// Clear, which asks nothing: Undo takes it back (warn, never limit).
    private var more: some View {
        let cautioned = !(plan.altitude?.cautions?.isEmpty ?? true)
        let _ = UndoWatch.shared.changes
        return ShareMenu(rows: Group {
            Button { open(.profile) } label: {
                Label(cautioned ? "Profile, Altitude Caution" : "Profile", systemImage: cautioned ? "exclamationmark.triangle.fill" : WingtipIcon.profile)
            }
            Button { open(.flights) } label: { Label("Saved Flights", systemImage: "tray.full") }
        }, more: Group {
            if let undoManager, undoManager.canUndo {
                Button { undoManager.undo() } label: {
                    Label(undoManager.undoActionName.isEmpty ? "Undo" : "Undo \(undoManager.undoActionName)", systemImage: "arrow.uturn.backward")
                }
            }
            Divider()
            Button(role: .destructive) { plan.clear() } label: { Label("Clear Route", systemImage: WingtipIcon.close) }
        }, label: Image(systemName: WingtipIcon.more).imageScale(.large).hitArea())
            .accessibilityIdentifier("route-more")
    }
}
