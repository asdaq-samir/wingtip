import SwiftUI

/// An airplane's card, opened by tapping its N-number anywhere (the route
/// line and the strip, the Airplane tab and its picker, the search, the
/// logbook's rows, an inline ask's Edit), laid out as the airport card is
/// (the owner's P1 and C1, 2026-11-14: "make sure the airplane card looks
/// similar to airport card"; the web's AirplaneProfileSheet): its head
/// (AirplanePlaceHead), its one status line, its facts in the sideways
/// strip (AirplaneFacts), its photo as a picture tile, then the tab's page,
/// Info and Flights in the floating glass bar at the card's foot, Info
/// first and Flights with its count, as the web's (2026-11-27). Info is its
/// whole public record (AirplaneInfoSections); Flights its flights by the
/// registry's address, each replayed from its row. Its Figures a page of
/// their own from its fourth button (AirplaneFiguresPage), and Share in its
/// head, as the web's CardTitle. The one profile card (the owner's card
/// rule, 2026-11-10). Its state is AirplaneProfileModel's and
/// AirplaneLookup's.
struct AirplaneProfileView: View {
    @Environment(Airplanes.self) private var airplanes
    @Environment(Navigator.self) private var nav
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @Environment(Tracking.self) private var tracking
    @Environment(\.lookAccent) private var accent
    @Environment(\.cardAtPill) private var atPill
    /// Back to the plan once flown, where the profile was opened over it.
    @Environment(\.showPlan) private var showPlan
    /// Other Airplanes' switch in Settings' Extras (Extra).
    @AppStorage(Extra.otherAirplanes.key) private var others = false
    @State private var model: AirplaneProfileModel
    @State private var lookup = AirplaneLookup()
    @State private var tab: ProfileTab = .info
    /// Its Figures page pushed over it: from the start where a figure was asked for.
    @State private var figuresOpen: Bool
    private let focus: OwnFigure?

    init(tail: String, focus: OwnFigure? = nil) {
        _model = State(initialValue: AirplaneProfileModel(tail: tail))
        _figuresOpen = State(initialValue: focus != nil)
        self.focus = focus
    }

    /// One of the pilot's airplanes: its registrant is named (RegistryNames).
    private var own: Bool { RegistryNames.own(model.tail, among: airplanes.records.map(\.tailNumber)) }
    /// Whether its Follow, flights and history are offered: the pilot's
    /// own -- on their records or the one flown -- always, another's while
    /// Other Airplanes is on (Extra.airplaneHistory); else neither shown
    /// nor its flights fetched.
    private var offersHistory: Bool {
        Extra.airplaneHistory(model.tail, own: airplanes.records.map(\.tailNumber) + [plan.tail].compactMap { $0 }, others: others)
    }

    /// The card's pages, in the web's order.
    enum ProfileTab: String, CaseIterable, Identifiable {
        case info = "Info", flights = "Flights"
        var id: String { rawValue }
    }

    /// Its four actions' facts (AirplaneActions): in the air where it is
    /// heard flying, kept by the registry's ICAO address.
    private var actionState: AirplaneActionState {
        let hex = model.registration?.modeSHex?.lowercased()
        let plane = lookup.flying
        return AirplaneActionState(name: model.tail, hex: hex, airborne: plane != nil, heard: plane != nil,
                                   tracked: tracking.follow && plane.map { tracking.hex == $0.hex.lowercased() } == true,
                                   tail: model.tail, booked: model.stock != nil, owned: own, flying: plan.tail == model.tail,
                                   kept: hex.map { KeptAirplane(hex: $0, name: model.tail, type: model.typeLine) })
    }

