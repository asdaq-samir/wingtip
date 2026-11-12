import SwiftUI

/// The Brief: the planner's briefing for the route in a flight service
/// briefer's order (AIM 7-1-5), each report as sent. "VFR flight not
/// recommended" first where the planner says so; then the hazards
/// (SIGMETs), the G-AIRMETs, the TFRs on the way, the PIREPs, the
/// forecast's lowest ceiling and visibility, and each station's METAR.
/// The Go / No-Go over it all is the planner's (POST /api/go-no-go, the
/// web app's lib/verdict on the planner), so no judgment is made on the
/// phone: each finding opens where the Brief says it.
struct BriefView: View {
    @Environment(BriefAsk.self) private var briefAsk
    @Environment(\.appCommand) private var appCommand
    @Environment(Plan.self) private var plan
    @Environment(Verdict.self) private var verdict
    @Environment(Session.self) private var session
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The briefing in words (Words.swift): the planner's, else this
    /// iPhone's; written again as the briefing changes.
    @State private var weatherWords: SaidWords?
    @State private var writingWords = false
    /// The AWC's forecast icing on each leg (ForecastIcing).
    @State private var icing = ForecastIcing()
    /// "When should I go?" (DepartureWindow).
    @State private var window = DepartureWindow()

    /// The first of the weather's parts the Brief has, where the weather's
    /// finding opens: VFR not recommended, the hazards, the G-AIRMETs, else
    /// the forecast.
    private func weatherPart(_ briefing: Briefing) -> String {
        if !(briefing.vfrNotRecommended ?? []).isEmpty { return "vnr" }
        if !briefing.hazards.isEmpty { return "hazards" }
        if !(briefing.gairmets ?? []).isEmpty { return "gairmets" }
        return "forecast"
    }

    /// A row's id: the anchor a finding scrolls to on the first row of its
    /// part, else one of the row's own.
    private func rowId(_ part: String, _ index: Int, anchorAt: String, anchor: String) -> String {
        part == anchorAt && index == 0 ? anchor : "\(part)-\(index)"
    }

