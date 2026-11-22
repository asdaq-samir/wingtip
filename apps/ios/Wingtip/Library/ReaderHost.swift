import SwiftUI

extension DocPlace {
    /// The document windows' scene (WingtipApp), opened by a place.
    static let window = "document"
}

/// The reader over this window, full screen as the plates' viewer is,
/// while its navigator has a document to read (Navigator.reading: a cite
/// tapped, a library row, a link's `doc=`). Hung where the plan's sheet
/// and the card each are (CardHost), live only on the one on top, since a
/// view under a sheet it presents can present nothing.
struct ReaderCover: ViewModifier {
    let active: Bool
    @Environment(Navigator.self) private var nav

    func body(content: Content) -> some View {
        content.fullScreenCover(item: Binding(get: { active ? nav.reading : nil }, set: { if active { nav.reading = $0 } })) { place in
            ReaderView(place: place)
        }
    }
}

/// A document in a window of its own beside the map on an iPad (HIG
/// Windows: "an auxiliary window presents a specific task"), the reader
/// as it is over the app, its close shutting the window; opened from the
/// reader's Open in New Window or a library row's. The way the plates'
/// window is made (PictureWindow); the system brings it back after a
/// relaunch at its place.
struct DocumentWindow: View {
    let place: DocPlace

    var body: some View {
        ReaderView(place: place, inWindow: true)
            .accessibilityIdentifier("document-window")
    }
}

/// Open in New Window on a library row, for a secondary click or a long
/// press: straight to its window.
struct OpenDocumentWindowItem: View {
    let place: DocPlace
    @Environment(\.openWindow) private var openWindow
    @Environment(\.supportsMultipleWindows) private var windows

    var body: some View {
        if windows {
            Button("Open in New Window", systemImage: "macwindow.badge.plus") {
                openWindow(id: DocPlace.window, value: place)
            }
        }
    }
}
