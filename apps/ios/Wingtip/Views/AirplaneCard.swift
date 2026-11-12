import CoreLocation
import SwiftUI

/// An airplane being tracked, as FlightAware's flight page and the web
/// app's FlightCard show one: what it is and who flies it; the star,
/// Follow, Share and the watches; its flight now and the ones before it,
/// each opened with its path on the map and its profile; then what it is
/// and the FAA's record. Seconds-old internet data from adsb.lol's
/// receivers: for knowing what is about, not for avoiding it.
struct AirplaneCard: View {
    @Environment(Tracking.self) private var tracking
    let hex: String
    @Environment(\.undoManager) private var undoManager
    @State private var model = AirplaneCardModel()

    private var plane: TrafficAircraft? { tracking.hex == hex.lowercased() ? tracking.latest : nil }
    private var detail: FlightDetail? { model.detail }
    private var route: FlightRoute? { model.route }
    private var flights: [PastFlightSummary] { model.flights }
    private var history: PastFlights? { model.history }
    private var based: PastFlightField? { model.based }
    private var name: String {
        if let callsign = plane?.callsign { return callsign }
        if let registration = detail?.registration ?? plane?.registration { return registration }
        if let tail = detail?.faa?.nNumber { return tail }
        return tracking.recents.first(where: { $0.hex == hex })?.name ?? hex.uppercased()
    }
    private var kept: KeptAirplane? {
        let registration = detail?.registration ?? plane?.registration
        guard let name = registration ?? detail?.faa?.nNumber ?? plane?.callsign else { return nil }
        return KeptAirplane(hex: hex.lowercased(), name: name, type: detail?.type ?? plane?.type)
    }
    private var link: URL { Config.gateway.appending(path: "/app/plan").appending(queryItems: [URLQueryItem(name: "flight", value: hex)]) }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                    Text(detail?.description.map(FlightWords.nameCase) ?? detail?.type ?? plane?.type ?? name).font(.title3.weight(.semibold))
                    if let op = detail?.operator { Text(FlightWords.nameCase(op)).foregroundStyle(.secondary) }
                }
                HStack(spacing: WingtipSpace.md) {
                    Button { if let kept { tracking.toggleFavorite(kept, undo: undoManager) } } label: {
                        Label(tracking.isFavorite(hex) ? "Favorite" : "Add to Favorites", systemImage: tracking.isFavorite(hex) ? "star.fill" : "star")
                    }
                    .disabled(kept == nil)
                    // Nothing to follow where it is not heard now.
                    Button {
                        tracking.follow.toggle()
                    } label: {
                        Label(tracking.follow && plane != nil ? "Following" : "Follow", systemImage: "scope")
                    }
                    .disabled(plane == nil)
                    Menu {
                        Toggle("Tell me when it takes off", isOn: watchBinding(.takeoff))
                        Toggle("Tell me when it lands", isOn: watchBinding(.land))
                    } label: {
                        Label("Alert", systemImage: tracking.watching(hex, .takeoff) || tracking.watching(hex, .land) ? "bell.fill" : "bell").symbolSwap()
                    }
                    ShareLink(item: link, subject: Text(name)) { Label("Share", systemImage: "square.and.arrow.up") }
                }
                .labelStyle(.iconOnly)
                .glassButton()
                .font(.body)
            }
            if let plane {
                Section("Now") {
                    NowFlightRow(plane: plane, detail: detail, route: route?.plausible == false ? nil : route)
                    if let towerLine = model.towerLine {
                        Label(towerLine, systemImage: "building.columns").font(.subheadline).foregroundStyle(.secondary)
                    }
                    ProblemLine(model.nowProblem)
                }
            }
            Section(plane != nil ? "Earlier" : "Last flights") {
                if history == nil, model.problem == nil {
                    Text("Fetching its flights…").foregroundStyle(.secondary)
                }
                ForEach(flights.filter { !(plane != nil && $0.inAir) }) { flight in
                    NavigationLink(value: flight) { PastFlightRow(flight: flight, type: detail?.type ?? plane?.type ?? history?.type) }
                }
                if history != nil, flights.isEmpty {
                    Text("No flights heard in the last six weeks").foregroundStyle(.secondary)
                }
                if let unread = history?.unreadDays, unread > 0 {
                    Text(unread >= 7 ? "adsb.lol's flight history can't be read now, so only flights followed in this app are listed."
                        : "\(unread == 1 ? "One day" : "\(unread) days") could not be read from adsb.lol just now, so their flights are missing.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if history?.nextUntil != nil {
                    Button(model.fetchingMore ? "Fetching earlier flights…" : "Show earlier flights") { Task { await model.more(hex) } }
                        .disabled(model.fetchingMore)
                }
                ProblemLine(model.problem)
            }
            Section("Airplane") {
                if let model = detail?.description { LabeledContent("Model", value: FlightWords.nameCase(model)) }
                if let op = detail?.operator { LabeledContent("Operator", value: FlightWords.nameCase(op)) }
                LabeledContent("Registration") { RegistrationText(detail?.registration ?? plane?.registration) }
                LabeledContent("Type", value: [detail?.type ?? plane?.type, detail?.year].compactMap { $0 }.joined(separator: " · ").nonEmpty ?? "—")
                LabeledContent("ICAO address", value: hex.uppercased())
                LabeledContent("Callsign", value: plane?.callsign ?? "—")
                if let based { LabeledContent("Based at", value: [based.ident, FlightWords.place(based)].compactMap { $0 }.joined(separator: " · ")) }
                ProblemLine(model.detailProblem)
            }
            if let route {
                // Its flight number's scheduled route, not the flight
                // plan filed, which the FAA does not publish openly.
                Section("Scheduled Route") {
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        Text(route.airports.map(\.ident).joined(separator: " → ")).font(.headline)
                        Text([route.airports.compactMap { $0.location ?? $0.name }.joined(separator: " to "),
                              route.plausible == false ? "not where it is flying now" : nil].compactMap { $0 }.joined(separator: " · "))
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
            if let faa = detail?.faa { FAARecordSection(faa: faa) }
        }
        .navigationTitle(name)
        // A flown flight's card, pushed in this one.
        .navigationDestination(for: PastFlightSummary.self) { flight in PastFlightCard(hex: hex, flight: flight) }
        .task(id: hex) {
            await model.load(hex)
            if let trail = detail?.trail { tracking.seed(trail, for: hex) }
            if let kept { tracking.remember(kept) }
        }
        // Its latest tower departure event, by the ident it files
        // under: its callsign, else its registration (the web's FlightCard).
        .task(id: plane?.callsign ?? detail?.registration ?? plane?.registration) {
            await model.tower((plane?.callsign ?? detail?.registration ?? plane?.registration)?.trimmingCharacters(in: .whitespaces) ?? "")
        }
        .task(id: plane?.callsign) {
            guard let callsign = plane?.callsign?.trimmingCharacters(in: .whitespaces), !callsign.isEmpty else { return }
            await model.loadRoute(callsign: callsign, lat: plane?.lat, lon: plane?.lon)
        }
    }

    private func watchBinding(_ kind: AirplaneWatch.Kind) -> Binding<Bool> {
        Binding(get: { tracking.watching(hex, kind) }, set: { _ in tracking.toggleWatch(AirplaneWatch(hex: hex.lowercased(), name: name, kind: kind)) })
    }
}

