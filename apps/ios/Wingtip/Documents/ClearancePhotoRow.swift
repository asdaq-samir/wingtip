import SwiftUI

/// The clearance card's "From a Photo" (ClearanceSheet): a clearance or
/// ATIS copied down in shorthand, photographed and read back as written
/// and as the controller would say it. "Use It" hands the words said to
/// the card's own reader (the engine's read_clearance), which makes the
/// card as from words heard or typed; nothing else changes.
struct ClearancePhotoRow: View {
    var onUse: (String) -> Void
    @State private var reader = DocumentReadModel()
    @State private var photographing = false
    @State private var showing: DocumentRead?

    var body: some View {
        Group {
            if DocumentReader.offered {
                Button { photographing = true } label: { Label("From a Photo", systemImage: "doc.viewfinder") }
                    .disabled(reader.reading)
            }
            if reader.reading { ReadingRow() }
            ProblemLine(reader.problem)
        }
        .documentPhoto(isPresented: $photographing,
                       onImage: { image in reader.read(.clearance, image: image) { showing = $0.read } },
                       onProblem: { reader.problem = $0 })
        .sheet(isPresented: Binding(get: { showing != nil }, set: { if !$0 { showing = nil } })) {
            if let read = showing {
                NavigationStack {
                    ClearanceNoteView(read: read) { said in
                        onUse(said)
                        showing = nil
                    } onCancel: { showing = nil }
                }
            }
        }
    }
}

/// The note as written, line by line, and as said, for the pilot to check
/// against the paper before the card reads it.
struct ClearanceNoteView: View {
    let read: DocumentRead
    var onUse: (String) -> Void
    var onCancel: () -> Void

    var body: some View {
        List {
            if read.unreadable != nil || !(read.notes ?? []).isEmpty {
                Section { DocumentNotes(read: read) }
            }
            if let note = read.clearance {
                Section("As Written") {
                    Text(note.written).font(.body.monospaced()).textSelection(.enabled)
                }
                Section("As Said") {
                    Text(note.said).textSelection(.enabled)
                }
            } else if read.unreadable == nil {
                Text("No clearance was read on this page.").foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Clearance")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onCancel) }
            ToolbarItem(placement: .confirmationAction) {
                Button("Use It") { if let said = read.clearance?.said { onUse(said) } }
                    .disabled(read.clearance?.said.isEmpty ?? true)
            }
        }
    }
}