    var body: some View {
        ScrollViewReader { reader in
            List {
                // The verdict first, as Weather gives its takeaway before
                // the detail (docs/design/ios.md §5).
                if plan.routed { BriefVerdictHead() }
                // What the phone holds for the flight before the signal
                // goes, first (the engine's ready_to_fly).
                ReadyToFlySection()
                if plan.routed {
                    // A finding scrolls the Brief to its part; a jump, not
                    // a scroll, with Reduce Motion on.
                    GoNoGoSection { anchor in
                        if reduceMotion { reader.scrollTo(anchor, anchor: .top) } else { withAnimation { reader.scrollTo(anchor, anchor: .top) } }
                    }
                    DepartureWindowSection(model: window, signedIn: session.signedIn, airplane: plan.airplaneChosen)
                }
                if let briefing = plan.briefing {
                    let weatherAt = weatherPart(briefing)
                    // The briefing kept, shown with no signal, with its age.
                    KeptAgeLine(kind: .briefing, key: ReadyToFly.flightKey(plan))
                    WordsSection(title: "The weather in words", said: weatherWords, writing: writingWords)
                    if let notRecommended = briefing.vfrNotRecommended, !notRecommended.isEmpty {
                        Section {
                            ForEach(Array(notRecommended.enumerated()), id: \.offset) { i, reason in
                                Label(reason, systemImage: "xmark.octagon.fill").foregroundStyle(WingtipInk.problem)
                                    .id(rowId("vnr", i, anchorAt: weatherAt, anchor: VerdictTarget.weatherAnchor))
                            }
                        } header: { Text("VFR Flight Not Recommended") }
                    }
                    if !briefing.weatherUnavailable.isEmpty {
                        Section("Not Available") {
                            ForEach(briefing.weatherUnavailable, id: \.self) { Text($0).foregroundStyle(.secondary) }
                        }
                    }
                    if !briefing.hazards.isEmpty {
                        Section("Hazards") {
                            ForEach(Array(briefing.hazards.enumerated()), id: \.offset) { i, hazard in
                                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                    Text([hazard.type, hazard.hazard].compactMap { $0 }.joined(separator: " · ")).font(.headline)
                                    if let low = hazard.altitudeLowFt, let high = hazard.altitudeHighFt {
                                        Text(Format.altitudeRange(low, high)).font(.footnote).foregroundStyle(.secondary)
                                    }
                                    if let raw = hazard.raw { Text(raw).font(.footnote.monospaced()).foregroundStyle(.secondary) }
                                }
                                .id(rowId("hazards", i, anchorAt: weatherAt, anchor: VerdictTarget.weatherAnchor))
                                // Its legs and when the airplane is there; a tap shows them.
                                OnRouteRow(on: hazard.onRoute, key: "sigmet-\(i)-\(hazard.raw ?? "")")
                            }
                        }
                    }
                    if let gairmets = briefing.gairmets, !gairmets.isEmpty {
                        Section("G-AIRMETs") {
                            ForEach(Array(gairmets.enumerated()), id: \.offset) { i, g in
                                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                    Text([g.hazard, g.severity].compactMap { $0 }.joined(separator: " · ")).font(.headline)
                                    HStack(spacing: WingtipSpace.sm) {
                                        if let low = g.altitudeLowFt, let high = g.altitudeHighFt { Text(Format.altitudeRange(low, high)) }
                                        if let due = g.dueTo { Text(due) }
                                        if let at = g.validAt { Text(at) }
                                    }
                                    .font(.footnote).foregroundStyle(.secondary)
                                }
                                .id(rowId("gairmets", i, anchorAt: weatherAt, anchor: VerdictTarget.weatherAnchor))
                                OnRouteRow(on: g.onRoute, key: "gairmet-\(g.hazard)")
                            }
                        }
                    }
                    if let tfrs = briefing.tfrs, !tfrs.isEmpty {
                        Section("TFRs on the Way") {
                            ForEach(Array(tfrs.enumerated()), id: \.offset) { i, tfr in
                                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                    HStack {
                                        Text(tfr.title ?? tfr.notamId).font(.headline)
                                        if tfr.crosses { Text("crosses").foregroundStyle(WingtipInk.problem).font(.footnote.weight(.semibold)) }
                                        if tfr.activeNow { Text("active now").foregroundStyle(WingtipInk.problem).font(.footnote.weight(.semibold)) }
                                    }
                                    HStack(spacing: WingtipSpace.sm) {
                                        Text("\(Format.distance(tfr.alongTrackNm, decimals: 0)) along")
                                        if let floor = tfr.floorFt, let ceiling = tfr.ceilingFt { Text(Format.altitudeRange(floor, ceiling)) }
                                        if let effective = tfr.effective { Text("from \(effective)") }
                                    }
                                    .font(.footnote).foregroundStyle(.secondary)
                                }
                                .id(rowId("tfrs", i, anchorAt: "tfrs", anchor: VerdictTarget.airspaceAnchor))
                                OnRouteRow(on: tfr.onRoute, key: "tfr-\(tfr.notamId)")
                            }
                        }
                    }
                    if let pireps = briefing.pireps, !pireps.isEmpty {
                        Section("Pilot Reports") {
                            ForEach(Array(pireps.enumerated()), id: \.offset) { i, p in
                                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                    HStack(spacing: WingtipSpace.sm) {
                                        Text("\(Format.distance(p.alongTrackNm, decimals: 0)) along").font(.headline)
                                        if let turbulence = p.turbulence { Text("turbulence \(turbulence)") }
                                        if let icing = p.icing { Text("icing \(icing)") }
                                        if p.urgent == true { Text("URGENT").foregroundStyle(WingtipInk.problem).bold() }
                                    }
                                    if let raw = p.raw { Text(raw).font(.footnote.monospaced()).foregroundStyle(.secondary) }
                                }
                                OnRouteRow(on: p.onRoute, key: "pirep-\(i)-\(p.raw ?? "")")
                            }
                        }
                    }
                    FieldsBelowVfrSection(fields: briefing.fieldsBelowVfr ?? [])
                    ForecastIcingSection(model: icing, legs: plan.legs)
                    Section("Forecast Along the Route") {
                        LabeledContent("Lowest ceiling", value: Format.altitude(briefing.forecast.minCeilingFt))
                            .id(rowId("forecast", 0, anchorAt: weatherAt, anchor: VerdictTarget.weatherAnchor))
                        LabeledContent("Lowest visibility", value: briefing.forecast.minVisibilitySm.map { String(format: "%g SM", $0) } ?? "—")
                        ForEach(Array(briefing.forecast.stations.enumerated()), id: \.offset) { _, station in
                            if let raw = station.raw {
                                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                    Text(station.icaoId).font(.headline)
                                    Text(raw).font(.footnote.monospaced()).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    // Under IFR, the destination's and the alternate's check
                    // (91.169), after the forecast, as the web's Brief has it.
                    AlternateSection(pickAirplane: { appCommand(.open(.airplane)) })
                    let stations = briefing.metars.additionalProperties.keys.sorted()
                    if !stations.isEmpty {
                        Section("METARs") {
                            KeptAgeLine(kind: .weather, key: ReadyToFly.flightKey(plan))
                            ForEach(stations, id: \.self) { ident in
                                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                    HStack {
                                        Text(ident).font(.headline)
                                        if let category = briefing.metars.additionalProperties[ident]??.flightCategory { Text(category).font(.footnote.weight(.semibold)).foregroundStyle(.secondary) }
                                    }
                                    if let raw = briefing.metars.additionalProperties[ident]??.raw {
                                        Text(raw).font(.footnote.monospaced()).foregroundStyle(.secondary)
                                    } else {
                                        Text("No report").font(.footnote).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                } else if let problem = plan.briefingProblem {
                    ContentUnavailableView("No briefing", systemImage: "exclamationmark.triangle", description: Text(problem))
                } else if plan.routed {
                    // Only a route has a briefing to fetch.
                    Section("METARs") {
                        ForEach(0..<4, id: \.self) { _ in
                            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                Text("Station").font(.headline)
                                Text("The station's report as the weather service sends it").font(.footnote.monospaced()).foregroundStyle(.secondary)
                            }
                            .loading("Fetching the briefing")
                        }
                    }
                }
                // The route's NOTAMs, fetched for Ready to fly (91.103, AIM 5-1-3).
                if plan.routed { NotamsSection() }
                // The passengers' briefing (91.107, the SAFETY briefing) and
                // the flight to send them, after the weather.
                if plan.routed {
                    Section {
                        NavigationLink {
                            PassengerBriefingView(flight: PassengerBriefingModel.flight(idents: plan.idents))
                        } label: {
                            Label("Passenger Briefing", systemImage: "person.2")
                        }
                    }
                }
            }
        }
        .siriSees(SiriSaw.flight(plan))
        .navigationTitle("Brief")
        .navigationBarMinimizesOnScroll()
        // The flight started from the Brief's foot (its Live Activity).
        .glassFoot { if plan.routed { StartFlightBar() } }
        // The UI tests' sign the Brief is up (WingtipUITests/FlowTests).
        .accessibilityIdentifier("brief")
        // Pulled down: the briefing and the Go / No-Go asked afresh, the
        // weather being live; the reports stay on the page meanwhile.
        .refreshable {
            guard plan.routed else { return }
            await plan.brief(dep: plan.dep, dest: plan.dest, stops: plan.stops, eteMin: plan.totals?.eteMin)
            await verdict.refresh(plan: plan, signedIn: session.signedIn)
        }
        .task {
            if plan.briefing == nil, plan.routed {
                await plan.brief(dep: plan.dep, dest: plan.dest, stops: plan.stops, eteMin: plan.totals?.eteMin)
            }
            // The route's weather is watched from the Brief on (WeatherWatch):
            // notifications asked for here, where the pilot sees why.
            if plan.routed { await Notifications.allow() }
        }
        // The forecast icing, asked once the briefing has the nav log's legs.
        .task(id: ForecastIcing.query(briefing: plan.briefing, legs: plan.legs)) { await icing.refresh(briefing: plan.briefing, legs: plan.legs) }
        // Asked again whenever the plan or what the pilot set changes.
        .task(id: verdict.key(for: plan)) { await verdict.refresh(plan: plan, signedIn: session.signedIn) }
        // The hours to go, asked again as the Go / No-Go's question changes.
        .task(id: "\(verdict.key(for: plan))|\(session.signedIn)") {
            guard session.signedIn, plan.routed else { return }
            await window.refresh(asking: Result { try DepartureWindow.ask(verdict.ask(for: plan), airplane: plan.airplaneChosen) })
            // The hour said to Siri with the ask ("tomorrow at 9"), picked.
            if let when = briefAsk.takeDepart() { window.pick(nearest: when) }
        }
        // The words for the briefing on the page, written again when it
        // changes; the figures stay as they are while they are written.
        .task(id: plan.briefing) {
            guard let briefing = plan.briefing else { weatherWords = nil; return }
            writingWords = true
            defer { writingWords = false }
            let legs = BriefLegs.query(course: plan.course, checkpoints: plan.checkpoints, legs: plan.legs)
            let eteMin = plan.totals?.eteMin
            let figures = WordsFigures.weather(briefing, dep: plan.dep, dest: plan.dest, stops: plan.stops, eteMin: eteMin)
            let body = WeatherWordsAsk(dep: plan.dep, dest: plan.dest, eteMin: eteMin, fixes: legs?.fixes ?? "", legMin: legs?.legMin ?? "", stops: plan.stops)
            guard let ask = try? WordsAsk(kind: .weather, body: body, figures: figures) else { return }
            let said = await WordsFor().said(ask)
            guard !Task.isCancelled else { return }
            weatherWords = said
        }
    }
}
