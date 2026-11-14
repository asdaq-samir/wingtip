import CoreLocation
import MapKit
import SwiftUI

/// An airplane being tracked, as FlightAware's flight page and the web
/// app's FlightCard show one, laid out as the airport card is (the owner's
/// C1, 2026-11-14: "make sure the airplane card looks similar to airport
/// card"): its callsign with what it is and who flies it; four tiles --
/// Follow (filled: the map keeps it where it is on the screen), Alert,
/// Debrief (its flight now or its last, replayed) and Favorite; its flight
/// now; its facts in the sideways strip (AirplaneFacts); its photo and
/// where it has flown as the picture tiles; then Info (what it is, its
/// scheduled route, the FAA's record) or Flights (the ones before), in the
/// floating glass bar at the card's foot, Info first. Seconds-old internet
/// data from adsb.lol's receivers: for knowing what is about, not for
/// avoiding it.
struct AirplaneCard: View {
    @Environment(Tracking.self) private var tracking
    let hex: String
    @Environment(\.undoManager) private var undoManager
    @Environment(\.cardAtPill) private var atPill
    @Environment(\.lookAccent) private var accent
    @State private var model = AirplaneCardModel()
    @State private var tab: Tab = .info
    @State private var photo: APIAirplanePhoto?
    /// The flight Debrief opened, pushed in this card.
    @State private var debrief: PastFlightSummary?

    /// Its pages: what it is first, as the airport card's Info, then its
    /// earlier flights.
    enum Tab: String, CaseIterable { case info = "Info", flights = "Flights" }

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
    /// Its flight now, else its last: what Debrief replays.
    private var debriefed: PastFlightSummary? { flights.first }

    var body: some View {
        List {
            Section {
                head
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
            if let plane {
                Section {
                    NowFlightRow(plane: plane, detail: detail, route: route?.plausible == false ? nil : route)
                    if let towerLine = model.towerLine {
                        Label(towerLine, systemImage: "building.columns").font(.subheadline).foregroundStyle(.secondary)
                    }
                    ProblemLine(model.nowProblem)
                }
            }
            Section {
                AirplaneFacts(record: detail?.faa, type: detail?.type ?? plane?.type, year: detail?.year)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
            Section {
                PictureStrip {
                    if let photo { AirplanePhotoTile(photo: photo, name: name) }
                    FlownSketchTile(points: sketchPoints, name: name)
                }
            }
            switch tab {
            case .info: info
            case .flights: earlier
            }
        }
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(removing: .title)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                ShareLink(item: link, subject: Text(name)) { Label("Share", systemImage: WingtipIcon.share) }
            }
            CardTabBar(tab: $tab, items: Tab.allCases.map { .init(tab: $0, title: $0.rawValue) }, atPill: atPill, accent: accent)
        }
        // A flown flight's card, pushed in this one: from its row, or Debrief's.
        .navigationDestination(for: PastFlightSummary.self) { flight in PastFlightCard(hex: hex, flight: flight) }
        .navigationDestination(item: $debrief) { flight in PastFlightCard(hex: hex, flight: flight) }
        .task(id: hex) {
            await model.load(hex)
            if let trail = detail?.trail { tracking.seed(trail, for: hex) }
            if let kept { tracking.remember(kept) }
        }
        // Its Planespotters.net photo, by its N-number where it has one.
        .task(id: detail?.faa?.nNumber ?? detail?.registration) {
            guard let tail = detail?.faa?.nNumber ?? detail?.registration, tail.hasPrefix("N") else { return }
            photo = try? await Planner.airplanePhoto(tail)
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

    /// Where it has flown today, for the sketch: the trail heard.
    private var sketchPoints: [CLLocationCoordinate2D] {
        let heard = tracking.hex == hex.lowercased() ? tracking.path.map(\.coordinate) : []
        return heard.count > 1 ? heard : (detail?.trail ?? []).map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) }
    }

