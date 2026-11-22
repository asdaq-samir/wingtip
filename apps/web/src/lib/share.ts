import { useEffect, useState } from "react";

/**
 * Something sent from the app -- a route's address, the flight for the
 * passengers -- the one way it goes everywhere: the share sheet where the
 * browser has one (Safari on an iPhone), otherwise copied. Says which, for the page to say so.
 */
export async function shareOrCopy(item: { title: string; text?: string; url?: string }): Promise<"shared" | "copied"> {
  if (navigator.share) {
    await navigator.share(item);
    return "shared";
  }
  await copyText(item.url ?? item.text ?? "");
  return "copied";
}

/** A file sent from the app -- a marked-up page of a document -- on the
 *  share sheet where the browser shares files (Safari on an iPad or an
 *  iPhone: Messages, Mail, Files, AirDrop), otherwise saved as a
 *  download. Says which. */
export async function shareOrSave(item: { file: File; title: string; text?: string }): Promise<"shared" | "saved"> {
  const shared = { files: [item.file], title: item.title, ...(item.text ? { text: item.text } : {}) };
  if (navigator.canShare?.(shared)) {
    await navigator.share(shared);
    return "shared";
  }
  const url = URL.createObjectURL(item.file);
  const a = Object.assign(document.createElement("a"), { href: url, download: item.file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return "saved";
}

/** Text copied, where a control says Copy rather than Share (a flight
 *  plan's form for Flight Service's own site): the one place the app
 *  writes to the clipboard. */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** The pilot closed the share sheet: nothing went wrong. */
export const cancelled = (err: unknown) => (err as Error | undefined)?.name === "AbortError";

/** "Copied" on what was copied, for a moment, where it was tapped: the
 *  key of what was, and the way to say another was. */
export function useCopied(): [string | null, (key: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const done = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(done);
  }, [copied]);
  return [copied, setCopied];
}
