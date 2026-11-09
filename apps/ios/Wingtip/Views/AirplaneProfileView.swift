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
    @State private var model: AirplaneProfileModel
    @FocusState private var focused: OwnFigure?
    private let focus: OwnFigure?
    /// The field and its unit grow with the type, so "gal/h" and a
    /// five-figure moment still fit.
    @ScaledMetric(relativeTo: .body) private var fieldWidth = 96.0

    init(tail: String, focus: OwnFigure? = nil) {
        _model = State(initialValue: AirplaneProfileModel(tail: tail))
        self.focus = focus
    }

    var body: some View {
        NavigationStack {
            Form {
                airplane
                Section {
                    ForEach(OwnFigure.allCases) { figure in row(figure) }
                } header: {
                    SectionTitle("Figures")
                } footer: {
                    VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                        if let words = model.keptWords(signedIn: session.signedIn) { Text(words) }
                        ProblemLine(model.problem)
                    }
                }
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
    }

    @ViewBuilder private var airplane: some View {
        Section {
            LabeledContent("Registration", value: model.tail).monospaced()
            if !model.loaded {
                Skeleton(label: "Looking it up in the FAA's registry")
            } else {
                LabeledContent("Type", value: model.typeLine ?? "Not in the FAA's registry")
                // A type the planner has no book for flies on these figures
                // alone, never another airplane's (the owner, 2026-11-09).
                LabeledContent("Book Figures", value: model.stock.map { "The planner's \($0.uppercased())" } ?? "None: yours alone")
            }
            if plan.tail != model.tail {
                Button("Fly \(model.tail)") {
                    Task {
                        await plan.fly(tail: model.tail, own: Airplanes.shared.records, names: Array(Airplanes.shared.books.keys))
                        dismiss()
                    }
                }
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
                        .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: fieldWidth)
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
