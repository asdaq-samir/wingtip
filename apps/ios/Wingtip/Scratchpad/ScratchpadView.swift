import PencilKit
import SwiftUI

/// The scratchpad, a kneeboard's pad on the iPad and the iPhone: pages of
/// the pilot's own ink, with Apple Pencil or a finger, blank or as a form
/// to copy a clearance (CRAFT), the ATIS or the runway's figures into. The
/// form's lines are text fields, so Scribble turns handwriting in them
/// into text; the ink is PencilKit's canvas and tool picker, stock (HIG
/// Apple Pencil and Scribble). Kept on this device with the flight
/// (ScratchpadModel). On the iPad it opens in the inspector beside the
/// map, on the iPhone as a card (SheetPage.scratchpad).
struct ScratchpadView: View {
    @Environment(Plan.self) private var plan
    @State private var model = ScratchpadModel()
    @State private var askingDelete = false

    var body: some View {
        Group {
            if let page = model.page {
                ScratchPageView(page: page, model: model).id(page.id)
            } else {
                ContentUnavailableView {
                    Label("No pages yet", systemImage: "pencil.and.scribble")
                } description: {
                    Text("Write a clearance, the ATIS or the runway's figures with Apple Pencil, a finger or the keyboard.")
                } actions: {
                    newPage.buttonStyle(.borderedProminent)
                }
            }
        }
        .navigationTitle("Scratchpad")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarLeading) {
                if !model.pages.isEmpty {
                    Picker("Page", selection: Binding(get: { model.page?.id }, set: { model.shown = $0 })) {
                        ForEach(model.pages) { Text(model.name($0)).tag(Optional($0.id)) }
                    }
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("scratch-pages")
                    newPage
                    Button("Delete Page", systemImage: "trash", role: .destructive) { askingDelete = true }
                        .accessibilityIdentifier("scratch-delete")
                }
            }
        }
        .confirmationDialog("Delete this page?", isPresented: $askingDelete, titleVisibility: .visible) {
            Button("Delete Page", role: .destructive) { model.deleteShown() }
        }
        .onAppear { model.open(flight: ReadyToFly.flightKey(plan)) }
        .onChange(of: ReadyToFly.flightKey(plan)) { _, key in model.open(flight: key) }
    }

    /// New Page, a menu of the kinds.
    private var newPage: some View {
        Menu {
            ForEach(ScratchTemplate.allCases) { template in
                Button(template.title, systemImage: template.systemImage) { model.add(template) }
            }
        } label: {
            Label("New Page", systemImage: "plus")
        }
        .accessibilityIdentifier("scratch-new")
    }
}

/// One page: its form's lines, if any, over the ink.
struct ScratchPageView: View {
    let page: ScratchPage
    let model: ScratchpadModel

    var body: some View {
        VStack(spacing: 0) {
            if !page.template.lines.isEmpty {
                Grid(alignment: .leading, horizontalSpacing: WingtipSpace.md, verticalSpacing: WingtipSpace.sm) {
                    ForEach(page.template.lines, id: \.key) { line in
                        GridRow {
                            Text(line.label).foregroundStyle(.secondary).gridColumnAlignment(.trailing)
                            // A text field: Scribble writes into it (iPadOS's own).
                            TextField(line.label, text: Binding(get: { page.fields[line.key] ?? "" }, set: { model.setField(line.key, $0) }))
                                .textFieldStyle(.roundedBorder)
                                .font(.title3)
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.characters)
                                .accessibilityIdentifier("scratch-\(line.key)")
                        }
                    }
                }
                .padding(WingtipSpace.md)
                Divider()
            }
            ScratchCanvas(drawing: page.drawing) { model.setDrawing($0) }
                .accessibilityLabel("Your notes")
                .accessibilityIdentifier("scratch-canvas")
        }
        .background(Color(.systemBackground))
    }
}

/// PencilKit's canvas with its tool picker up while the page is: Apple
/// Pencil draws, a finger scrolls, unless the pilot turns on Draw with
/// Finger in the picker (PKCanvasView's default policy).
struct ScratchCanvas: UIViewRepresentable {
    let drawing: Data
    let changed: (Data) -> Void

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.drawingPolicy = .default
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.alwaysBounceVertical = true
        canvas.drawing = (try? PKDrawing(data: drawing)) ?? PKDrawing()
        canvas.delegate = context.coordinator
        context.coordinator.tools.addObserver(canvas)
        context.coordinator.tools.setVisible(true, forFirstResponder: canvas)
        DispatchQueue.main.async { canvas.becomeFirstResponder() }
        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        context.coordinator.changed = changed
    }

    func makeCoordinator() -> Coordinator { Coordinator(changed: changed) }

    static func dismantleUIView(_ canvas: PKCanvasView, coordinator: Coordinator) {
        coordinator.tools.setVisible(false, forFirstResponder: canvas)
        canvas.resignFirstResponder()
    }

    @MainActor
    final class Coordinator: NSObject, PKCanvasViewDelegate {
        let tools = PKToolPicker()
        var changed: (Data) -> Void

        init(changed: @escaping (Data) -> Void) { self.changed = changed }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            changed(canvasView.drawing.dataRepresentation())
        }
    }
}
