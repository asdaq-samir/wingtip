import AppIntents
import Foundation

/// "What does this NOTAM mean for me?" -- about the NOTAM on the screen
/// (its View Annotation) or one said: Apple's on-device model words it
/// for this flight from the NOTAM as sent, the engine's reasons for its
/// rank and the route (OnDeviceWords, each sentence citing those, no
/// figure of its own); where the model cannot run, the engine's reasons
/// as they are. Nothing leaves the phone.
struct ExplainNotamIntent: AppIntent {
    static let title: LocalizedStringResource = "Explain a NOTAM"
    static let description = IntentDescription("Says what a NOTAM means for your flight, in plain words, on this iPhone.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "NOTAM", requestValueDialog: "Which NOTAM?")
    var notam: NotamEntity

    static var parameterSummary: some ParameterSummary { Summary("Explain \(\.$notam)") }

    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let id = notam.id
        let found = await MainActor.run { () -> (APIRankedNotam?, WordsSource?) in
            let plan = ReadyToFly.shared.plan
            let flight = plan.flatMap { $0.routed ? WordsFigures.flight(dep: $0.dep, dest: $0.dest, stops: $0.stops, eteMin: $0.totals?.eteMin) : nil }
            return (NotamEntityQuery.held().first { $0.id == id }, flight)
        }
        let ranked = found.0
        let figures = NotamWords.figures(id: id, raw: ranked?.raw ?? notam.raw, reasons: ranked?.reasons ?? [], flight: found.1)
        let said = await NotamWords.said(figures, reasons: ranked?.reasons ?? [])
        return .result(dialog: IntentDialog(full: "\(said.text)", supporting: "NOTAM \(id)"),
                       view: SiriLines(title: "NOTAM \(id)", lines: [said.text, ranked?.raw ?? notam.raw], caption: said.origin))
    }
}

/// A NOTAM's words: the figures the model may cite, and who wrote them.
enum NotamWords {
    static func figures(id: String, raw: String, reasons: [APINotamReason], flight: WordsSource?) -> [WordsSource] {
        var figures = [WordsSource(id: "notam:\(id)", label: "NOTAM \(id)", text: raw)]
        figures += reasons.map { WordsSource(id: "why:\($0.key)", label: "Why it was ranked", text: $0.words) }
        if let flight { figures.append(flight) }
        return figures
    }

    /// The on-device model's sentences; else the engine's reasons as
    /// they are, saying the model could not run.
    static func said(_ figures: [WordsSource], reasons: [APINotamReason], device: any WordsProvider = OnDeviceWords()) async -> (text: String, origin: String) {
        if let ask = try? WordsAsk(kind: .notams, body: [String: String](), figures: figures),
           let words = try? await device.words(ask), !words.sentences.isEmpty {
            return (words.sentences.map(\.text).joined(separator: " "), AskOrigin.device.caption)
        }
        let why = reasons.map(\.words)
        guard !why.isEmpty else { return ("This NOTAM isn't ranked for your route; here it is as sent.", "As sent") }
        return (why.map { $0.hasSuffix(".") ? $0 : $0 + "." }.joined(separator: " "), AskOrigin.engine.caption)
    }
}

/// "What's the weather at my destination when I land?": the planner's
/// forecast at the route's ETA at the destination (the briefing's TAF
/// stations, each placed along the route with its ETA ceiling and
/// visibility), from the route on the screen or the one kept on the
/// phone. The figures are the planner's; none is worked out here.
struct WeatherOnArrivalIntent: AppIntent {
    static let title: LocalizedStringResource = "Weather When I Land"
    static let description = IntentDescription("Says the forecast at your destination for when you land, from your route's briefing.")
    static let openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let held = await MainActor.run { () -> (String, Briefing?)? in
            if let plan = ReadyToFly.shared.plan, plan.routed { return (plan.dest, plan.briefing) }
            return nil
        }
        let kept = Kept.load()
        guard let dest = held?.0 ?? kept?.dest, let briefing = held?.1 ?? kept?.briefing else {
            return .result(dialog: "Plan and brief your flight in Wingtip Maps first, and I'll tell you.")
        }
        return .result(dialog: IntentDialog(stringLiteral: ArrivalWords.said(dest: dest, briefing)))
    }
}

/// The forecast on arrival said as a briefer says it.
enum ArrivalWords {
    /// The destination's own TAF where it has one, else the station the
    /// route reaches last.
    static func station(dest: String, _ briefing: Briefing) -> APIForecastStation? {
        briefing.forecast.stations.first { $0.icaoId.uppercased() == dest.uppercased() }
            ?? briefing.forecast.stations.filter { $0.eta != nil }.max { ($0.alongTrackNm ?? 0) < ($1.alongTrackNm ?? 0) }
    }

