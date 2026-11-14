import SwiftUI

/// A field's card, built as Apple's Maps builds a place card on iOS 27
/// (the owner's screenshot, 2026-11-09): the head (AirportPlaceHead) -- at
/// full height the field's picture fading in, then its name, what and
/// where it is, the four actions and the four facts -- then four tabs,
/// directly under them so they are in sight at half height (the owner's
/// T4, 2026-11-14), with the field's report in a line under them: Info
/// (the picture tiles, the plan through it, the radio, the lights, what is
/// on the ground), Weather, Runways and Charts; at its foot the system's
/// floating glass toolbar (AirportCardToolbar).
struct AirportCard: View {
    let ident: String
    @Environment(Plan.self) private var plan
    @Environment(Verdict.self) private var verdict
    @Environment(OwnShip.self) private var ownShip
    /// Back to the plan once an action has set it (PlanSheet).
    @Environment(\.showPlan) private var showPlan
    @Environment(\.dismiss) private var dismiss
    @Environment(\.cardExpanded) private var expanded
    @State private var place: AirportPlace?
    /// The field's live reports (D-ATIS, RVR, programs), the tabs' own.
    @State private var live = AirportLive()
    @State private var problem: String?
    @State private var notFound = false
    @State private var photos: AirportPhotos?
    /// The field's own NOTAMs and the TFRs near it, read by the engine and
    /// marked on what they address (FieldNotams), for the Info tab's list,
    /// the badges and the tile's count.
    @State private var notams = FieldNotams()
    @State private var tab: CardTab = .info
    @State private var shown: ShownPicture?
    /// Scrolled past the head: its name in the bar and the section picker
    /// pinned under it (the owner's scrolling rule, 2026-11-10).
    @State private var pinned = false
    @Environment(AirportShelf.self) private var shelf

    /// The card's pages, in the pilot's order (the web app's CARD_TABS).
    enum CardTab: String, CaseIterable, Identifiable {
        case info = "Info", weather = "Weather", runways = "Runways", charts = "Charts"
        var id: String { rawValue }
    }

    /// The card's sections, in the list under the actions and pinned under
    /// the bar once the head has scrolled away.
    private func sectionPicker(_ place: AirportPlace) -> some View {
        AirportTabBar(tab: $tab, place: place)
    }

