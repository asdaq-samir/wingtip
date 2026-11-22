import SwiftUI

/// What the menu bar's commands do in the window in front, published by
/// its root (WindowHost) as the scene's focused value: each window acts on
/// its own map and cards.
struct WindowActions {
    /// The one search up, its field focused.
    let search: () -> Void
    /// A screen by its name, as a link opens it (RootView.openScreen).
    let open: (Screen) -> Void
    /// The plan's page, Search or FPL.
    let page: (PlanPage) -> Void
    /// A flight file or a track picked from Files (WindowHost).
    let openFile: () -> Void
}

extension FocusedValues {
    @Entry var windowActions: WindowActions?
}

/// The iPad's menu bar (iPadOS 26) and its keys with a hardware keyboard,
/// held down ⌘ to see them all: HIG The menu bar, "a familiar way for
/// people to learn what an app does, find the commands they need, and
/// discover keyboard shortcuts", in the menus a Mac app has them. The app's
/// own: File's Open Flight or Track, View's two plan pages ("consider
/// adding each tab as a menu item in the View menu", with a key each), the
/// system's sidebar and inspector items, and a Flight menu of the screens
/// a pilot reaches for (⌘F, ⌘B and ⌘L as before). Each also has its way
/// on the screen, as the HIG asks of a menu bar that is mostly hidden.
/// The owner, 2026-11-21: "Yes do it all for iPad".
struct WingtipCommands: Commands {
    @FocusedValue(\.windowActions) private var actions
    /// The reader in front, where one is (ReaderView).
    @FocusedValue(\.readerActions) private var reader

    var body: some Commands {
        // Show or Hide Sidebar (⌃⌘S) and the inspector's, the system's own.
        SidebarCommands()
        InspectorCommands()
        // The app's Settings… is its page in the iPad's Settings; its own
        // settings beneath it ("link to it with a separate menu item
        // beneath Settings in the same group").
        CommandGroup(after: .appSettings) {
            item("Wingtip Settings…") { $0.open(.setup) }
        }
        CommandGroup(after: .newItem) {
            item("Open Flight or Track…", key: "o") { $0.openFile() }
        }
        CommandGroup(before: .sidebar) {
            item(PlanPage.search.title, key: "1") { $0.page(.search) }
            item(Screen.fpl.title, key: "2") { $0.page(.fpl) }
            Divider()
        }
        // ⌘F finds in the document while the reader is in front, else
        // it is the one search; ⌘[ and ⌘] go back and forward in it, as
        // Safari and Preview do (ReaderActions).
        CommandGroup(after: .textEditing) {
            Button("Find in Document") { reader?.find() }
                .disabled(reader == nil)
            Button("Back") { reader?.back() }
                .keyboardShortcut("[", modifiers: .command)
                .disabled(reader == nil)
            Button("Forward") { reader?.forward() }
                .keyboardShortcut("]", modifiers: .command)
                .disabled(reader == nil)
        }
        CommandMenu("Flight") {
            Button("Search") { if let reader { reader.find() } else { actions?.search() } }
                .keyboardShortcut("f", modifiers: .command)
                .disabled(actions == nil && reader == nil)
            Divider()
            screen(.brief, key: "b")
            screen(.navlog, key: "l")
            screen(.profile, key: "p", modifiers: [.command, .option])
            screen(.nearest, key: "n", modifiers: [.command, .shift])
            screen(.checklists, key: "k", modifiers: [.command, .shift])
            // The flight's scratchpad, in the inspector (RootView.openScreen).
            screen(.scratchpad, key: "j", modifiers: [.command, .shift])
            screen(.balance)
            Divider()
            screen(.flights)
            screen(.logbook)
            screen(.airplanes)
            Divider()
            screen(.emergency, key: "e", modifiers: [.command, .shift])
        }
    }

    private func screen(_ screen: Screen, key: KeyEquivalent? = nil, modifiers: EventModifiers = .command) -> some View {
        item(screen.title, key: key, modifiers: modifiers) { $0.open(screen) }
    }

    /// A command, off while no window of the app is in front.
    @ViewBuilder
    private func item(_ title: String, key: KeyEquivalent? = nil, modifiers: EventModifiers = .command, _ act: @escaping (WindowActions) -> Void) -> some View {
        let button = Button(title) { if let actions { act(actions) } }.disabled(actions == nil)
        if let key {
            button.keyboardShortcut(key, modifiers: modifiers)
        } else {
            button
        }
    }
}
