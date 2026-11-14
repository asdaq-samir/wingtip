import SwiftUI

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
    static let detail = FlightDetail(departed: FlightDeparted(at: 1_762_180_000, ident: "KDLH", name: "Duluth Intl"), description: "PIPER PA-28-140", faa: faa, hex: "a8c2e1", operatorName: "LAKE SUPERIOR FLYING CLUB", registration: "N3429J", type: "P28A", year: "1968")
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
