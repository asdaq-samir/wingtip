import SwiftUI

/// The pilot's marks on a picture as the viewer holds them (PlateMarkup):
/// which chart's, whether Markup is on, and how many times Clear Markup
/// was asked, for the pages' view to act on once each (ZoomablePictures).
struct MarkupState: Equatable {
    var key: String?
    var on = false
    var clears = 0
}

/// The viewer's tools at the left of its bar, its close at the right
/// (CloseButton): Markup, which puts PencilKit's tool picker up over the
/// chart, and on an iPad that has windows, Open in New Window, the chart
/// in a window of its own beside the map (PictureWindow; HIG Windows,
/// "an auxiliary window presents a specific task"), the viewer over the
/// app put away as it opens. Neither for a picture drawn on the device,
/// which has no address to keep marks or open a window by.
struct PictureTools: ViewModifier {
    let picture: ShownPicture
    let inWindow: Bool
    /// The pages are in: no tools over a picture still coming or refused.
    let shown: Bool
    @Binding var markup: MarkupState
    let close: () -> Void
    @Environment(\.openWindow) private var openWindow
    @Environment(\.supportsMultipleWindows) private var windows
    @State private var askingClear = false

    func body(content: Content) -> some View {
        content
            .onAppear { markup.key = picture.request?.markupKey }
            .toolbar {
                if let request = picture.request, shown {
                    ToolbarItemGroup(placement: .topBarLeading) {
                        Toggle(isOn: $markup.on) {
                            Label("Markup", systemImage: "pencil.tip.crop.circle")
                        }
                        .accessibilityIdentifier("picture-markup")
                        if markup.on {
                            Button("Clear Markup", systemImage: "trash", role: .destructive) { askingClear = true }
                                .accessibilityIdentifier("picture-markup-clear")
                        }
                        if windows, !inWindow {
                            Button("Open in New Window", systemImage: "macwindow.badge.plus") {
                                openWindow(id: PictureRequest.window, value: request)
                                close()
                            }
                            .accessibilityIdentifier("picture-new-window")
                        }
                        // The chart beside the map, the iPad's standing
                        // layout for an approach (BesidePane).
                        if !inWindow { BesideMapButton(request: request, then: close) }
                    }
                }
            }
            .confirmationDialog("Clear your markup on this chart?", isPresented: $askingClear, titleVisibility: .visible) {
                Button("Clear Markup", role: .destructive) { markup.clears += 1 }
            }
    }
}

/// A picture in a window of its own (WingtipApp's picture scene): the
/// viewer as it is over the app, its close shutting the window. A window
/// the system brings back after a relaunch asks for its pages again.
struct PictureWindow: View {
    @State private var picture: ShownPicture

    init(request: PictureRequest) {
        _picture = State(initialValue: ShownPicture(request))
    }

    var body: some View {
        PictureViewer(picture: picture, inWindow: true)
            .accessibilityIdentifier("picture-window")
            // A link, a file or Siri handed to the app goes to a map's
            // window, which has the handlers (CommandHost), not to this.
            .handlesExternalEvents(preferring: [], allowing: [])
    }
}

/// Beside the Map and Open in New Window on a chart's row, for a secondary click or a long
/// press (AirportChartsTab): straight to its window, the viewer skipped.
struct OpenInWindowItem: View {
    let request: PictureRequest
    @Environment(\.openWindow) private var openWindow
    @Environment(\.supportsMultipleWindows) private var windows

    var body: some View {
        BesideMapButton(request: request)
        if windows {
            Button("Open in New Window", systemImage: "macwindow.badge.plus") {
                openWindow(id: PictureRequest.window, value: request)
            }
        }
    }
}