    /// Its name, what it is and who flies it, centred, then the four tiles.
    private var head: some View {
        VStack(spacing: WingtipSpace.md) {
            VStack(spacing: WingtipSpace.xs) {
                Text(name).font(WingtipType.card).accessibilityAddTraits(.isHeader)
                let what = [detail?.description.map(FlightWords.nameCase) ?? detail?.type ?? plane?.type,
                            detail?.operatorName.map(FlightWords.nameCase)].compactMap { $0 }.joined(separator: " · ")
                if !what.isEmpty { Text(what).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center) }
            }
            HStack(spacing: WingtipSpace.sm) {
                // Follow filled, the card's first thing to do; nothing to
                // follow where it is not heard now.
                let following = tracking.follow && plane != nil
                Toggle(isOn: Binding(get: { following }, set: { tracking.follow = $0 })) {
                    ActionFace(systemImage: "scope", title: following ? "Following" : "Follow")
                }
                .toggleStyle(.button)
                .glassProminentButton()
                .disabled(plane == nil)
                .accessibilityLabel(following ? "Stop following \(name)" : "Follow \(name) on the map")
                Menu {
                    Toggle("Tell me when it takes off", isOn: watchBinding(.takeoff))
                    Toggle("Tell me when it lands", isOn: watchBinding(.land))
                } label: {
                    ActionFace(systemImage: tracking.watching(hex, .takeoff) || tracking.watching(hex, .land) ? "bell.fill" : "bell", title: "Alert")
                }
                .glassButton()
                Button { debrief = debriefed } label: { ActionFace(systemImage: "chart.xyaxis.line", title: "Debrief") }
                    .glassButton()
                    .disabled(debriefed == nil)
                let starred = tracking.isFavorite(hex)
                Toggle(isOn: Binding(get: { starred }, set: { _ in if let kept { tracking.toggleFavorite(kept, undo: undoManager) } })) {
                    ActionFace(systemImage: starred ? "\(WingtipIcon.favorite).fill" : WingtipIcon.favorite, title: "Favorite",
                               symbolColour: starred ? Color(uiColor: WingtipColor.Brand.taxiwayYellow) : nil)
                }
                .toggleStyle(.button)
                .glassButton()
                .disabled(kept == nil)
                .accessibilityLabel(starred ? "Remove from Favorites" : "Add to Favorites")
            }
            .glassGroup(spacing: WingtipSpace.sm)
            .dynamicTypeSize(...DynamicTypeSize.accessibility2)
        }
        .padding(.horizontal, WingtipSpace.lg)
        .padding(.vertical, WingtipSpace.md)
    }

    /// Info: what it is, its flight number's scheduled route and the FAA's record.
    @ViewBuilder private var info: some View {
        Section("Airplane") {
            if let model = detail?.description { LabeledContent("Model", value: FlightWords.nameCase(model)) }
            if let op = detail?.operatorName { LabeledContent("Operator", value: FlightWords.nameCase(op)) }
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

    /// Flights: the ones before the flight it is on, each replayed.
    private var earlier: some View {
        Section(plane != nil ? "Earlier Flights" : "Last Flights") {
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
                // In the air as its badge (rules.md §9), an emergency's
                // code as the emergency's (AIM 6-2-2), how long after it.
                if let squawk = plane.squawk, FlightWords.squawk(squawk) != nil {
                    StatusBadge(.emergency, words: squawk)
                }
                StatusBadge(.inAir)
                if let started { Text(FlightWords.lasted(Date().timeIntervalSince1970 - started)).font(.subheadline.weight(.semibold)) }
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

    /// Its height to the 100 ft (Format.trafficAltitude), its climb, ground speed and track, as sent.
    private var flying: String {
        let rate = plane.verticalFpm ?? 0
        let climb = abs(rate) >= 100 ? "\(rate > 0 ? "↑" : "↓") \((Int((abs(rate) / 100).rounded()) * 100).formatted()) fpm" : "level"
        let height = Format.trafficAltitude(plane.altitudeFt)
        let speed = Format.speed(plane.speedKt)
        let track = plane.trackDeg.map { " · \(Format.heading($0)) true" } ?? ""
        return "\(height) \(climb) · \(speed)\(track)"
    }

    /// The same line in words: the arrows would be read as "up arrow".
    private var spokenFlying: String {
        let rate = plane.verticalFpm ?? 0
        let climb = abs(rate) >= 100 ? "\(rate > 0 ? "climbing" : "descending") \(SpokenFigures.feetPerMinute((abs(rate) / 100).rounded() * 100))" : "level"
        return [plane.altitudeFt.map { SpokenFigures.feet(Format.trafficFeet($0)) }, climb, plane.speedKt.map(SpokenFigures.knots),
                plane.trackDeg.map { "track \(SpokenFigures.degrees($0)) true" }].compactMap { $0 }.joined(separator: ", ")
    }
}
