import CoreLocation
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// How to spot each checkpoint from the air, one line each, written on
/// the pilot's tap (each is a billed call, so never on its own) and
/// streamed as they come; a pilot's own edit is theirs from then on (the
/// web app's useCheckpointNotes).
struct CheckpointNotesView: View {
    @Environment(Plan.self) private var plan
    @State private var notes: [String: (text: String, source: String)] = [:]
    @State private var writing = false
    @State private var count: Int?
    @State private var problem: String?
    @State private var editing: Checkpoint?
    @State private var typed = ""

    /// A checkpoint's key, by where it is, as the planner matches a note.
    static func key(_ lat: Double, _ lon: Double) -> String { AirportWords.point(lat, lon) }

    var body: some View {
        List {
            // Claude's descriptions have no free path: hidden while the Claude features are off (docs/decisions/0035).
            if ServerFeatures.shared.claudeOn {
                Button(writing ? (count.map { "Writing \(notes.count) of \($0)…" } ?? "Writing…") : "Describe the Checkpoints") { describe() }.disabled(writing || plan.checkpoints.isEmpty)
            }
            ProblemLine(problem)
            Section("Checkpoints") {
                if plan.checkpoints.isEmpty { Text("The route's checkpoints come with its plan.").foregroundStyle(.secondary) }
                ForEach(plan.checkpoints) { point in
                    Button {
                        editing = point
                        typed = notes[Self.key(point.lat, point.lon)]?.text ?? ""
                    } label: {
                        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                            Text(point.name ?? point.waypoint ?? point.category).font(.headline).foregroundStyle(.primary)
                            if let note = notes[Self.key(point.lat, point.lon)], !note.text.isEmpty {
                                Text(note.text).font(.subheadline).foregroundStyle(note.source == "saved" ? Color.primary : Color.secondary)
                            } else {
                                Text("Add a note").font(.subheadline).foregroundStyle(.tint)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Checkpoint notes")
        .alert(editing.map { $0.name ?? $0.waypoint ?? $0.category } ?? "Note", isPresented: Binding(get: { editing != nil }, set: { if !$0 { editing = nil } })) {
            TextField("What you see there", text: $typed)
            Button("Save") { save() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("What you see at this place, kept for you from now on.")
        }
    }

    private func describe() {
        writing = true
        problem = nil
        let dep = plan.dep, dest = plan.dest, stops = plan.stops
        Task {
            do {
                for try await line in Planner.describeCheckpoints(dep: dep, dest: dest, stops: stops) {
                    switch line.type {
                    case "start": count = line.count
                    case "checkpoint":
                        if let lat = line.lat, let lon = line.lon {
                            notes[Self.key(lat, lon)] = (line.description ?? "", line.source ?? "generated")
                        }
                    case "error": problem = line.detail
                    default: break
                    }
                }
            } catch {
                problem = "The descriptions could not be written: \(error.localizedDescription)"
            }
            writing = false
        }
    }

    private func save() {
        guard let point = editing else { return }
        let text = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = Self.key(point.lat, point.lon)
        let before = notes[key]
        notes[key] = (text, "saved")
        let dep = plan.dep, dest = plan.dest, stops = plan.stops
        Task {
            do { try await Planner.saveNote(dep: dep, dest: dest, stops: stops, lat: point.lat, lon: point.lon, text: text) } catch {
                // A failed save takes its own text back out, where the note
                // still holds it.
                if notes[key]?.text == text { notes[key] = before }
                problem = "The note could not be saved: \(error.localizedDescription)"
            }
        }
    }
}

/// FAA Form 7233-4's items as AIM Appendix 4 writes them: the engine's
/// (`filed_speed`, `filed_level`, `filed_route`, `filed_duration`), the
/// very ones the web app's lib/flightPlanForm asks. Each throws where the
/// engine cannot write the item, and nothing is filed then.
enum FilingForm {
    /// Item 15's cruising speed, "N0450".
    static func cruisingSpeed(_ tasKt: Double) throws -> String { try Engine.filedSpeed(tasKt: tasKt) }

    /// Item 15's level: "F350" at and above 18,000 ft, "A080" below it
    /// (14 CFR 91.121(a)(2)).
    static func cruisingLevel(_ altitudeFt: Double) throws -> String { try Engine.filedLevel(ft: altitudeFt) }

    /// An airway as a route names one: Victor, T, Jet or Q and its number
    /// (the web app's identSchema isAirwayToken).
    static func airwayToken(_ stop: String) -> Bool {
        stop.range(of: "^[VTJQ][0-9]{1,4}$", options: .regularExpression) != nil
    }

    /// Item 15's route between the ends ("FLACK DCT IRW", "EIC V18 MEI");
    /// its procedures are not filed from here yet.
    static func route(_ stops: [String], isAirway: (String) -> Bool = FilingForm.airwayToken) throws -> String {
        try Engine.filedRoute(stops: stops, airways: stops.filter(isAirway))
    }

    /// Hours and minutes in four figures, HHMM (items 16 and 19).
    static func hhmm(_ minutes: Int) throws -> String { try Engine.filedDuration(minutes: Double(minutes)) }
}

/// Filing with Flight Service, where the gateway has it connected, as the
/// web app's Brief files (FlightServiceController): signed in, in the
/// pilot's name, the form's items from the plan and the rest typed. With
/// none connected, 1800wxbrief.com and Flight Service's number, which are
/// the FAA's, at no charge.
struct FlightServiceView: View {
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @State private var status: FlightServiceStatus?
    @State private var aircraftId = ""
    @State private var aircraftType = ""
    @State private var departs = Date().addingTimeInterval(3600)
    @State private var endurance = ""
    @State private var persons = ""
    @State private var reference: String?
    @State private var briefing: String?
    @State private var problem: String?
    @State private var sending = false

    var body: some View {
        Form {
            if let status, status.connected, session.signedIn {
                Section("Flight Plan") {
                    LabeledContent("Rules", value: "VFR")
                    TextField("Aircraft identification", text: $aircraftId).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    TextField("Type of aircraft, as C172", text: $aircraftType).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    LabeledContent("Departure", value: plan.dep)
                    DatePicker("Departs", selection: $departs, in: Date()...)
                    let asked = Result { try request() }
                    if let request = try? asked.get() {
                        LabeledContent("Cruising speed", value: request.cruisingSpeed)
                        LabeledContent("Cruising level", value: request.cruisingLevel)
                        LabeledContent("Route", value: request.route)
                        LabeledContent("Total EET", value: (try? FilingForm.hhmm(request.eetMinutes)) ?? "\(request.eetMinutes) min")
                    }
                    ProblemLine(asked, "The flight plan's items")
                    LabeledContent("Destination", value: plan.dest)
                    TextField("Endurance, HHMM", text: $endurance).keyboardType(.numberPad)
                    TextField("Persons on board", text: $persons).keyboardType(.numberPad)
                }
                Section {
                    Button(reference.map { "Filed: \($0)" } ?? (sending ? "Filing…" : "File with \(status.provider)")) { Task { await file() } }
                        .disabled((try? request()) == nil || reference != nil || sending)
                    Button("Standard Briefing") { Task { await brief() } }
                        .disabled((try? request()) == nil || sending)
                    ProblemLine(problem)
                }
                if let briefing {
                    Section("Standard Briefing") { Text(briefing).font(.footnote.monospaced()).textSelection(.enabled) }
                }
            }
            Section(status?.connected == true ? "Or" : "File it with Flight Service") {
                Link(destination: URL(string: "https://www.1800wxbrief.com")!) {
                    LabeledContent("1800wxbrief.com", value: "Open it as you leave, close it when you land")
                }
                Link(destination: URL(string: "tel:18009927433")!) { LabeledContent("Flight Service", value: "1-800-WX-BRIEF") }
            }
        }
        .navigationTitle("File Flight Plan")
        .task {
            status = try? await Gateway.flightService()
            if aircraftId.isEmpty { aircraftId = plan.tail ?? "" }
            if aircraftType.isEmpty, let type = plan.stockType { aircraftType = type }
        }
    }

    /// The request, where every item it needs is there: the first leg's
    /// speed and level, the planner's time en route rounded up, and the
    /// endurance typed (the pilot's fuel aboard).
    /// Thrown where the engine cannot write an item, which the form says.
    private func request() throws -> FlightPlanFilingRequest? {
        guard plan.routed, let first = plan.legs.first, let tas = first.tasKt, let ete = plan.totals?.eteMin, !aircraftId.isEmpty, !aircraftType.isEmpty else { return nil }
        let digits = endurance.filter(\.isNumber)
        guard digits.count == 4, let hours = Int(digits.prefix(2)), let minutes = Int(digits.suffix(2)), minutes < 60 else { return nil }
        let pob = Int(persons.filter(\.isNumber)).flatMap { (1...999).contains($0) ? $0 : nil }
        return FlightPlanFilingRequest(aircraftId: aircraftId.uppercased(), aircraftType: aircraftType.uppercased(), cruisingLevel: try FilingForm.cruisingLevel(first.altitudeFt), cruisingSpeed: try FilingForm.cruisingSpeed(tas), departure: plan.dep, departureTime: ISO8601DateFormatter().string(from: departs), destination: plan.dest, eetMinutes: Int(ete.rounded(.up)), enduranceMinutes: hours * 60 + minutes, personsOnBoard: pob, route: try FilingForm.route(plan.stops), rules: "VFR")
    }

    private func file() async {
        guard let request = try? request() else { return }
        sending = true
        do { reference = try await Gateway.file(request); problem = nil } catch { problem = "Not filed: \(error.localizedDescription)" }
        sending = false
    }

    private func brief() async {
        guard let request = try? request() else { return }
        sending = true
        do { briefing = try await Gateway.standardBriefing(request); problem = nil } catch { problem = "No briefing: \(error.localizedDescription)" }
        sending = false
    }
}

/// A saved flight's flown track: its profile, shown on the map over its
/// route, put in from a GPX file (ForeFlight's, Garmin Pilot's, a GPS's),
/// or taken off. GPS altitude, not what the altimeter read.
struct FlownTrackView: View {
    let flight: Int
    let title: String
    @State private var track: SavedTrack?
    @State private var loaded = false
    @State private var importing = false
    @State private var problem: String?

    private var points: [PathPoint] {
        (track?.points ?? []).map { PathPoint(t: Double($0.t) / 1000, lat: $0.lat, lon: $0.lon, altFt: $0.altFt) }
    }

    private var replayKey: String { "flown:\(flight)" }

    var body: some View {
        List {
            if let track, !track.points.isEmpty {
                // Its replay, the airplane flown along it again on the
                // map, the track put there with it.
                ReplaySection(points: Replay.points(track.points), key: replayKey, onPlay: {
                    if Tracking.shared.flown.isEmpty { Tracking.shared.flown = points }
                })
                Section {
                    if let first = points.first, let last = points.last {
                        LabeledContent("Flown", value: FlightWords.lasted(last.t - first.t))
                    }
                    if let top = points.compactMap(\.altFt).max() { LabeledContent("Highest", value: Format.altitude(top)) }
                }
                // Its debrief against the flight's nav log, the planner's (POST /api/debrief).
                DebriefSections(flight: flight, points: track.points)
                Section {
                    Button(Tracking.shared.flown.isEmpty ? "Show on the Map" : "Hide from the Map") {
                        Tracking.shared.flown = Tracking.shared.flown.isEmpty ? points : []
                    }
                    Button("Delete the Track", role: .destructive) {
                        Task {
                            do { try await Gateway.deleteTrack(flight); self.track = nil; Tracking.shared.flown = []; Replay.shared.clear(replayKey) } catch { problem = error.localizedDescription }
                        }
                    }
                }
            } else if loaded {
                ContentUnavailableView("No track kept", systemImage: "point.topleft.down.to.point.bottomright.curvepath",
                                       description: Text(OwnTrail.shared.points.count > 1
                                           ? "Keep the path this iPhone flew, or put in a GPX file."
                                           : "Put in the flight's track from a GPX file."))
            }
            Section {
                // The path the phone flew (OwnTrail), kept as the flight's
                // track with no file to find: the debrief from the
                // airplane's own GPS, as ForeFlight's track logs are.
                if OwnTrail.shared.points.count > 1 {
                    Button("Keep the Path This iPhone Flew") {
                        let saved = OwnTrail.shared.asSavedTrack
                        Task {
                            do { try await Gateway.saveTrack(flight, saved); track = saved; problem = nil } catch { problem = error.localizedDescription }
                        }
                    }
                }
                Button("Put In a GPX File…") { importing = true }
                ProblemLine(problem)
            }
        }
        .navigationTitle(title)
        .task {
            do { track = try await Gateway.track(flight) } catch { problem = error.localizedDescription }
            loaded = true
        }
        .onDisappear { Replay.shared.clear(replayKey) }
        .fileImporter(isPresented: $importing, allowedContentTypes: [UTType(filenameExtension: "gpx") ?? .xml, .xml]) { result in
            guard case .success(let url) = result else { return }
            let reading = url.startAccessingSecurityScopedResource()
            defer { if reading { url.stopAccessingSecurityScopedResource() } }
            let found: [SavedTrackPoint]?
            do { found = try GPXTrack.points(try Data(contentsOf: url)) } catch {
                problem = "The file couldn't be read: \(error.localizedDescription)"
                return
            }
            guard let read = found, !read.isEmpty else {
                problem = "No track points with their times in that file."
                return
            }
            let saved = SavedTrack(points: read, source: "gpx")
            Task {
                do { try await Gateway.saveTrack(flight, saved); track = saved; problem = nil } catch { problem = error.localizedDescription }
            }
        }
    }
}

/// A track file's points with their times, as the web app's lib/track
/// reads one (the engine's `read_track`: GPX 1.1's trkpt, its ele in
/// metres, as feet, or KML's gx:Track; in time order, one a moment, the
/// unreadable dropped), then thinned to the most a saved track keeps
/// (`thin_track`). Nil where the file has no track to use.
enum GPXTrack {
    /// The engine's points: t in ms since 1970, which it writes as a
    /// fraction ("1792940400000.0"), so read as one. The contract leaves
    /// read_track's answer and thin_track's points open, so this shape is
    /// the app's, read from the engine's JSON.
    private struct Point: Codable {
        let t: Double; let lat: Double; let lon: Double; let altFt: Double?
        enum CodingKeys: String, CodingKey { case t, lat, lon, altFt = "alt_ft" }
    }

    private struct Read: Decodable {
        let points: [Point]?
        let error: String?
    }

    /// Nil where the file has no track; thrown where the engine refuses.
    static func points(_ data: Data) throws -> [SavedTrackPoint]? {
        let text = String(decoding: data, as: UTF8.self)
        let read: Read = try Engine.recoded(try Engine.readTrack(text: text))
        guard read.error == nil, let points = read.points else { return nil }
        let thinned: [Point] = try Engine.thinTrack(points: try points.map { try Engine.recoded($0) }).map { try Engine.recoded($0) }
        return thinned.map { SavedTrackPoint(altFt: $0.altFt, lat: $0.lat, lon: $0.lon, t: Int($0.t.rounded())) }
    }
}

/// The route as it goes to other places.
@MainActor
enum RouteShare {
    /// The plan as a shared flight's link (SharedPlan): opened as a preview
    /// on the other pilot's phone or browser; the N-number only when asked.
    static func link(_ plan: Plan, includeTail: Bool = false) -> URL {
        SharedPlan(dep: plan.dep, dest: plan.dest, stops: plan.stops, altitudeFt: (plan.ownAltitudeFt ?? plan.altitudeFt).map { Int($0) },
                   type: plan.aircraft == Plan.noAirplane ? nil : plan.aircraft.uppercased(), rules: FlightRules.saved(), tail: plan.tail).link(includeTail: includeTail)
    }

    static func fileName(_ plan: Plan) -> String {
        plan.idents.joined(separator: "-").replacingOccurrences(of: "[^A-Za-z0-9]+", with: "-", options: .regularExpression)
    }

    /// The nav log as lines of text: the route, then each leg's figures.
    static func navLogText(_ plan: Plan) -> String {
        var lines = [plan.idents.joined(separator: " → ")]
        if let totals = plan.totals {
            lines.append([Format.distance(totals.distanceNm), totals.eteMin.map(Format.duration),
                          totals.fuelGal.map { Format.fuel($0) }].compactMap { $0 }.joined(separator: " · "))
        }
        for leg in plan.legs {
            // No heading without an airplane: the planner sends none.
            let heading = leg.magneticHeadingDeg.map { "MH \(Format.heading($0))" }
            lines.append(["\(leg.from) → \(leg.to)", Format.altitude(leg.altitudeFt), heading, Format.distance(leg.distanceNm),
                          leg.groundspeedKt.map { "GS \(Format.speed($0))" }, leg.eteMin.map(Format.navLogTime)].compactMap { $0 }.joined(separator: "  "))
        }
        return lines.joined(separator: "\n")
    }

    /// The route's points in order: the ends and stops, and each hop's
    /// checkpoints between them.
    static func points(_ plan: Plan) -> [(name: String, lat: Double, lon: Double, checkpoint: Checkpoint?)] {
        guard let course = plan.course else { return [] }
        let ends = [course.departure] + (course.stops ?? []) + [course.destination]
        var out: [(name: String, lat: Double, lon: Double, checkpoint: Checkpoint?)] = []
        for (i, end) in ends.enumerated() {
            out.append((end.ident, end.lat, end.lon, nil))
            guard i < ends.count - 1 else { break }
            for point in plan.checkpoints.filter({ ($0.hop ?? 0) == i }).sorted(by: { $0.alongTrackNm < $1.alongTrackNm }) {
                out.append((point.name ?? point.waypoint ?? point.category, point.lat, point.lon, point))
            }
        }
        return out
    }

    /// The checkpoints' pack on the planner (app.foreflight), at a short
    /// address ending in its file's name, which ForeFlight names it by.
    static func packURL(_ plan: Plan) -> URL {
        let route = plan.idents.joined(separator: "-")
        return Config.gateway.appending(path: "/api/planner/foreflight-pack/\(route)/\(route)-checkpoints.zip")
    }

    /// ForeFlight's own link for a pack (foreflight.com/support/content-packs).
    static func openPack(_ pack: URL) -> URL {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_.!~*'()"))
        return URL(string: "https://foreflight.com/content?downloadURL=\(pack.absoluteString.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")")!
    }

    /// ForeFlight's maps link for the route: the fields by ident, the
    /// checkpoints by their names in the pack once it is sent, else where
    /// they are, and the altitude (the web app's foreflightRoute).
    static func foreflightRoute(_ plan: Plan, named: Bool) -> URL {
        var tokens = points(plan).map { point -> String in
            guard let checkpoint = point.checkpoint else { return point.name.uppercased() }
            if named, let waypoint = checkpoint.waypoint { return "CONTPACK@\(waypoint)" }
            return String(format: "%.4f/%.4f", point.lat, point.lon)
        }
        if let feet = plan.altitudeFt { tokens.append("\(Int(feet.rounded()))ft") }
        return URL(string: "foreflightmobile://maps/search?q=\(tokens.joined(separator: "+"))")!
    }

    static func packSent(_ route: String, names: [String]) -> Bool {
        !names.isEmpty && (UserDefaults.standard.dictionary(forKey: "foreflightPacks")?[route] as? String) == names.joined(separator: " ")
    }

    static func markPackSent(_ route: String, names: [String]) {
        var sent = UserDefaults.standard.dictionary(forKey: "foreflightPacks") ?? [:]
        sent[route] = names.joined(separator: " ")
        UserDefaults.standard.set(sent, forKey: "foreflightPacks")
    }
}

/// iOS's share sheet, for a file made here.
struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// The alerts ahead said aloud, Setup's switch for it.
struct SpokenAlertsToggle: View {
    var body: some View {
        Toggle("Speak Alerts Ahead", isOn: Binding(get: { SpokenAlerts.shared.on }, set: { SpokenAlerts.shared.on = $0 }))
    }
}

/// The pilot's own checkpoint notes forgotten, everywhere, asked first.
struct ForgetNotesButton: View {
    @State private var asking = false
    @State private var said: String?

    var body: some View {
        Button(said ?? "Forget My Checkpoint Notes", role: .destructive) { asking = true }
            .confirmationDialog("Forget your checkpoint notes?", isPresented: $asking, titleVisibility: .visible) {
                Button("Forget Them", role: .destructive) {
                    Task {
                        if let removed = try? await Planner.forgetNotes() { said = removed == 1 ? "1 note forgotten" : "\(removed) notes forgotten" }
                    }
                }
            } message: {
                Text("Every note you wrote on a checkpoint goes; the shared ones stay.")
            }
    }
}

/// The last watch that went off, over the map until it is put away.
struct WatchBanner: View {
    var body: some View {
        if let words = Tracking.shared.fired {
            HStack(spacing: WingtipSpace.sm) {
                Image(systemName: "bell.fill").symbolRing(on: words).accessibilityHidden(true)
                Text(words).font(.subheadline.weight(.semibold)).lineLimit(2)
                Button { Tracking.shared.fired = nil } label: {
                    // The 44-point hit area round the glyph, which does not grow.
                    Image(systemName: "xmark").contentShape(Rectangle().inset(by: -12))
                }
                .accessibilityLabel("Dismiss")
            }
            .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
            .floatingGlass(in: Capsule())
        } else if let problem = Tracking.shared.watchProblem {
            // A watch that could not be checked says so where it would
            // have gone off, rather than staying quiet.
            Label(problem, systemImage: "exclamationmark.triangle")
                .font(.subheadline).foregroundStyle(WingtipInk.caution).lineLimit(2)
                .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
                .floatingGlass(in: Capsule())
        }
    }
}

private enum PreviewData {
    static let legs = [
        Leg.preview(from: "KDLH", to: "KHIB", distanceNm: 62.4, altitudeFt: 4500, trueCourseDeg: 318, magneticHeadingDeg: 315, wcaDeg: -4, trueHeadingDeg: 314, magneticVariationDeg: -1, climbMin: 6, groundspeedKt: 104, eteMin: 36, fuelGal: 5.1, tasKt: 112),
        Leg.preview(from: "KHIB", to: "KGPZ", distanceNm: 31.8, altitudeFt: 4500, trueCourseDeg: 296, magneticHeadingDeg: 293, wcaDeg: -4, trueHeadingDeg: 292, magneticVariationDeg: -1, climbMin: 6, groundspeedKt: 106, eteMin: 18, fuelGal: 3.3, tasKt: 112),
    ]
    static let totals = Totals.preview(distanceNm: 94.2, eteMin: 54, fuelGal: 8.4, fuelMarginGal: 35.6, fuelRequiredGal: 12.4, usableFuelGal: 48)
}

#Preview("CheckpointNotesView") {
    NavigationStack { CheckpointNotesView() }
        .environment(Plan())
}

#Preview("FlightServiceView") {
    let plan = Plan()
    plan.dep = "KDLH"
    plan.dest = "KHIB"
    return NavigationStack { FlightServiceView() }
        .environment(plan)
        .environment(Session())
}

#Preview("ShareMenu") {
    ShareMenu()
        .environment(Plan())
}

#Preview("Kneeboard") {
    Kneeboard(route: "KDLH → KHIB → KGPZ", aircraft: "N3429J", totals: PreviewData.totals, legs: PreviewData.legs)
}

#Preview("SpokenAlertsToggle") {
    Form { SpokenAlertsToggle() }
}

#Preview("ForgetNotesButton") {
    Form { ForgetNotesButton() }
}

#Preview("WatchBanner") {
    Tracking.shared.fired = "N3429J is in the air from KDLH"
    return WatchBanner()
        .padding()
}
