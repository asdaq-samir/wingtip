import SwiftUI

/// An airplane's planning figures, a page of their own pushed over its
/// card from its fourth button, Figures (the web's FiguresCard; the owner,
/// 2026-11-26: "It should be the fourth button above", the tab gone), or
/// at once where a figure was asked for: the book it flies on, every
/// figure with its source -- Book, Handbook Photo or You -- each editable
/// in place, its endurance, its handbook photo and its own records. Its
/// Back goes back to the airplane's card. Its state is AirplaneProfileModel's.
struct AirplaneFiguresPage: View {
    @Environment(Airplanes.self) private var airplanes
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    let model: AirplaneProfileModel
    /// The figure it was opened for, its field focused.
    let focus: OwnFigure?
    @FocusState private var focused: OwnFigure?
    /// The field and its unit grow with the type, so "gal/h" and a
    /// five-figure moment still fit.
    @ScaledMetric(relativeTo: .body) private var fieldWidth = 96.0

    var body: some View {
        Form {
            Section {
                if model.loaded {
                    // A type the planner has no book for flies on these figures
                    // alone, never another airplane's (the owner, 2026-11-09).
                    LabeledContent("Book Figures", value: model.stock.map { "The planner's \($0.uppercased())" } ?? "None: yours alone")
                }
            }
            Section {
                ForEach(OwnFigure.allCases) { figure in row(figure) }
            } header: {
                Text(CardAction.figures.title)
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
        .navigationTitle(CardAction.figures.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button("Done") { focused = nil } } }
        .accessibilityIdentifier("airplane-figures")
        .task {
            if !model.loaded { await model.load(signedIn: session.signedIn) }
            focused = focus
        }
        // A figure is saved as the pilot leaves its field.
        .onChange(of: focused) { old, _ in
            if let old { Task { await model.commit(old, plan: plan, signedIn: session.signedIn) } }
        }
        // A figure being typed is saved as the page goes.
        .onDisappear {
            if let typing = focused { Task { await model.commit(typing, plan: plan, signedIn: session.signedIn) } }
        }
    }

    private func row(_ figure: OwnFigure) -> some View {
        let item = model.item(figure)
        return VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            LabeledContent {
                HStack(spacing: WingtipSpace.sm) {
                    TextField("—", text: Binding(get: { model.text(figure) },
                                                 set: { model.drafts[figure] = $0.filter { $0.isNumber || $0 == "." || $0 == "," } }))
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

/// Figures from the card by the ICAO address (AirplaneCard), which has no
/// profile of its own: the N-number's, made and loaded here.
struct AirplaneFiguresHost: View {
    @State private var model: AirplaneProfileModel

    init(tail: String) { _model = State(initialValue: AirplaneProfileModel(tail: tail)) }

    var body: some View { AirplaneFiguresPage(model: model, focus: nil) }
}
