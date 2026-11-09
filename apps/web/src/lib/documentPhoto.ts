/**
 * A photographed page sent to be read (the assistant's POST
 * /api/read-document): the photo made small enough to send, and the read
 * with the engine's checks back. Shared by the airplane's and the
 * logbook's "Add from a Photo" (features/document-photo) and the
 * clearance card's (components/ClearancePhoto). Nothing here saves
 * anything: each screen shows what was read for the pilot to confirm.
 */
import { readDocument } from "./api/documents";
import type { DocumentRead, ReadAsk } from "./api/types";
import { localDay } from "./format/time";

export type DocumentKind = ReadAsk["kind"];
export type FlagLevel = "check" | "wrong";

/** The long edge a photo is sent at: past it the reader sees no more of
 *  a printed table (the API scales a larger image down itself), and the
 *  body stays a few hundred KB, well under the gateway's 4 MB. */
const LONG_EDGE_PX = 2000;
const JPEG_QUALITY = 0.85;

/** The photo as a JPEG at most LONG_EDGE_PX on its long edge, base64:
 *  turned upright from its EXIF orientation, as the phone shot it. */
async function photoForReading(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, LONG_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare the photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This browser cannot prepare the photo."))), "image/jpeg", JPEG_QUALITY),
  );
  return base64(jpeg);
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** The page read and checked: the photo made small, sent with what it is
 *  of and today's date (a logbook row may not be after it). */
export async function readPage(kind: DocumentKind, photo: Blob): Promise<DocumentRead> {
  const image = await photoForReading(photo);
  return readDocument({ kind, image, media_type: "image/jpeg", today: localDay() });
}

/** A flag's words in the findings' tones: "wrong" the stop's, "check" the
 *  caution's (lib/findings). */
export const FLAG_FINDING = { wrong: "stop", check: "caution" } as const satisfies Record<FlagLevel, string>;
