import SwiftUI

/// An airplane's profile, opened by tapping its N-number anywhere (the
/// route line and the strip, the Airplane tab and its picker, Find an
/// Airplane, the logbook's rows, an inline ask's Edit): its registration
/// and type, and every figure with its source -- Book, Handbook Photo or
/// You -- each editable in place, with Reset to Book Figure where the
/// pilot's stands over the book's. A sheet; its close goes back to where
/// the pilot was. Its state is AirplaneProfileModel's.
struct AirplaneProfileView: View {
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    /// Back to the plan once flown, where the profile was opened over it.
    @Environment(\.showPlan) private var showPlan
    @State private var model: AirplaneProfileModel
    @FocusState private var focused: OwnFigure?
    private let focus: OwnFigure?
    /// The field and its unit grow with the type, so "gal/h" and a
    /// five-figure moment still fit.
    @ScaledMetric(relativeTo: .body) private var fieldWidth = 96.0

    /// Its sheet's height: half way first, as Maps' place card opens;
    /// full where it opens on a figure to type.
    @State private var detent: PresentationDetent

    init(tail: String, focus: OwnFigure? = nil) {
        _model = State(initialValue: AirplaneProfileModel(tail: tail))
        self.focus = focus
        _detent = State(initialValue: focus == nil ? .medium : .large)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    AirplanePlaceHead(model: model, fly: fly)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
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
                if let record = Airplanes.shared.record(model.tail) {
                    Section {
                        NavigationLink("Checklists, Squawks and Inspections") {
                            OwnAircraftPage(record: record) { Task { await Airplanes.shared.loadRecords(signedIn: session.signedIn) } }.closesBack()
                        }
                    }
                }
            }
            .navigationTitle(model.tail)
            .navigationBarTitleDisplayMode(.inline)
            // The N-number is the head's, large and centred, as Maps' card.
            .toolbar(removing: .title)
            .closeButton { focused = nil; dismiss() }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { focused = nil } }
            }
            .task {
                await model.load(signedIn: session.signedIn)
                focused = focus
            }
            // A figure is saved as the pilot leaves its field.
            .onChange(of: focused) { old, _ in
                if let old { Task { await model.commit(old, plan: plan, signedIn: session.signedIn) } }
            }
        }
        .environment(\.cardExpanded, detent == .large)
        .presentationDetents([.medium, .large], selection: $detent)
    }

    /// The plan flown with this airplane, then the plan shown.
    private func fly() {
        Task {
            await plan.fly(tail: model.tail, own: Airplanes.shared.records, names: Array(Airplanes.shared.books.keys))
            dismiss()
            showPlan?()
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
}
