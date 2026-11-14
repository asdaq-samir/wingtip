import SwiftUI

/// An airplane's card, opened by tapping its N-number anywhere (the route
/// line and the strip, the Airplane tab and its picker, the search, the
/// logbook's rows, an inline ask's Edit), laid out as the airport card is
/// (the owner's P1 and C1, 2026-11-14: "make sure the airplane card looks
/// similar to airport card"; the web's AirplaneProfileSheet): its head
/// (AirplanePlaceHead), its one status line, its facts in the sideways
/// strip (AirplaneFacts), its photo as a picture tile, then the tab's page,
/// Flights, Info and Figures in the floating glass bar at the card's foot,
/// Flights with its count. Flights is its flights by the registry's
/// address, each replayed from its row; Info its whole public record
/// (AirplaneInfoSections); Figures every figure with its source -- Book,
/// Handbook Photo or You -- each editable in place. The one profile card
/// (the owner's card rule, 2026-11-10). Its state is AirplaneProfileModel's
/// and AirplaneLookup's.
struct AirplaneProfileView: View {
    @Environment(Airplanes.self) private var airplanes
    @Environment(Navigator.self) private var nav
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @Environment(\.lookAccent) private var accent
    @Environment(\.cardAtPill) private var atPill
    /// Back to the plan once flown, where the profile was opened over it.
    @Environment(\.showPlan) private var showPlan
    @State private var model: AirplaneProfileModel
    @State private var lookup = AirplaneLookup()
    @State private var tab: ProfileTab
    @FocusState private var focused: OwnFigure?
    private let focus: OwnFigure?
    /// The field and its unit grow with the type, so "gal/h" and a
    /// five-figure moment still fit.
    @ScaledMetric(relativeTo: .body) private var fieldWidth = 96.0

    init(tail: String, focus: OwnFigure? = nil) {
        _model = State(initialValue: AirplaneProfileModel(tail: tail))
        // Opened for a figure: on Figures; else on Flights.
        _tab = State(initialValue: focus == nil ? .flights : .figures)
        self.focus = focus
    }

    /// The card's pages, in the web's order.
    enum ProfileTab: String, CaseIterable, Identifiable {
        case flights = "Flights", info = "Info", figures = "Figures"
        var id: String { rawValue }
    }

    var body: some View {
        Form {
            Section {
                AirplanePlaceHead(model: model, lookup: lookup, fly: fly)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
            Section {
                VStack(alignment: .leading, spacing: WingtipSpace.md) {
                    statusLine
                    AirplaneFacts(record: model.registration, model: lookup.details?.model)
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if let photo = lookup.photo {
                Section { PictureStrip { AirplanePhotoTile(photo: photo, name: model.tail) } }
            }
            switch tab {
            case .flights: flights
            case .info: AirplaneInfoSections(record: model.registration, details: lookup.details, detailsFailed: lookup.detailsFailed)
            case .figures: figures
            }
        }
        .navigationTitle(model.tail)
        .navigationBarTitleDisplayMode(.inline)
        // The N-number is the head's, large and centred, as Maps' card.
        .toolbar(removing: .title)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { focused = nil } }
            CardTabBar(tab: $tab, items: tabs, atPill: atPill, accent: accent)
        }
        // A flown flight's card, its replay, pushed in this one.
        .navigationDestination(for: PastFlightSummary.self) { flight in
            if let hex = model.registration?.modeSHex { PastFlightCard(hex: hex.lowercased(), flight: flight) }
        }
        .task {
            // The record at once; whether it is in the air, its whole
            // record, its photo and its flights after, each on its own.
            await model.load(signedIn: session.signedIn)
            focused = focus
            await lookup.load(tail: model.tail, hex: model.registration?.modeSHex)
        }
        // A figure is saved as the pilot leaves its field.
        .onChange(of: focused) { old, _ in
            if let old { Task { await model.commit(old, plan: plan, signedIn: session.signedIn) } }
        }
        // A figure being typed is saved as the card goes.
        .onDisappear {
            if let typing = focused { Task { await model.commit(typing, plan: plan, signedIn: session.signedIn) } }
        }
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
        ProfileTab.allCases.map { tab in
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

    @ViewBuilder private var figures: some View {
        airplane
        Section {
            ForEach(OwnFigure.allCases) { figure in row(figure) }
        } header: {
            Text("Figures")
        } footer: {
            VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                if let words = model.keptWords(signedIn: session.signedIn) { Text(words) }
                ProblemLine(model.problem)
            }
        }
        EnduranceSection(model: model)
        ProfilePhotoSection(model: model) { Task { await model.commitDrafts(plan: plan, signedIn: session.signedIn) } }
        if let record = airplanes.record(model.tail) {
            Section {
                NavigationLink("Checklists, Squawks and Inspections") {
                    OwnAircraftPage(record: record) { Task { await airplanes.loadRecords(signedIn: session.signedIn) } }.navigationBarTitleDisplayMode(.inline)
                }
            }
        }
    }

    @ViewBuilder private var airplane: some View {
        Section {
            if model.loaded {
                // A type the planner has no book for flies on these figures
                // alone, never another airplane's (the owner, 2026-11-09).
                LabeledContent("Book Figures", value: model.stock.map { "The planner's \($0.uppercased())" } ?? "None: yours alone")
            }
        }
    }

    private func row(_ figure: OwnFigure) -> some View {
        let item = model.item(figure)
        return VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            LabeledContent {
                HStack(spacing: WingtipSpace.sm) {
                    TextField("—", text: Binding(get: { model.text(figure) },
                                                 set: { model.drafts[figure] = $0.filter { $0.isNumber || $0 == "." } }))
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing).font(WingtipType.row.monospacedDigit()).frame(width: fieldWidth)
                        .focused($focused, equals: figure)
                        .accessibilityLabel(figure.label)
                    Text(figure.unit).foregroundStyle(.secondary).accessibilityHidden(true)
                }
            } label: {
                Text(figure.label)
                Text(FigureSource.words(item?.source))
            }
            if model.resettable(figure), let book = item?.book {
                Button("Reset to Book Figure, \(Format.tenths(book)) \(figure.unit)") {
                    Task { await model.reset(figure, plan: plan, signedIn: session.signedIn) }
                }
                .buttonStyle(.borderless)
                .font(WingtipType.note)
                .disabled(model.saving)
            }
        }
    }
}

#Preview("AirplaneProfileView") {
    AirplaneProfileView(tail: "N3429J", focus: .taxiFuelGal)
        .environment(Plan())
        .environment(Session())
        .environment(Tracking())
}
