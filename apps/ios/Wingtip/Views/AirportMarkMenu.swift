import MapKit
import SwiftUI
import UIKit

/// What a field's mark held on the map shows (the owner, 2026-11-09:
/// press-and-hold previews of the card on map marks): the card as the
/// preview, the plan's actions as the menu, and the card opened when the
/// preview is tapped, as UIKit's own context menus preview a link.
struct AirportMarkPreview {
    let card: @MainActor (String) -> UIViewController
    let menu: @MainActor (String) -> UIMenu
    let open: @MainActor (String) -> Void
}

/// The fields' marks' context menu: one interaction a mark, its delegate
/// this, reading the field from the mark it is on. Each mark puts it on
/// itself as it is made (AirportMarkView); the root view gives it what to
/// show (RootView.markPreview), so ChartMap carries none of it.
@MainActor
final class AirportMarkMenu: NSObject, UIContextMenuInteractionDelegate {
    static let shared = AirportMarkMenu()
    var input: AirportMarkPreview?

    func attach(to view: MKAnnotationView) {
        guard !view.interactions.contains(where: { $0 is UIContextMenuInteraction }) else { return }
        view.addInteraction(UIContextMenuInteraction(delegate: self))
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
                                configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
        guard let input, let ident = ((interaction.view as? MKAnnotationView)?.annotation as? AirportAnnotation)?.ident else { return nil }
        return UIContextMenuConfiguration(identifier: ident as NSString,
                                          previewProvider: { input.card(ident) },
                                          actionProvider: { _ in input.menu(ident) })
    }

    func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
                                willPerformPreviewActionForMenuWith configuration: UIContextMenuConfiguration,
                                animator: any UIContextMenuInteractionCommitAnimating) {
        guard let ident = configuration.identifier as? String, let open = input?.open else { return }
        animator.addCompletion { open(ident) }
    }
}

extension RootView {
    /// The map's marks held: the card, sized as a preview, with the
    /// environment the sheet's card has, and Fly Here, Depart From and Add
    /// as Stop, each setting the plan as the card's own buttons do.
    var markPreview: AirportMarkPreview {
        AirportMarkPreview(
            card: { [models] ident in
                let host = UIHostingController(rootView: AirportCardPreview(ident: ident).modifier(models))
                host.preferredContentSize = CGSize(width: 360, height: 480)
                return host
            },
            menu: { [plan, ownShip] ident in
                UIMenu(children: [
                    UIAction(title: CardAction.flyHere.title, image: UIImage(systemName: CardAction.flyHere.systemImage)) { _ in
                        Task { @MainActor in await plan.flyHere(ident, near: ownShip.fix); showPlan() }
                    },
                    UIAction(title: CardAction.departFrom.title, image: UIImage(systemName: CardAction.departFrom.systemImage)) { _ in
                        MainActor.assumeIsolated { plan.departFrom(ident); showPlan() }
                    },
                    UIAction(title: CardAction.addStop.title, image: UIImage(systemName: CardAction.addStop.systemImage),
                             attributes: plan.canAddStop(ident) ? [] : .disabled) { _ in
                        MainActor.assumeIsolated { plan.addStop(ident); showPlan() }
                    },
                ])
            },
            open: { ident in open(ident) })
    }
}
