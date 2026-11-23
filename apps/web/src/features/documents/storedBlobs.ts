/**
 * Blobs kept in IndexedDB where the browser takes them, and as their bytes
 * where it does not. WebKit's ephemeral sessions -- Safari's Private
 * Browsing on an iPad, and the browser suite's WebKit -- refuse a Blob or
 * a File in an object store ("UnknownError: Error preparing Blob/File data
 * to be stored in object store"), so a PDF dropped into Your Documents
 * there was never added. Its bytes are an ArrayBuffer, which every
 * IndexedDB takes; read back, they are a File again with its name and
 * type, so nothing that reads the store sees the difference.
 */

/** A Blob put down as its bytes. */
interface StoredBytes {
  storedBytes: true;
  bytes: ArrayBuffer;
  type: string;
  name?: string;
}

const isBytes = (value: unknown): value is StoredBytes =>
  typeof value === "object" && value !== null && (value as Partial<StoredBytes>).storedBytes === true;

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;

/** Whether a value holds a Blob, itself or in its arrays and plain objects. */
export function holdsBlob(value: unknown): boolean {
  if (value instanceof Blob) return true;
  if (Array.isArray(value)) return value.some(holdsBlob);
  if (isPlain(value)) return Object.values(value).some(holdsBlob);
  return false;
}

/** The value with each Blob in it put down as its bytes. */
export async function asBytes(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    const name = value instanceof File ? value.name : (value as Blob & { name?: unknown }).name;
    return { storedBytes: true, bytes: await value.arrayBuffer(), type: value.type, ...(typeof name === "string" && { name }) };
  }
  if (Array.isArray(value)) return Promise.all(value.map(asBytes));
  if (isPlain(value)) return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await asBytes(v)])));
  return value;
}

/** The value as it was put down: each Blob's bytes a File (or a Blob) again. */
export function fromBytes(value: unknown): unknown {
  if (isBytes(value))
    return value.name !== undefined
      ? new File([value.bytes], value.name, { type: value.type })
      : new Blob([value.bytes], { type: value.type });
  if (Array.isArray(value)) return value.map(fromBytes);
  if (isPlain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromBytes(v)]));
  return value;
}

/** Put a value down: as it is, and where the store refuses a Blob in it, with its Blobs as bytes. */
export async function putKeepingBlobs(value: unknown, put: (value: unknown) => Promise<void>): Promise<void> {
  try {
    await put(value);
  } catch (error) {
    if (!holdsBlob(value)) throw error;
    await put(await asBytes(value));
  }
}
