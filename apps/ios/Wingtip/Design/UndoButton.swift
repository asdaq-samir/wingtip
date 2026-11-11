import Foundation
import Observation
import SwiftUI

/// The system's Undo in the bar, in place of the hand-built Undo bar and
/// rows (the owner, 2026-11-10: "every hand-built component replaced by
/// stock"). Every destructive edit -- the route cleared or a stop taken
/// off, a logbook flight, a saved flight or a Favorite deleted -- is
/// registered with the window's UndoManager (`@Environment(\.undoManager)`),
/// so shake to undo, the keyboard's Command-Z and the Edit menu take it
/// back as they do in Apple's own apps, and this button shows in the
/// sheet's bar while there is something to undo.
struct UndoToolbarItem: ToolbarContent {
    @Environment(\.undoManager) private var undoManager

    var body: some ToolbarContent {
        // Read for Observation: the item comes and goes as the
        // UndoManager's stack does (UndoWatch).
        let _ = UndoWatch.shared.changes
        if let undoManager, undoManager.canUndo {
            ToolbarItem(placement: .topBarLeading) {
                Button { undoManager.undo() } label: {
                    Label("Undo", systemImage: "arrow.uturn.backward")
                }
                .accessibilityLabel(undoManager.undoActionName.isEmpty ? "Undo" : "Undo \(undoManager.undoActionName)")
                .accessibilityIdentifier("undo")
            }
        }
    }
}

/// The UndoManagers' changes made observable: Foundation says each one in
/// a notification (a group closed, an undo or a redo done), which SwiftUI
/// does not watch by itself. A count the bar's Undo reads, bumped on each.
@MainActor
@Observable
final class UndoWatch {
    static let shared = UndoWatch()
    private(set) var changes = 0
    @ObservationIgnored private var observers: [NSObjectProtocol] = []

    private init() {
        let names: [Notification.Name] = [.NSUndoManagerDidCloseUndoGroup, .NSUndoManagerDidUndoChange, .NSUndoManagerDidRedoChange]
        observers = names.map { name in
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { UndoWatch.shared.changed() }
            }
        }
    }

    /// Also after `removeAllActions`, which Foundation says nothing of.
    func changed() { changes &+= 1 }
}

extension UndoManager {
    /// `action` registered as the undo of the change just made, named for
    /// the Edit menu and the bar's Undo ("Undo Delete Flight").
    @MainActor
    func register<Target: AnyObject>(_ target: Target, named name: String, _ action: @escaping @MainActor (Target) -> Void) {
        registerUndo(withTarget: target) { target in MainActor.assumeIsolated { action(target) } }
        setActionName(name)
    }

    /// The undo steps for `target` dropped: its deletes sent, its list left.
    @MainActor
    func forget(_ target: AnyObject) {
        removeAllActions(withTarget: target)
        UndoWatch.shared.changed()
    }
}