    static func said(dest: String, _ briefing: Briefing, zone: TimeZone = .current) -> String {
        guard let s = station(dest: dest, briefing), let eta = s.eta else { return "No forecast reaches \(dest) for when you land." }
        let at = BriefLegs.clock(eta, zone: zone) ?? eta
        var parts: [String] = []
        if s.etaCeilingUnknown == true {
            parts.append("the ceiling isn't forecast")
        } else {
            parts.append(s.etaCeilingFt.map { "ceiling \(IntentLookups.grouped($0)) feet" } ?? "no ceiling")
        }
        if let vis = s.etaVisibilitySm { parts.append("visibility \(IntentLookups.plain(vis)) miles") }
        let from = s.icaoId.uppercased() == dest.uppercased() ? "\(dest)'s forecast" : "The forecast at \(s.icaoId), the nearest to \(dest),"
        return "\(from) for \(at): \(parts.joined(separator: ", "))."
    }
}

/// "What's the ATIS here?" -- at the field on the screen or one said: the
/// field's D-ATIS as sent, where it broadcasts one; else its latest
/// report said as a briefer says it, with its ATIS or AWOS frequency.
struct AtisIntent: AppIntent {
    static let title: LocalizedStringResource = "ATIS at an Airport"
    static let description = IntentDescription("Reads an airport's D-ATIS, or its latest weather report and ATIS frequency.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Airport", requestValueDialog: "Which airport?")
    var airport: AirportEntity

    static var parameterSummary: some ParameterSummary { Summary("ATIS at \(\.$airport)") }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let ident = airport.id
        if let datis = try? await Planner.liveAtis(ident),
           let first = await MainActor.run(body: { AirportLive.broadcasts(datis).first.map { (title: $0.title, text: $0.text) } }) {
            return .result(dialog: IntentDialog(full: "\(first.text)", supporting: "\(first.title)"))
        }
        guard let place = try? await Planner.place(ident) else { return .result(dialog: "\(ident)'s ATIS couldn't be had; check the connection.") }
        let weather = place.frequencies.first { ["ATIS", "AWOS", "ASOS"].contains(($0.type ?? "").uppercased()) }
            .map { FrequencyEntity(field: ident, $0).spoken + "." } ?? ""
        guard let metar = place.metar, metar.raw != nil else { return .result(dialog: "No D-ATIS or report at \(ident). \(weather)") }
        let words = IntentLookups.metarWords(name: place.name.isEmpty ? ident : place.name, metar)
        return .result(dialog: IntentDialog(stringLiteral: "No D-ATIS at \(ident). \(weather) \(words)"))
    }
}

/// "Brief the ILS 27 at Madison", "brief this approach": the engine's
/// approach brief (approach_brief: the final course, the glidepath, the
/// fixes and altitudes, the missed approach, the frequencies), said and
/// shown, from the planner's CIFP drawing. Nothing on the route changes;
/// AddApproachIntent puts it there.
struct BriefApproachIntent: AppIntent {
    static let title: LocalizedStringResource = "Brief an Approach"
    static let description = IntentDescription("Briefs an instrument approach: course, glidepath, fixes, altitudes, missed approach and frequencies.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Approach", requestValueDialog: "Which approach?")
    var approach: ApproachEntity

    static var parameterSummary: some ParameterSummary { Summary("Brief \(\.$approach)") }

    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let a = approach
        let items: [EngineContract.ApproachBriefAnswerItem]
        do {
            let data = try await Planner.data(for: Planner.get("/api/airport/\(a.field)/procedures/\(a.procedure)"))
            let frequencies = ((try? await Planner.place(a.field))?.frequencies ?? [])
                .map { EngineContract.FieldFrequency(type: $0.type, description: $0.description, frequencyMhz: $0.frequencyMhz) }
            items = try Engine.approachBrief(drawing: CoachApproaches.drawing(data), frequencies: frequencies)
        } catch {
            return .result(dialog: "The \(a.name) at \(a.field) couldn't be briefed: \(error.localizedDescription)", view: SiriLines(title: a.name, lines: []))
        }
        let lines = items.map { "\($0.title): \($0.lines.joined(separator: " "))" }
        let spoken = lines.prefix(4).joined(separator: " ")
        return .result(dialog: IntentDialog(full: "The \(a.name) at \(a.field). \(spoken)", supporting: "\(a.name), \(a.field)"),
                       view: SiriLines(title: "\(a.name) · \(a.field)", lines: lines, caption: "The engine on this iPhone"))
    }
}

/// "Add this approach to my route": the approach put on the route at its
/// field and the Brief opened, as the procedures row picks one.
struct AddApproachIntent: CommandIntent {
    static let title: LocalizedStringResource = "Add an Approach to the Route"
    static let description = IntentDescription("Puts an approach on your route at its airport and opens the Brief.")
    static let openAppWhenRun: Bool = true

    @Parameter(title: "Approach", requestValueDialog: "Which approach?")
    var approach: ApproachEntity

    @Dependency private var commands: AppCommands

    static var parameterSummary: some ParameterSummary { Summary("Add \(\.$approach) to the route") }

    func appCommand() -> AppCommand? { .approach(approach.pick) }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let pick = approach.pick
        await handOver(to: commands)
        return .result(dialog: "Added the \(pick.name) at \(pick.ident).")
    }
}
