import SwiftUI

/// The route box's first row: From → To, the radio's clearance and Plan.
/// The fields are plain text in the row's own ground, as Settings' fields
/// are, not bordered boxes, which drew solid black on the glass at night
/// (the iOS sheet audit, 2026-11-10). At the accessibility sizes the row
/// stacks, From over To each the full width and Plan under them
/// (docs/design/ios.md, "Large text sizes": side-by-side items stack, and
/// an ident is never cut short), where side by side the fields had 76
/// points and showed "KM…" and Plan broke over two lines.
struct RouteEndsRow: View {
    @Environment(ClearanceListener.self) private var listener
    @Environment(Plan.self) private var plan
    @Environment(\.dynamicTypeSize) private var typeSize
    var focused: FocusState<PlanView.Field?>.Binding
    /// The fields' widths follow the type size, so an ident still fits at
    /// the larger sizes.
    @ScaledMetric(relativeTo: .body) private var identWidth = 110.0

    var body: some View {
        @Bindable var plan = plan
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                routeField("From", text: $plan.dep, field: .dep)
                routeField("To", text: $plan.dest, field: .dest)
                HStack(spacing: WingtipSpace.md) {
                    radio
                    planButton
                }
            }
        } else {
            HStack(spacing: WingtipSpace.sm) {
                routeField("From", text: $plan.dep, field: .dep)
                Image(systemName: "arrow.right").foregroundStyle(.secondary).accessibilityHidden(true)
                routeField("To", text: $plan.dest, field: .dest)
                radio
                planButton
            }
        }
    }

    /// A clearance heard off the radio into the route (ClearanceSheet), the
    /// radio's waves its mark; where speech cannot be recognised on the
    /// iPhone, the same sheet, the clearance typed.
    private var radio: some View {
        let voice = listener.canListen
        return Button {
            focused.wrappedValue = nil
            listener.sheetText = nil
            listener.sheetShown = true
        } label: {
            Image(systemName: !voice ? "text.bubble" : WingtipIcon.radio)
                .symbolOnAir(listener.listening).symbolSwap()
                // The 44-point hit area round the glyph, which does not grow.
                .hitArea()
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(!voice ? "Enter a clearance" : listener.listening ? "Listening to the radio" : "Listen to the radio")
        .accessibilityIdentifier("radio")
    }

    /// The row's one filled action in the look's tinted glass, its words in
    /// the look's own colour on the tint (glassProminentButton).
    private var planButton: some View {
        Button { focused.wrappedValue = nil; plan.plan() } label: {
            // Its whole height and as many lines as it needs at every size,
            // over the glass button's one line: the empty route box (FPL
            // with no route, since the welcome went) put it before the
            // largest text's audit, which found its word clipped.
            Text("Plan").lineLimit(nil).frame(maxWidth: typeSize.isAccessibilitySize ? .infinity : nil)
                .fixedSize(horizontal: false, vertical: true)
        }
        .glassProminentButton()
        // ⌘Return plans from an iPad's keyboard; Return in a field
        // already does (onSubmit).
        .keyboardShortcut(.return, modifiers: .command)
        .disabled(!plan.routed || plan.planning)
        .accessibilityIdentifier("plan-button")
    }

    private func routeField(_ label: String, text: Binding<String>, field: PlanView.Field) -> some View {
        TextField(label, text: text)
            .textFieldStyle(.plain)
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .font(WingtipType.row.monospaced())
            .frame(maxWidth: typeSize.isAccessibilitySize ? .infinity : identWidth, alignment: .leading)
            .focused(focused, equals: field)
            .onSubmit { if field == .dep { focused.wrappedValue = .dest } else { plan.plan() } }
    }
}