extension String {
    /// Nil for an empty string, for a "—" in its place.
    var nonEmpty: String? { isEmpty ? nil : self }
}

/// The flight it is on now, laid out as FlightAware's entry for a flight
/// in the air: how long it has flown, where it left and where it is bound,
/// how it is flying, its squawk, and with own ship known, how far and
/// which way it is and how high against own ship.
struct NowFlightRow: View {
    let plane: TrafficAircraft
    let detail: FlightDetail?
    let route: FlightRoute?
    @Environment(OwnShip.self) private var ownShip

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            HStack {
                Circle().fill(WingtipInk.go).frame(width: 8, height: 8)
                Text(started.map { "In the air · \(FlightWords.lasted(Date().timeIntervalSince1970 - $0))" } ?? "In the air")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(WingtipInk.go)
                Spacer()
                if let type = detail?.type ?? plane.type { Text(type).font(.subheadline).foregroundStyle(.secondary) }
            }
            HStack(alignment: .top) {
                VStack(alignment: .leading) {
                    Text(detail?.departed?.ident ?? route?.airports.first?.ident ?? "?").font(.title3.bold())
                    if let at = detail?.departed?.at { Text(Date(timeIntervalSince1970: at).formatted(date: .omitted, time: .shortened)).font(.footnote) }
                }
                Spacer()
                Image(systemName: "arrow.right")
                Spacer()
                Text(route.flatMap { $0.airports.count > 1 ? $0.airports.last?.ident : nil } ?? "Now").font(.title3.bold())
            }
            Text(flying).font(.subheadline.monospacedDigit().weight(.semibold))
                .accessibilityLabel(spokenFlying)
            if let squawk = plane.squawk {
                // An emergency code says its meaning in words beside the
                // red (FlightWords.squawk), so the colour is not the only
                // sign of it.
                Text("Squawk \(squawk)\(FlightWords.squawk(squawk).map { " · \($0)" } ?? "")")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(FlightWords.squawk(squawk) != nil ? WingtipInk.problem : Color.secondary)
                    .accessibilityLabel("Squawk \(SpokenFigures.digits(squawk))\(FlightWords.squawk(squawk).map { ", \($0)" } ?? "")")
            }
            if let fix = ownShip.fix {
                switch Result(catching: { try FlightWords.fromYou(fix, lat: plane.lat, lon: plane.lon, altitudeFt: plane.altitudeFt) }) {
                case .success(let from): Text(from).font(.subheadline).foregroundStyle(.secondary)
                case .failure(let error): ProblemLine(Result<Void, any Error>.failure(error), "How far it is from you")
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var started: Double? { detail?.departed?.at ?? detail?.trail?.first?.t }

    /// Its height to the 25 ft, its climb, ground speed and track, as sent.
    private var flying: String {
        let rate = plane.verticalFpm ?? 0
        let climb = abs(rate) >= 100 ? "\(rate > 0 ? "↑" : "↓") \((Int((abs(rate) / 100).rounded()) * 100).formatted()) fpm" : "level"
        let height = Format.altitude(plane.altitudeFt.map { ($0 / 25).rounded() * 25 })
        let speed = Format.speed(plane.speedKt)
        let track = plane.trackDeg.map { " · \(Format.heading($0)) true" } ?? ""
        return "\(height) \(climb) · \(speed)\(track)"
    }

    /// The same line in words: the arrows would be read as "up arrow".
    private var spokenFlying: String {
        let rate = plane.verticalFpm ?? 0
        let climb = abs(rate) >= 100 ? "\(rate > 0 ? "climbing" : "descending") \(SpokenFigures.feetPerMinute((abs(rate) / 100).rounded() * 100))" : "level"
        return [plane.altitudeFt.map { SpokenFigures.feet(($0 / 25).rounded() * 25) }, climb, plane.speedKt.map(SpokenFigures.knots),
                plane.trackDeg.map { "track \(SpokenFigures.degrees($0)) true" }].compactMap { $0 }.joined(separator: ", ")
    }
}

/// One of its flights, as FlightAware's list sets it: how it ended and its
/// type, then from and to, each field's town and when.
struct PastFlightRow: View {
    let flight: PastFlightSummary
    let type: String?

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            HStack {
                Text(FlightWords.ended(flight)).foregroundStyle(flight.landed || flight.inAir ? WingtipInk.go : Color.secondary)
                Spacer()
                if let type { Text(type).foregroundStyle(.secondary) }
            }
            .font(.subheadline.weight(.semibold))
            HStack(alignment: .top) {
                end(flight.origin?.ident ?? "?", FlightWords.place(flight.origin), FlightWords.when(flight.off), trailing: false)
                Image(systemName: flight.local ? "arrow.clockwise" : "arrow.right").padding(.top, WingtipSpace.xs)
                end(flight.inAir ? "Now" : flight.destination?.ident ?? "?", flight.inAir ? nil : FlightWords.place(flight.destination),
                    flight.inAir ? nil : FlightWords.when(flight.on), trailing: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func end(_ ident: String, _ place: String?, _ when: String?, trailing: Bool) -> some View {
        VStack(alignment: trailing ? .trailing : .leading, spacing: WingtipSpace.xxs) {
            Text(ident).font(.headline)
            if let place { Text(place).font(.footnote).foregroundStyle(.secondary).lineLimit(1) }
            if let when { Text(when).font(.footnote) }
        }
        .frame(maxWidth: .infinity, alignment: trailing ? .trailing : .leading)
    }
}

/// One of its flights opened: its path on the map in its heights'
/// colours, and its profile, height and ground speed against time, as
/// FlightAware's graph of a flight (the web app's PastFlightChart).
struct PastFlightCard: View {
    @Environment(Replay.self) private var replay
    @Environment(Tracking.self) private var tracking
    let hex: String
    let flight: PastFlightSummary
    @State private var points: [PastFlightPoint] = []
    @State private var problem: String?

    var body: some View {
        List {
            Section { PastFlightRow(flight: flight, type: nil) }
            if points.isEmpty {
                Section("Profile") {
                    Text(problem ?? "Fetching its track…").foregroundStyle(problem == nil ? Color.secondary : WingtipInk.problem)
                }
            } else {
                // Its replay, the airplane flown along it again on the map.
                ReplaySection(points: Replay.points(points), key: replayKey)
                Section {
                    LabeledContent("Highest", value: Format.altitude(flight.maxAltFt))
                    LabeledContent("Flown", value: FlightWords.lasted(flight.on - flight.off))
                }
            }
        }
        .navigationTitle("\(flight.origin?.ident ?? "?") → \(flight.inAir ? "Now" : flight.destination?.ident ?? "?")")
        .task(id: flight.id) {
            do {
                points = try await Planner.pastFlight(hex, id: flight.id).points
                tracking.past = points.map { PathPoint(t: $0.t, lat: $0.lat, lon: $0.lon, altFt: $0.altFt) }
            } catch {
                problem = "Its track could not be had."
            }
        }
        .onDisappear {
            tracking.past = []
            replay.clear(replayKey)
        }
    }

    private var replayKey: String { "past:\(hex):\(flight.id)" }
}

/// A US airplane's FAA registration: who it is registered to and where,
/// whether it is in effect and till when, what it is and its engine, and
/// its airworthiness certificate -- the registry's own record. An owner who
/// asked the FAA to withhold their name (49 U.S.C. 44114) is not in it.
struct FAARecordSection: View {
    let faa: FAARecord

    var body: some View {
        Section("FAA Registration") {
            if let owner = faa.owner {
                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                    Text("Registered to").font(.subheadline.weight(.semibold))
                    Text([owner, faa.ownerType, [faa.city, faa.state].compactMap { $0 }.joined(separator: ", ").nonEmpty,
                          (faa.coOwners ?? 0) > 0 ? "and \(faa.coOwners!) more" : nil, faa.fractional == true ? "fractional" : nil]
                            .compactMap { $0 }.joined(separator: " · ")).font(.footnote).foregroundStyle(.secondary)
                }
            }
            LabeledContent(faa.nNumber) {
                Text(faa.status ?? "—").foregroundStyle(faa.standing == "lapsed" ? WingtipInk.problem : Color.primary)
            }
            if let expires = faa.expires { LabeledContent("Expires", value: expires) }
            if faa.manufacturer != nil || faa.model != nil {
                LabeledContent([faa.manufacturer, faa.model].compactMap { $0 }.joined(separator: " "),
                               value: [faa.year.map { String($0) }, faa.seats.map { "\($0) seats" }].compactMap { $0 }.joined(separator: " · "))
            }
            if let engine = faa.engine {
                LabeledContent(engine, value: [faa.engineType, faa.horsepower.map { "\($0.formatted()) hp" } ?? faa.thrustLb.map { "\($0.formatted()) lb thrust" }]
                    .compactMap { $0 }.joined(separator: " · "))
            }
            if let airworthiness = faa.airworthiness {
                LabeledContent("Airworthiness", value: [airworthiness, faa.airworthinessDate.map { "since \($0)" }].compactMap { $0 }.joined(separator: " · "))
            }
        }
    }
}

private enum PreviewData {
    static let plane = TrafficAircraft(altitudeFt: 4500, callsign: "N3429J", hex: "a8c2e1", lat: 46.84, lon: -92.19, registration: "N3429J",
                                       speedKt: 112, squawk: "1200", trackDeg: 215, type: "P28A", verticalFpm: 0)
    static let faa = FAARecord(airworthiness: "Standard", airworthinessDate: "1998-04-02", city: "Duluth", engine: "Lycoming O-320", engineType: "Reciprocating", expires: "2028-06-30", horsepower: 150, manufacturer: "Piper", model: "PA-28-140", nNumber: "N3429J", owner: "Lake Superior Flying Club", ownerType: "Corporation", seats: 4, standing: "current", state: "MN", status: "Valid", year: 1968)
    static let detail = FlightDetail(departed: FlightDeparted(at: 1_762_180_000, ident: "KDLH", name: "Duluth Intl"), description: "PIPER PA-28-140", faa: faa, hex: "a8c2e1", operator: "LAKE SUPERIOR FLYING CLUB", registration: "N3429J", type: "P28A", year: "1968")
    static let route = FlightRoute(airports: [RouteAirport(ident: "KDLH", location: "Duluth", name: "Duluth Intl"),
                                              RouteAirport(ident: "KBRD", location: "Brainerd", name: "Brainerd Lakes Rgnl")], plausible: true)
    static let flight = PastFlightSummary(destination: PastFlightField(city: "Brainerd", ident: "KBRD", name: "Brainerd Lakes Rgnl", region: "US-MN"), id: 1, inAir: false, landed: true, maxAltFt: 5500, off: 1_762_000_000, on: 1_762_003_120, origin: PastFlightField(city: "Duluth", ident: "KDLH", name: "Duluth Intl", region: "US-MN"))
}

#Preview("NowFlightRow") {
    List { NowFlightRow(plane: PreviewData.plane, detail: PreviewData.detail, route: PreviewData.route) }
        .environment(OwnShip())
}

#Preview("PastFlightRow") {
    List {
        PastFlightRow(flight: PreviewData.flight, type: "P28A")
        PastFlightRow(flight: PastFlightSummary(id: 2, inAir: true, landed: false, maxAltFt: 4500, off: 1_762_180_000, on: 1_762_182_400,
                                                origin: PastFlightField(city: "Duluth", ident: "KDLH", region: "US-MN")), type: "P28A")
    }
}

#Preview("PastFlightCard") {
    NavigationStack { PastFlightCard(hex: "a8c2e1", flight: PreviewData.flight) }
}

#Preview("FlightProfileChart") {
    let start = 1_762_000_000.0
    // Typed out: as one inferred closure the type checker gave up on it.
    let points: [Replay.Point] = (0..<40).map { (i: Int) -> Replay.Point in
        let n = Double(i)
        let climb: Double = Double(min(i, 20)) * 250
        let gust: Double = Double(i % 7) * 3
        return Replay.Point(t: start + n * 60, lat: 46.84 - n * 0.01, lon: -92.19 - n * 0.015,
                            altFt: 1400 + climb, gsKt: 95 + gust)
    }
    return FlightProfileChart(points: points, cursor: points[15])
        .frame(height: 180)
        .padding()
}

#Preview("FAARecordSection") {
    List { FAARecordSection(faa: PreviewData.faa) }
}