    var body: some View {
        List {
            if let place {
                Section {
                    AirportPlaceHead(place: place, photos: photos, shown: $shown)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
                Section {
                    VStack(alignment: .leading, spacing: WingtipSpace.md) {
                        sectionPicker(place).opacity(pinned ? 0 : 1)
                        AirportWeatherLine(metar: place.metar)
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                switch tab {
                case .info:
                    // The pictures first on Info, as Maps' place card has
                    // its photos (T4: they sat above the tabs).
                    Section {
                        AirportTiles(place: place, photos: photos, shown: $shown, tab: $tab, notams: notams.ranked)
                    }
                    AirportReadyCard(ident: place.ident)
                    AirportInfoTab(place: place)
                case .weather: AirportWeatherTab(place: place, refresh: refresh)
                case .runways: AirportRunwaysTab(place: place)
                case .charts: AirportChartsTab(place: place, shown: $shown)
                }
            } else if let problem {
                // Said in place (ProblemLine); a field not found has
                // nothing to ask again.
                Section {
                    ProblemLine(notFound ? "No field \(ident). \(problem)" : problem)
                    if !notFound { Button("Try Again") { Task { await load() } } }
                }
            } else {
                Section { ForEach(["Elevation", "Longest runway", "Tower", "Fuel"], id: \.self) { LabeledContent($0, value: "Figure").loading("Fetching \(ident)") } }
            }
        }
        // Inset-grouped rows under a large title, as iOS's own cards are
        // (the owner, 2026-11-09: every card the iOS-native way).
        .listStyle(.insetGrouped)
        // At full height the picture runs up under the bar, its close a
        // glass button over it, as Maps' does; half way the name is first.
        .ignoresSafeArea(.container, edges: expanded && place != nil ? .top : [])
        .navigationTitle(ident)
        .navigationBarTitleDisplayMode(.inline)
        // The head is the title until it scrolls away; no head yet, the ident.
        .modifier(PinnedHead(pinned: pinned || place == nil))
        .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 180 } action: { _, past in
            if past != pinned { pinned = past }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if pinned, let place {
                sectionPicker(place)
                    .padding(.horizontal, WingtipSpace.lg)
                    .padding(.vertical, WingtipSpace.xs)
                    .background(.bar)
            }
        }
        .toolbarBackgroundVisibility(.hidden, for: .navigationBar)
        .toolbar {
            if let place {
                AirportCardToolbar(place: place, plan: plan, fix: ownShip.fix) {
                    if let showPlan { showPlan() } else { dismiss() }
                }
            }
        }
        .environment(live)
        .environment(notams)
        .navigationDestination(item: $notams.opened) { NotamsOnPage(notams: notams, open: $0) }
        .onChange(of: place) { _, fresh in notams.attach(fresh) }
        .fullScreenCover(item: $shown) { PictureViewer(picture: $0) }
        // The live reports, asked again while the card is open; the RVR
        // judged against the pilot's own visibility minimum.
        .task(id: "\(ident)|\(verdict.minimums.visibilitySm ?? -1)") { await live.watch(ident, minimumSm: verdict.minimums.visibilitySm) }
        .task(id: ident) {
            // The pictures are the card's look, not a figure: none where they can't be had.
            async let pictures = try? Planner.photos(ident)
            async let notices: Void = notams.load(ident)
            await load()
            photos = await pictures
            await notices
            notams.attach(place)
            // The weather a report's freshness: asked again every five
            // minutes while the card is open, as the web app's is.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(300))
                guard !Task.isCancelled else { break }
                if let fresh = try? await KeptForAir.answer(.airports, key: ident, fetch: { try await Planner.place(ident) }) { place = fresh.value }
            }
        }
    }

    /// The Weather tab's Refresh (no pull to refresh in a sheet, IOS-3;
    /// rules.md: an airport card's refresh is in its Weather tab): the
    /// field's weather, its NOTAMs, the ATIS and the RVR asked again.
    private func refresh() async {
        async let field: Void = load()
        async let notices: Void = notams.load(ident, force: true)
        await live.loadDatis(ident)
        await live.loadRvr(ident, minimumSm: verdict.minimums.visibilitySm)
        await field
        await notices
    }

    private func load() async {
        problem = nil
        do {
            // Fifteen seconds with no answer and the card says so.
            let fresh = try await KeptForAir.answer(.airports, key: ident) { try await Planner.place(ident, timeout: 15) }.value
            place = fresh; problem = nil
            shelf.opened(KeptAirport(fresh))
        } catch let failure as Planner.Failure where failure.status == 404 {
            notFound = true
            problem = "The planner knows no field by that identifier."
        } catch {
            if place == nil { problem = error.localizedDescription }
        }
    }

    /// The field in Apple's Maps by its street address where the FAA
    /// lists one, so Maps names the road a driver is taken to, and by
    /// where it is otherwise; its name the pin's either way.
    static func mapsLink(_ place: AirportPlace) -> URL {
        var parts = URLComponents(string: "https://maps.apple.com/")!
        parts.queryItems = [URLQueryItem(name: "q", value: place.name)] + (place.address.map { [URLQueryItem(name: "address", value: $0)] }
            ?? [URLQueryItem(name: "ll", value: AirportWords.point(place.lat, place.lon))])
        return parts.url!
    }
}

/// Weather: the report first, its age first of all, each figure with its
/// glyph and the report as sent under them; for a field with no report,
/// the weather modelled at it and the nearest station's report.
struct AirportWeatherTab: View {
    @Environment(ClearanceListener.self) private var listener
    let place: AirportPlace
    /// The card's Refresh, asked from the tab's foot; none in a preview.
    var refresh: (() async -> Void)?
    @State private var refreshing = false

