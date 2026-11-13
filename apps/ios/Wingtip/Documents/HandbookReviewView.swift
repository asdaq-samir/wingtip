import SwiftUI

/// A figure as read and, where the app keeps it in another unit, as the
/// app will: "120 mph · 104.3 kt".
enum DocumentFigureText {
    static func value(_ x: Double, _ unit: String) -> String {
        let n = x == x.rounded() ? Format.grouped(x) : x.formatted(.number.precision(.fractionLength(0...3)).locale(Format.locale))
        return unit == "%" ? "\(n)%" : "\(n) \(unit)"
    }

    static func line(_ f: HandbookFigure) -> String {
        let read = value(f.value, f.unit)
        guard f.unit != f.appUnit || abs(f.value - f.appValue) > 1e-9 else { return read }
        return "\(read) · \(value(f.appValue, f.appUnit))"
    }
}

/// The airplane form's "Add from a Photo" (AircraftFormView): which page,
/// the camera, the spinner while it is read, the problem where it failed,
/// and the review. Confirmed figures fill the form's fields; the handbook's
/// tables wait in `pending` for the form's own Save.
struct HandbookPhotoSection: View {
    @Binding var form: AircraftForm
    @Binding var pending: GWHandbookFigures?
    /// The figures the airplane already has, which a new page adds to.
    var kept: GWHandbookFigures?
    @State private var model = HandbookPhotoModel()
    @State private var photographing = false

    var body: some View {
        Section {
            if DocumentReader.offered {
                Menu {
                    ForEach([DocumentKind.pohPerformance, .weightBalance], id: \.self) { kind in
                        Button(kind.label) { model.kind = kind; photographing = true }
                    }
                } label: {
                    Label("Add from a Photo", systemImage: "doc.viewfinder")
                }
                .disabled(model.reader.reading)
            }
            if model.reader.reading { ReadingRow() }
            ProblemLine(model.reader.problem)
            if pending != nil {
                Label("Handbook figures confirmed, saved with the airplane", systemImage: "checkmark.circle")
                    .font(WingtipType.note).foregroundStyle(.secondary)
            }
        }
        .documentPhoto(isPresented: $photographing, onImage: { model.read($0) }, onProblem: { model.reader.problem = $0 })
        .sheet(isPresented: $model.reviewing) {
            NavigationStack {
                HandbookReviewView(model: model) { check in
                    HandbookReview.fill(&form, from: check.profile)
                    pending = HandbookReview.merged(pending ?? kept, HandbookReview.gateway(check.handbook))
                }
            }
        }
    }
}

/// Each item the engine made of the page, to confirm against it one by
/// one: its figures as read (a tap corrects one), its flags under them,
/// "wrong" in the problem ink and "check" in the caution's. None is
/// confirmed until the pilot says so; a flagged item may still be (warn,
/// never limit).
struct HandbookReviewView: View {
    @Bindable var model: HandbookPhotoModel
    var onUse: (HandbookCheck) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var editing: HandbookFigure?
    @State private var editText = ""

    var body: some View {
        List {
            if let read = model.notes, read.unreadable != nil || !(read.notes ?? []).isEmpty {
                Section { DocumentNotes(read: read) }
            }
            if let problem = model.problem { Section { ProblemLine(problem) } }
            ForEach(model.check?.items ?? [], id: \.key) { item in
                Section {
                    Toggle("Confirmed", isOn: Binding(get: { model.isConfirmed(item.key) }, set: { model.setConfirmed(item.key, $0) }))
                    ForEach(item.figures, id: \.path) { figure in
                        Button {
                            editText = figure.value.formatted(.number.precision(.fractionLength(0...3)).grouping(.never).locale(Format.locale))
                            editing = figure
                        } label: {
                            LabeledContent(figure.label) {
                                Text(DocumentFigureText.line(figure)).monospacedDigit()
                            }
                        }
                        .accessibilityHint("Corrects this figure")
                    }
                    ForEach(Array(item.flags.enumerated()), id: \.offset) { _, flag in FlagLine(flag: flag) }
                } header: {
                    Text(item.title)
                }
            }
        }
        .navigationTitle(model.kind == .weightBalance ? "Weight & Balance" : "Performance")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { model.close() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Use Confirmed Figures") { use() }.disabled(!model.canUse)
            }
        }
        .alert(editing?.label ?? "", isPresented: Binding(get: { editing != nil }, set: { if !$0 { editing = nil } }), presenting: editing) { figure in
            TextField(figure.unit, text: $editText).keyboardType(.decimalPad)
            Button("Cancel", role: .cancel) {}
            Button("Correct") {
                if let n = Double(editText.trimmingCharacters(in: .whitespaces)) { model.edit(figure.path, to: n) }
            }
        } message: { figure in
            Text("As printed on the page, in \(figure.unit).")
        }
    }

    private func use() {
        do {
            onUse(try model.confirmedCheck())
            model.close()
            dismiss()
        } catch {
            model.problem = "The confirmed figures couldn't be checked: \(error.localizedDescription)"
        }
    }
}
