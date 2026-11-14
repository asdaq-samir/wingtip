import SwiftUI

extension View {
    /// A field's row held: its card as the preview, as iOS previews a link
    /// or a place in Maps, and the plan's three actions as the menu (the
    /// owner, 2026-11-09: every card the iOS-native way). `done` runs once
    /// an action has set the plan; a tap on the preview opens the card.
    /// A field NASR lists as closed is never offered for the plan
    /// (decision 0043): its actions are greyed.
    func airportPreview(_ ident: String, closed: Bool = false, done: @escaping () -> Void = {}) -> some View {
        modifier(AirportPreviewMenu(ident: ident, closed: closed, done: done))
    }
}

private struct AirportPreviewMenu: ViewModifier {
    let ident: String
    let closed: Bool
    let done: () -> Void
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip

    func body(content: Content) -> some View {
        content.contextMenu {
            Group {
                Button { Task { await plan.flyHere(ident, near: ownShip.fix); done() } } label: {
                    Label(CardAction.flyHere.title, systemImage: CardAction.flyHere.systemImage)
                }
                Button { plan.departFrom(ident); done() } label: {
                    Label(CardAction.departFrom.title, systemImage: CardAction.departFrom.systemImage)
                }
                Button { plan.addStop(ident); done() } label: {
                    Label(CardAction.addStop.title, systemImage: CardAction.addStop.systemImage)
                }
                .disabled(!plan.canAddStop(ident))
            }
            .disabled(closed)
        } preview: {
            AirportCardPreview(ident: ident)
        }
    }
}

/// The card as the preview of its row or its mark held: the card itself,
/// sized as a preview is, its foot and buttons there to see, not to tap.
struct AirportCardPreview: View {
    let ident: String

    var body: some View {
        NavigationStack { AirportCard(ident: ident) }
            .frame(width: 360, height: 480)
    }
}
