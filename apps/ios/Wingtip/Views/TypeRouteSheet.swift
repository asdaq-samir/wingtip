import SwiftUI

/// Type Route at the end of FPL's Add a Stop row, as the web's keyboard
/// chip there (TypeRouteButton, the owner's 2026-11-21 ask): the keyboard
/// glyph alone in a small bordered button, named in full for VoiceOver.
/// A tap opens TypeRouteSheet with the route already in it.
struct TypeRouteButton: View {
    @State private var typing = false

    var body: some View {
        Button { typing = true } label: {
            Label("Type Route", systemImage: "keyboard").labelStyle(.iconOnly)
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .controlSize(.small)
        .hitArea()
        .accessibilityLabel("Type Route")
        .accessibilityHint("Type or paste the whole route")
        .accessibilityIdentifier("route-type-open")
        // A popover from the button where there is the width (an iPad's
        // sidebar), as HIG Popovers keeps popovers for regular widths; on
        // the iPhone the system makes it the sheet it was.
        .popover(isPresented: $typing) {
            TypeRouteSheet()
                .frame(minWidth: 320, idealWidth: 420, minHeight: 260, idealHeight: 300)
                .presentationDetents([.medium, .large])
        }
    }
}

/// The route typed or pasted whole (TypedRoute): the system's text field
/// over several lines, filled with the route as it is so a pilot changes
/// it rather than typing it again, Cancel and Plan in the bar as a form
/// sheet has them; what the engine could not read said under the field
/// (ProblemLine), the sheet left up.
struct TypeRouteSheet: View {
    @Environment(Plan.self) private var plan
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var problem: String?
    @State private var looking = false
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("KPWK DCT OBK V100 KLAS", text: $text, axis: .vertical)
                        .lineLimit(2...6)
                        .font(WingtipType.row.monospaced())
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .focused($focused)
                        .onSubmit(use)
                        .accessibilityLabel("Route")
                        .accessibilityIdentifier("route-type-field")
                    if let problem { ProblemLine(problem) }
                }
            }
            .navigationTitle("Type Route")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Plan", action: use)
                        .disabled(looking || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("route-type-plan")
                }
            }
        }
        .onAppear {
            text = TypedRoute.words(dep: plan.dep, stops: plan.stops, dest: plan.dest)
            focused = true
        }
    }

    /// The words read by the engine and planned, a SID or a STAR typed
    /// among them looked up in its field's procedures first; kept up with
    /// why where they cannot be.
    private func use() {
        let read: TypedRoute.Read
        do {
            guard let typed = try TypedRoute.read(text) else {
                problem = "A route needs two points at least: where it leaves from and where it lands."
                return
            }
            read = typed
        } catch {
            problem = "The route couldn't be read: \(error.localizedDescription)"
            return
        }
        guard !read.procedures.isEmpty else {
            plan.useTypedRoute(read)
            dismiss()
            return
        }
        looking = true
        Task {
            let found = await TypedRoute.picks(read) { try? await Planner.procedures($0) }
            looking = false
            guard found.missed.isEmpty else {
                problem = TypedRoute.missedWords(found.missed, read: read)
                return
            }
            plan.useTypedRoute(read, picks: found.picks)
            dismiss()
        }
    }
}