    var body: some View {
        if let metar = place.metar {
            // Weather's layout: the takeaway, the TAF's periods, the
            // modules and the reports as sent (FieldWeather).
            FieldWeatherSection(place: place, metar: metar)
        } else {
            Section {
                ReceiverReportRows(ident: place.ident, otherwise: place.weatherUnavailable == true ? "The weather service could not be reached" : "No weather station reports from this field")
            }
        }
        // The National Weather Service's Gridded LAMP at the field for the
        // hour (wingtip.glmp): planning guidance from a model, not a report.
        if place.metar == nil, let modelled = place.modelledWeather {
            Section("Modelled for \(AirportWords.date(modelled.validAt).map(Format.zulu) ?? modelled.validAt)") {
                figure("cloud.sun", "Flight category", modelled.flightCategory, spoken: SpokenFigures.flightCategory(modelled.flightCategory))
                // GLMP's most is 10 sm, as a METAR's "10SM" is.
                figure("eye", "Visibility", modelled.visibilitySm >= 10 ? "10+ sm" : "\(AirportWords.plain(modelled.visibilitySm)) sm",
                       spoken: modelled.visibilitySm >= 10 ? "ten statute miles or more" : SpokenFigures.statuteMiles(modelled.visibilitySm))
                figure("cloud", "Ceiling", modelled.ceilingFt.map { Format.altitude($0) } ?? "None", spoken: modelled.ceilingFt.map(SpokenFigures.feet))
            }
        }
        DigitalAtisSections()
        if listener.canListen { AtisSection() } // heard on the iPhone or not offered
        if place.metar == nil, let nearby = place.nearbyMetar {
            Section("Nearest Report, \(Format.distance(nearby.distanceNm, decimals: 0)) \(AirportWords.compassPoint(Double(nearby.bearingDeg)))") {
                CardRow(title: nearby.ident, detail: nearby.metar.observedAt.flatMap { AirportWords.observedSaid($0) }) {
                    if let category = nearby.metar.flightCategory {
                        Text(category).fontWeight(.semibold).accessibilityLabel(SpokenFigures.flightCategory(category))
                    }
                }
                if let raw = nearby.metar.raw { Text(raw).font(.footnote.monospaced()).textSelection(.enabled) }
            }
        }
        if let refresh {
            Section {
                Button(refreshing ? "Refreshing…" : "Refresh Weather", systemImage: "arrow.clockwise") {
                    refreshing = true
                    Task {
                        await refresh()
                        refreshing = false
                    }
                }
                .disabled(refreshing)
            }
        }
    }

    /// Listen to ATIS: one broadcast heard through the microphone
    /// (ClearanceListener.hearBroadcast, the radio's recognizer), read by the
    /// engine (Atis), and what matters at the hold-short line in one
    /// line -- the runway in use and the altimeter -- with the figures
    /// in a short table under it and the transcript folded away. A
    /// failure is said in the row (ProblemLine), not an alert.
    struct AtisSection: View {
        @Environment(ClearanceListener.self) private var listener
        @State private var listening = false
        @State private var heard = ""
        @State private var reading: Atis?
        @State private var problem: String?
        @State private var hearing: Task<Void, Never>?

        var body: some View {
            Section {
                Button {
                    if listening {
                        listener.stop()
                        return
                    }
                    listening = true
                    problem = nil
                    reading = nil
                    heard = ""
                    hearing = Task { @MainActor in
                        let text = await listener.hearBroadcast { heard = $0 }
                        listening = false
                        guard let text else {
                            problem = listener.problem ?? "Nothing could be heard."
                            return
                        }
                        guard !text.isEmpty else {
                            problem = "Nothing was heard. Tune the ATIS, hold the phone to the speaker and tap again."
                            return
                        }
                        let read: Atis
                        do { read = try Atis.read(text) } catch {
                            problem = "The broadcast could not be read: \(error.localizedDescription)"
                            return
                        }
                        reading = read
                        if !read.heardAny { problem = "Nothing of a broadcast was heard in that." }
                    }
                } label: {
                    CardRow(badge: RowBadge(systemImage: "dot.radiowaves.left.and.right", colour: Badge.weather),
                            title: listening ? "Listening to the radio…" : "Listen to ATIS",
                            detail: listening ? (heard.isEmpty ? "Tune the ATIS or AWOS and hold the phone to the speaker" : heard) : nil) {
                        if listening { ProgressView() }
                    }
                }
                .accessibilityLabel(listening ? "Stop listening" : "Listen to ATIS")
                ProblemLine(problem)
                if let reading, reading.heardAny {
                    CardRow(title: reading.glance) {
                        if let letter = reading.information { Text("Information \(letter)") }
                    }
                    ForEach(Array(reading.rows.enumerated()), id: \.offset) { _, row in
                        LabeledContent(row.label, value: row.value)
                    }
                }
                if let reading {
                    DisclosureGroup("Transcript") {
                        Text(reading.raw).font(.footnote.monospaced()).foregroundStyle(.secondary).textSelection(.enabled)
                    }
                }
            }
            .onDisappear { hearing?.cancel(); if listening { listener.stop() } }
        }
    }

