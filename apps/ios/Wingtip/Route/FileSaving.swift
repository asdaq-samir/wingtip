import SwiftUI
import UniformTypeIdentifiers

/// A file handed to iOS 27's document exporter: the new WritableDocument
/// (SwiftUI, iOS 27.0 SDK; FileDocument is deprecated there), written by
/// the SDK's own FileWrapperDocumentWriter, its snapshot the file's bytes
/// as made. Nothing is kept or edited after: the pilot picks where it goes.
@available(iOS 27.0, *)
final class ExportedFile: WritableDocument {
    let file: SavedFile

    init(_ file: SavedFile) { self.file = file }

    static var writableContentTypes: [UTType] { [.wingtipFlight, .pdf] }

    func writer(configuration: sending WriteConfiguration) -> sending FileWrapperDocumentWriter<Data> {
        FileWrapperDocumentWriter(configuration) { data, _ in FileWrapper(regularFileWithContents: data) }
    }

    @MainActor
    func snapshot(contentType: UTType) async throws -> sending Data { file.data }
}

/// Save as File: on iOS 27 the system's file exporter (fileExporter with a
/// WritableDocument), where the pilot picks a folder in Files; on iOS 18
/// to 26 the share sheet with the file in it, whose Save to Files, AirDrop
/// and Mail do the same (`fallback`).
struct SaveFileExporter: ViewModifier {
    @Binding var saving: SavedFile?
    /// The file's URL handed to the share sheet below iOS 27.
    let fallback: (URL) -> Void

    func body(content: Content) -> some View {
        if #available(iOS 27.0, *) {
            content.fileExporter(
                isPresented: Binding(get: { saving != nil }, set: { if !$0 { saving = nil } }),
                document: saving.map(ExportedFile.init), contentType: saving?.type,
                defaultFilename: saving.map { ($0.name as NSString).deletingPathExtension },
                onCompletion: { _ in saving = nil }, onCancellation: { saving = nil })
        } else {
            content.onChange(of: saving?.name) { _, name in
                guard name != nil, let file = saving else { return }
                saving = nil
                if let url = try? file.temporaryURL() { fallback(url) }
            }
        }
    }
}
