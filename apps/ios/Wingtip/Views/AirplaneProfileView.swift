import SwiftUI

/// An airplane's card, opened by tapping its N-number anywhere (the route
/// line and the strip, the Airplane tab and its picker, Find an Airplane,
/// the logbook's rows, an inline ask's Edit), in the owner's P1 layout
/// (2026-11-14; the web's AirplaneProfileSheet): its head (AirplanePlaceHead),
/// then the tabs Flights, Info and Figures with one status line under
/// them, where the airport card has its weather line. Flights is its flights
/// by the registry's address, each replayed from its row; Info its whole
/// public record (AirplaneInfoSections); Figures every figure with its
/// source -- Book, Handbook Photo or You -- each editable in place. The one
/// profile card (the owner's card rule, 2026-11-10). Its state is
/// AirplaneProfileModel's and AirplaneLookup's.
struct AirplaneProfileView: View {
    @Environment(Airplanes.self) private var airplanes
    @Environment(Navigator.self) private var nav
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @Environment(\.lookAccent) private var accent
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
                    tabBar
                    statusLine
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
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

    /// The tabs, the airport card's stock control in the same look: the
    /// picked tab in the tint, Flights with its count for VoiceOver.
    private var tabBar: some View {
        Picker("Section", selection: $tab) {
            ForEach(ProfileTab.allCases) { tab in
                let count = tab == .flights ? lookup.flights.map(\.count).flatMap { $0 > 0 ? $0 : nil } : nil
                Text(count.map { "\(tab.rawValue) \($0)" } ?? tab.rawValue)
                    .accessibilityLabel(count.map { "\(tab.rawValue), \($0)" } ?? tab.rawValue)
                    .tag(tab)
            }
        }
        .tabsPicker()
        .tint(accent)
        .padding(.horizontal, WingtipSpace.lg)
    }

    /// The one status line (AirplaneLookup.status): in the air, a tap
    /// tracking it on the map; else where its last flight ended.
    @ViewBuilder private var statusLine: some View {
        let status = lookup.status()
        Group {
            if let plane = lookup.flying {
                Button(status.text) { nav.push(.traffic(plane.hex)) }
                    .accessibilityHint("Tracks it on the map")
            } else {
                Text(status.text).foregroundStyle(status.problem ? AnyShapeStyle(WingtipInk.problem) : AnyShapeStyle(.secondary))
            }
        }
        .font(WingtipType.detail)
        .padding(.horizontal, WingtipSpace.lg)
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
