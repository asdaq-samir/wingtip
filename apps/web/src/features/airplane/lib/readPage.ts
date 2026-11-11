/**
 * The words on a photo of a page, read on the phone itself by Tesseract
 * (tesseract.js), at the owner's "Isn't there a library we can use?": no
 * key, no account and no server, and it works with no connection once its
 * files are kept. The library, its engine and its English are loaded only
 * at the first read, from this app's own origin (vite.config's
 * tesseractFiles), not a CDN: the page's Content-Security-Policy allows
 * scripts from itself alone (SecurityConfig).
 */
const BASE = `${import.meta.env.BASE_URL}tesseract/`;

async function readPage(image: Blob): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: `${BASE}worker.min.js`,
    corePath: BASE,
    langPath: BASE,
    // The worker from its own file, not a blob: address the policy would refuse.
    workerBlobURL: false,
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    void worker.terminate();
  }
}

/** A phone's photo at most 2,000 points on its longer side: as much as a
 *  page's small print needs, and a 12-megapixel photo read in a few
 *  seconds rather than many. */
async function smaller(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
}

/** The words on a photo the pilot took, made smaller first. */
export const readPhoto = async (file: File): Promise<string> => readPage(await smaller(file));
