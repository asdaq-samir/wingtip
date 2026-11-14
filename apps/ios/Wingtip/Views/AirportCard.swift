import SwiftUI

/// A field's card, laid out after Apple Maps' place card (the owner's C1,
/// 2026-11-14, sending Maps' Teriyaki Madness card: "How can we make our
/// airport card more similar to this? Can tabs be similar to that floating
/// buttons group at the bottom?"; the web's PlaceCard): the head
/// (AirportPlaceHead) -- at full height the field's picture fading in,
/// then its name, "Towered" or "Non-towered" and where, the four actions
/// and the sideways strip of facts -- then the pictures as large tiles
/// over every tab (AirportTiles), then the tab's page; its tabs Info,
/// Weather, Runways and Charts in the floating glass bar at the card's
/// foot (CardTabBar), out of sight at the pill. Share is at the bar's
/// start, the close at its end, as every card's head.
struct AirportCard: View {
    let ident: String
    @Environment(Plan.self) private var plan
    @Environment(Verdict.self) private var verdict
    @Environment(\.cardExpanded) private var expanded
    @Environment(\.cardAtPill) private var atPill
    @Environment(\.lookAccent) private var accent
    @State private var place: AirportPlace?
    /// The field's live reports (D-ATIS, RVR, programs), the tabs' own.
    @State private var live = AirportLive()
    @State private var problem: String?
    @State private var notFound = false
    @State private var photos: AirportPhotos?
    /// NASR's fuels for sale, for the facts' Fuel.
    @State private var fuel: [String]?
    /// The field's own NOTAMs and the TFRs near it, read by the engine and
    /// marked on what they address (FieldNotams), for the Info tab's list
    /// and the badges.
    @State private var notams = FieldNotams()
    @State private var tab: CardTab = .info
    @State private var shown: ShownPicture?
    /// Scrolled past the head: its name in the bar (the owner's scrolling
    /// rule, 2026-11-10).
    @State private var pinned = false
    @Environment(AirportShelf.self) private var shelf

    /// The card's pages, in the pilot's order (the web app's CARD_TABS).
    enum CardTab: String, CaseIterable, Identifiable {
        case info = "Info", weather = "Weather", runways = "Runways", charts = "Charts"
        var id: String { rawValue }
    }

    var body: some View {
        List {
            if let place {
                Section {
                    AirportPlaceHead(place: place, photos: photos, shown: $shown, fuel: fuel)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
                Section { AirportTiles(place: place, photos: photos, shown: $shown) }
                switch tab {
                case .info:
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
        .toolbarBackgroundVisibility(.hidden, for: .navigationBar)
        .toolbar {
            if let place {
                ToolbarItem(placement: .topBarLeading) {
                    ShareLink(item: URL(string: "https://\(Config.host)/app/plan?place=\(place.ident)")!, subject: Text(place.name)) {
                        Label("Share", systemImage: WingtipIcon.share)
                    }
                }
                CardTabBar(tab: $tab, items: Self.tabs(place), atPill: atPill, accent: accent)
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
            async let services = try? Planner.services(ident)
            async let notices: Void = notams.load(ident)
            await load()
            photos = await pictures
            fuel = await services?.fuelTypes
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

    /// The tabs in the bar, each with why to open it beside its name:
    /// Weather the field's own report's category (the engine's
    /// flight_category, as the planner sends it), said for VoiceOver, as
    /// the facts' badge shows it; Charts its count, none at 0.
    static func tabs(_ place: AirportPlace) -> [CardTabBar<CardTab>.Item] {
        CardTab.allCases.map { tab in
            switch tab {
            case .weather: .init(tab: tab, title: tab.rawValue, hint: place.metar?.flightCategory)
            case .charts: .init(tab: tab, title: tab.rawValue, hint: chartCount(place).map(String.init), shown: true)
            default: .init(tab: tab, title: tab.rawValue)
            }
        }
    }

    /// The charts the Charts tab lists: the d-TPP plates (the diagram's own
    /// APD entry left out) and the diagram once; nil at 0.
    static func chartCount(_ place: AirportPlace) -> Int? {
        let count = (place.procedures ?? []).filter { $0.kind != "APD" }.count + (place.airportDiagramUrl != nil ? 1 : 0)
        return count > 0 ? count : nil
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
