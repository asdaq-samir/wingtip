/** The photo's side as sent, in pixels: twice the 88-point avatar at You's
 *  head (LargeFace) for a phone's 2x and 3x screens, some 20-40 KB as a
 *  JPEG, well within the gateway's 512 KB (AvatarService). */
const PHOTO_SIDE = 256;

/** The square kept of a width-by-height picture: its middle, the shorter
 *  side across, as Contacts and Apple Maps crop an avatar. */
export function centreSquare(width: number, height: number): { x: number; y: number; side: number } {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, side };
}

/** What the pilot is told when the browser cannot read what they picked. */
const UNREADABLE = "That photo could not be read. Choose a JPEG, PNG or HEIC photo.";

/**
 * The picked photo, cropped square from its middle and drawn at
 * PHOTO_SIDE as a JPEG: a phone's photo is megabytes, and an avatar
 * needs a few kilobytes. Turned upright first (a camera's EXIF
 * orientation), as Photos shows it.
 */
export async function squarePhoto(file: Blob, side = PHOTO_SIDE): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(UNREADABLE);
  }
  try {
    const crop = centreSquare(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(UNREADABLE);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, crop.x, crop.y, crop.side, crop.side, 0, 0, side, side);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(UNREADABLE))), "image/jpeg", 0.85),
    );
  } finally {
    bitmap.close();
  }
}
