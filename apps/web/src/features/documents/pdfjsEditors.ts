/** What of pdf.js's annotation editors this reads; its own types keep
 *  them private to its viewer. */
export interface Editor {
  mode: number;
  pageIndex: number;
  serialize(copying?: boolean): Record<string, unknown> | null;
}
export interface UiManager {
  undo(): void;
  redo(): void;
  delete(): void;
  setSelected(editor: Editor): void;
  getEditors(pageIndex: number): Iterable<Editor>;
  readonly firstSelectedEditor: Editor | undefined;
  updateParams(type: number, value: unknown): void;
}
export interface PageView {
  div: HTMLElement;
  viewport: { scale: number; convertToPdfPoint(x: number, y: number): number[] };
  annotationEditorLayer?: { annotationEditorLayer?: { endDrawingSession(aborted?: boolean): unknown } | null } | null;
}
export type States = { hasSomethingToUndo?: boolean; hasSomethingToRedo?: boolean; hasSelectedEditor?: boolean };
