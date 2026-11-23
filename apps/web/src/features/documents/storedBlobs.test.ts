import { describe, expect, it } from "vitest";
import { asBytes, fromBytes, holdsBlob, putKeepingBlobs } from "./storedBlobs";

const pdf = () => new File(["%PDF-1.7"], "Club rules.pdf", { type: "application/pdf" });

describe("storedBlobs", () => {
  it("puts a value down as it is where the store takes it", async () => {
    const put: unknown[] = [];
    const file = pdf();
    await putKeepingBlobs(file, async (v) => void put.push(v));
    expect(put).toEqual([file]);
  });

  it("puts a Blob down as its bytes where the store refuses one, and reads it back a File with its name and type", async () => {
    const put: unknown[] = [];
    // As WebKit's ephemeral sessions refuse a Blob in an object store.
    const refusing = async (v: unknown) => {
      if (holdsBlob(v)) throw new DOMException("Error preparing Blob/File data to be stored in object store", "UnknownError");
      put.push(v);
    };
    await putKeepingBlobs({ edition: "C", body: pdf() }, refusing);
    const back = fromBytes(put[0]) as { edition: string; body: File };
    expect(back.edition).toBe("C");
    expect(back.body).toBeInstanceOf(File);
    expect(back.body.name).toBe("Club rules.pdf");
    expect(back.body.type).toBe("application/pdf");
    expect(await back.body.text()).toBe("%PDF-1.7");
  });

  it("passes on a refusal of a value with no Blob in it", async () => {
    const refusing = () => Promise.reject(new Error("quota"));
    await expect(putKeepingBlobs([{ id: "a" }], refusing)).rejects.toThrow("quota");
  });

  it("leaves what is not a Blob as it is", async () => {
    expect(await asBytes([{ id: "a", n: 1 }, "x"])).toEqual([{ id: "a", n: 1 }, "x"]);
    expect(fromBytes(undefined)).toBeUndefined();
  });
});
