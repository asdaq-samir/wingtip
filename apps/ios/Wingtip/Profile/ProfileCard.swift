import SwiftUI

/// The route from the side, ForeFlight's way (the owner's spec of
/// 2026-11-10): the ground and the airspace under the line, an upright
/// slider beside it that previews an altitude -- the ground coloured live
/// by how close it comes -- with Set to fly it and, in flight, Auto to
/// follow the airplane's own altitude; a tap on a waypoint for that leg's
/// altitude (LegAltitudePopover); the Altitude Advisor's rows to choose
/// the cruise from; then the altitude's cautions and reasons. The state is
/// ProfileModel's; every figure the engine's (ProfileRules).
struct ProfileCard: View {
    @Environment(ReadyToFly.self) private var ready
    @Environment(FlightUI.self) private var flightUI
    @Environment(Plan.self) private var plan
    @Environment(DryRun.self) private var dryRun
    @State private var model = ProfileModel()
    @AppStorage(FlightRules.key) private var rules: FlightRules = .vfr
    /// The side view's height, growing with the pilot's text size.
    @ScaledMetric(relativeTo: .body) private var chartHeight = 220.0

    @Environment(InFlight.self) private var flight
    private var airplaneFt: Double? { flight.underway ? flight.fix?.altitudeFt : nil }

    private var advisor: Result<[ProfileRules.AdvisorRow], any Error> {
        Result { try ProfileRules.advisor(plan.altitude, flownFt: plan.altitudeFt) }
    }

    private var rows: [ProfileRules.AdvisorRow] { (try? advisor.get()) ?? [] }

    private func clearance(_ ft: Double?) -> Result<ProfileRules.Clearance, any Error>? {
        guard let ft, let profile = plan.profile, !profile.terrain.isEmpty else { return nil }
        return Result { try ProfileRules.clearance(altitudeFt: ft, profile: profile, legs: plan.legs) }
    }

    var body: some View {
        let shown = model.shownFt(plan: plan, airplaneFt: airplaneFt)
        let clear = clearance(shown)
        List {
            Section {
                HStack(alignment: .center, spacing: 0) {
                    ProfileChart(profile: plan.profile, legs: plan.legs, previewFt: shown,
                                 clearance: try? clear?.get()) { model.waypoint = $0 }
                        .frame(height: chartHeight)
                        .popover(item: Binding(get: { model.waypoint.map(Pick.init) }, set: { model.waypoint = $0?.id })) { pick in
                            legPopover(pick.id)
                        }
                    AltitudeSlider(rows: rows.map(\.altitudeFt),
                                   previewFt: Binding(get: { shown ?? rows.last?.altitudeFt ?? 0 }, set: { model.preview($0) }),
                                   spoken: { ft in (try? clearance(ft)?.get())?.words ?? Format.spokenAltitude(ft) },
                                   length: chartHeight - WingtipSpace.lg)
                        .padding(.trailing, WingtipSpace.sm)
                }
                .listRowInsets(EdgeInsets())
                previewRow(shown, clear: clear)
                ProblemLine(plan.sideProblems[.profile])
                ProblemLine(dryRun.problem)
                ProblemLine(advisor, "The Altitude Advisor")
                if let clear { ProblemLine(clear, "The ground's clearance") }
            }
            Section("Cruise") {
                // The rules the route is planned under; planned again.
                Picker("Flight Rules", selection: $rules) {
                    ForEach(FlightRules.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .onChange(of: rules) { _, _ in plan.plan() }
                AltitudeAdvisorRows(rows: rows) { model.fly($0, plan: plan, rows: rows) }
            }
            ProfileReasons()
        }
        .navigationTitle(plan.altitudeFt.map { Format.cruiseAltitude($0) } ?? "Profile")
        .toolbar {
            // The dry run from the profile's corner, as the web app has it.
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    // Ready to fly over the start, once per flight, where
                    // something is missing; "Fly anyway" goes on with it.
                    Task {
                        await ready.beforeStart {
                            if let course = plan.course { dryRun.start(course: course, checkpoints: plan.checkpoints, legs: plan.legs) }
                        }
                    }
                } label: { Label("Dry run", systemImage: "play.fill") }
                    .disabled(plan.legs.isEmpty || plan.course == nil)
            }
        }
        // Half way as every card opens (the card rule's 2), the pilot's
        // drag choosing the size from there.
        .onAppear { takeAltitudeAt() }
        // A stop's "Set Altitude…" opens its popover here (RoutePointMenu).
        .onChange(of: flightUI.altitudeAt) { _, _ in takeAltitudeAt() }
        .onChange(of: plan.altitudeFt) { _, _ in model.previewFt = nil }
    }

    /// The point a stop's menu asked the altitude of, its popover put up
    /// and the ask cleared.
    private func takeAltitudeAt() {
        guard let ident = flightUI.altitudeAt else { return }
        flightUI.altitudeAt = nil
        model.waypoint = ident
    }

    /// The preview in words, Set where it differs from the plan's, and
    /// Auto in flight.
    private func previewRow(_ shown: Double?, clear: Result<ProfileRules.Clearance, any Error>?) -> some View {
        HStack(spacing: WingtipSpace.sm) {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text(shown.map { Format.cruiseAltitude($0) } ?? Format.none).font(WingtipType.row.monospaced())
                if let words = try? clear?.get().words { Text(words).font(.footnote).foregroundStyle(level(clear)) }
            }
            Spacer(minLength: 0)
            if airplaneFt != nil {
                Toggle("Auto", isOn: Binding(get: { model.auto }, set: { model.auto = $0; if $0 { model.previewFt = nil } }))
                    .toggleStyle(.button)
                    .accessibilityHint("Previews the airplane's own altitude")
            }
            Button("Set") { model.set(plan: plan, rows: rows) }
                .glassProminentButton()
                .disabled(!model.changed(plan: plan))
        }
        .accessibilityElement(children: .contain)
    }

    /// The words in the colour the ground is drawn: red, amber or plain.
    private func level(_ clear: Result<ProfileRules.Clearance, any Error>?) -> Color {
        switch try? clear?.get().level {
        case "red": Color(uiColor: WingtipColor.Chart.warning)
        case "yellow": WingtipInk.caution
        default: .secondary
        }
    }

    @ViewBuilder
    private func legPopover(_ ident: String) -> some View {
        let key = ident.uppercased()
        let own = plan.extras.altitudes[key]
        let leg = plan.legs.first { $0.from.uppercased() == key } ?? plan.legs.last { $0.to.uppercased() == key }
        LegAltitudePopover(ident: ident, rows: rows.map(\.altitudeFt), currentFt: own.map(Double.init) ?? leg?.altitudeFt,
                           own: own != nil, startMode: plan.extras.starts.contains(key) ? .startAt : .crossAt,
                           change: { ft, mode in Result { try ProfileRules.change(at: ident, toFt: ft, mode: mode, legs: plan.legs, airplane: plan.altitude?.aircraft) } }) { feet, mode in
            model.setLeg(ident, feet: feet, mode: mode, plan: plan)
        }
    }

    /// A waypoint's ident as a popover's item.
    private struct Pick: Identifiable { let id: String }
}