    /// One figure of the report; `spoken` is the figure as VoiceOver says
    /// it (SpokenFigures), where "29.92 inHg" would be read as letters.
    private func figure(_ symbol: String, _ title: String, _ value: String, spoken: String? = nil) -> some View {
        CardRow(badge: RowBadge(systemImage: symbol, colour: Badge.weather), title: title) {
            Text(value).fontWeight(.semibold).accessibilityLabel(spoken ?? value)
        }
    }
}

/// A field with its weather, runways surveyed at both ends (so the
/// sketch draws with no network), an FAA diagram by its address and a
/// few plates.
private enum PreviewData {
    static let place = AirportPlace(
        address: "4701 Grinden Dr, Duluth, MN 55811",
        airportDiagramUrl: "https://aeronav.faa.gov/d-tpp/2511/00126AD.PDF",
        airspaceClass: "D",
        chartSupplementUrl: "https://aeronav.faa.gov/afd/03nov2026/nc_181_03NOV2026.pdf",
        elevationFt: 1428,
        frequencies: [
            Frequency(description: "ATIS", frequencyMhz: 124.1, type: "ATIS"),
            Frequency(description: "DULUTH TOWER", frequencyMhz: 118.3, type: "TWR"),
            Frequency(description: "GROUND", frequencyMhz: 121.9, type: "GND"),
            Frequency(description: "DULUTH APPROACH", frequencyMhz: 125.45, type: "APP"),
        ],
        ident: "KDLH",
        kind: "large_airport",
        lat: 46.8420,
        lighting: ["Runway lights on from dusk to dawn"],
        lon: -92.1936,
        metar: Metar(altimeterInHg: 30.12, dewpointC: -3, flightCategory: "VFR", observedAt: "2026-11-03T14:53:00Z",
                     raw: "KDLH 031453Z 27009KT 10SM FEW040 BKN250 04/M03 A3012", tempC: 4, visibilitySm: 10, windDirTrueDeg: 270,
                     windSpeedKt: 9),
        municipality: "Duluth",
        name: "Duluth Intl",
        pattern: TrafficPattern(aglFt: 1000, altitudeFt: 2428, published: false),
        phone: "218 555 0100",
        procedures: [
            TerminalChart(kind: "IAP", name: "ILS OR LOC RWY 09", url: "https://aeronav.faa.gov/d-tpp/2511/00126IL9.PDF"),
            TerminalChart(kind: "IAP", name: "RNAV (GPS) RWY 27", url: "https://aeronav.faa.gov/d-tpp/2511/00126R27.PDF"),
            TerminalChart(kind: "DP", name: "DULUTH ONE", url: "https://aeronav.faa.gov/d-tpp/2511/00126DULUTH.PDF"),
            TerminalChart(kind: "MIN", name: "TAKEOFF MINIMUMS", url: "https://aeronav.faa.gov/d-tpp/2511/NC1TO.PDF"),
        ],
        radioNotes: ["A radio check on the CTAF: key the mic three times"],
        region: "US-MN",
        runways: [
            Runway(closed: false, ends: "09/27", lengthFt: 10162, lighted: true, runwayEnds: [RunwayEnd(headingTrueDeg: 92, ident: "09", lat: 46.8415, lon: -92.2140),
                                                                                              RunwayEnd(headingTrueDeg: 272, ident: "27", lat: 46.8425, lon: -92.1733, traffic: "right")],
                   surface: "ASPH", widthFt: 150, wind: RunwayWind(crosswindKt: 4, end: "27", headwindKt: 9)),
            Runway(closed: false, ends: "03/21", lengthFt: 5719, lighted: true, runwayEnds: [RunwayEnd(headingTrueDeg: 33, ident: "03", lat: 46.8355, lon: -92.2005),
                                                                                             RunwayEnd(headingTrueDeg: 213, ident: "21", lat: 46.8490, lon: -92.1880)],
                   surface: "ASPH", widthFt: 150),
        ],
        standardKeying: true,
        towered: true)
}

#Preview("AirportPlaceHead") {
    @Previewable @State var shown: ShownPicture? = nil
    List { AirportPlaceHead(place: PreviewData.place, photos: nil, shown: $shown).listRowInsets(EdgeInsets()) }
        .environment(Plan()).environment(OwnShip()).environment(Charts()).environment(FieldNotams())
}

#Preview("AirportInfoTab") {
    List { AirportInfoTab(place: PreviewData.place) }.environment(AirportLive()).environment(FieldNotams())
}

#Preview("AirportWeatherTab") {
    List { AirportWeatherTab(place: PreviewData.place) }.environment(AirportLive()).environment(FieldNotams())
}

#Preview("AirportRunwaysTab") {
    List { AirportRunwaysTab(place: PreviewData.place) }.environment(AirportLive()).environment(FieldNotams())
}

#Preview("AirportChartsTab") {
    @Previewable @State var shown: ShownPicture? = nil
    List { AirportChartsTab(place: PreviewData.place, shown: $shown) }.environment(FieldNotams())
}

/// The bar's title hidden while the card's own head shows the name, and
/// back once the head has scrolled away, so the name and the close always
/// stay in sight.
private struct PinnedHead: ViewModifier {
    let pinned: Bool

    func body(content: Content) -> some View {
        if pinned { content } else { content.toolbar(removing: .title) }
    }
}