    var body: some View {
        Form {
            Section {
                AirplanePlaceHead(model: model) {
                    AirplaneActions(state: actionState, follow: follow, fly: fly) { figuresOpen = true }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            Section {
                VStack(alignment: .leading, spacing: WingtipSpace.md) {
                    statusLine
                    AirplaneFacts(record: model.registration, own: own, model: lookup.details?.model)
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if let photo = lookup.photo {
                Section { PictureStrip { AirplanePhotoTile(photo: photo, name: model.tail) } }
            }
            // Info in Flights' place where its flights are not offered.
            switch tab == .flights && !offersHistory ? .info : tab {
            case .flights: flights
            case .info: AirplaneInfoSections(record: model.registration, details: lookup.details, detailsFailed: lookup.detailsFailed,
                                             own: own, history: offersHistory)
            }
        }
        .navigationTitle(model.tail)
        .navigationBarTitleDisplayMode(.inline)
        // The N-number is the head's, large and centred, as Maps' card.
        .toolbar(removing: .title)
        .toolbar {
            // Share at the head's start, as the web's CardTitle.
            ToolbarItem(placement: .topBarLeading) {
                ShareLink(item: Config.gateway.appending(path: "/app/plan").appending(queryItems: [URLQueryItem(name: "airplane", value: model.tail)]),
                          subject: Text(model.tail)) { Label("Share", systemImage: WingtipIcon.share) }
                    .accessibilityLabel("Share \(model.tail)")
                    .accessibilityIdentifier("airplane-share")
            }
            if offersHistory {
                CardTabBar(tab: $tab, items: tabs, atPill: atPill, accent: accent)
            }
        }
        .navigationDestination(isPresented: $figuresOpen) { AirplaneFiguresPage(model: model, focus: focus) }
        // A flown flight's card, its replay, pushed in this one.
        .navigationDestination(for: PastFlightSummary.self) { flight in
            if let hex = model.registration?.modeSHex { PastFlightCard(hex: hex.lowercased(), flight: flight) }
        }
        .task {
            // The record at once; whether it is in the air, its whole
            // record, its photo and its flights after, each on its own.
            await model.load(signedIn: session.signedIn)
            await lookup.load(tail: model.tail, hex: model.registration?.modeSHex, flights: offersHistory)
        }
    }

    /// Track: the map keeps it in sight, from its last report; let go, the
    /// map stays where it is (the web's follow).
    private func follow(_ on: Bool) {
        if on, let plane = lookup.flying { tracking.track(plane.hex, plane: plane) }
        tracking.follow = on
    }

    /// The plan flown with this airplane, then the plan shown.
    private func fly() {
        Task {
            await plan.fly(tail: model.tail, own: airplanes.records, names: Array(airplanes.books.keys))
            if let showPlan { showPlan() } else { nav.showPlan() }
        }
    }

    /// The tabs in the bar, Flights with its count.
    private var tabs: [CardTabBar<ProfileTab>.Item] {
        ProfileTab.allCases.filter { $0 != .flights || offersHistory }.map { tab in
            let count = tab == .flights ? lookup.flights.map(\.count).flatMap { $0 > 0 ? String($0) : nil } : nil
            return .init(tab: tab, title: tab.rawValue, hint: count, shown: true)
        }
    }

    /// The one status line (AirplaneLookup.status): "In the air" or "On the
    /// ground" as its badge with the rest after it; in the air, a tap
    /// tracking it on the map.
    @ViewBuilder private var statusLine: some View {
        let status = lookup.status()
        let line = HStack(spacing: WingtipSpace.sm) {
            if let badge = status.badge { StatusBadge(badge) }
            Text(status.badge == nil ? status.text : status.rest ?? "")
                .foregroundStyle(status.problem ? AnyShapeStyle(WingtipInk.problem) : AnyShapeStyle(.secondary))
        }
        Group {
            if let plane = lookup.flying {
                Button { nav.push(.traffic(plane.hex)) } label: { line }
                    .buttonStyle(.plain)
                    .accessibilityHint("Tracks it on the map")
            } else {
                line
            }
        }
        .font(WingtipType.detail)
        .padding(.horizontal, WingtipSpace.lg)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("airplane-status")
    }

    /// Its flights, newest first, each replayed from its row (the owner,
    /// 2026-11-14: "How do I see the flights of airplane and play them?").
    @ViewBuilder private var flights: some View {
        Section {
            if model.loaded, model.registration?.modeSHex == nil {
                Text("No flights to show: the FAA's registry gives no address for this N-number.").foregroundStyle(.secondary)
            } else if let flights = lookup.flights {
                if flights.isEmpty { Text("No flights heard in the last six weeks").foregroundStyle(.secondary) }
                ForEach(flights) { flight in
                    NavigationLink(value: flight) {
                        HStack {
                            Image(systemName: "play.fill").foregroundStyle(.tint).accessibilityHidden(true)
                            PastFlightRow(flight: flight, type: nil)
                        }
                    }
                    .accessibilityHint("Replays it on the map")
                }
            } else if lookup.flightsProblem == nil {
                Text("Fetching its flights…").foregroundStyle(.secondary)
            }
            ProblemLine(lookup.flightsProblem)
        }
    }
}

#Preview("AirplaneProfileView") {
    AirplaneProfileView(tail: "N3429J", focus: .taxiFuelGal)
        .environment(Plan())
        .environment(Session())
        .environment(Tracking())
}
