import type { FileStore, OwnDoc } from "./deviceFiles";

/**
 * Which of the pilot's own documents is an airplane's POH, kept on this
 * device beside the documents themselves (deviceFiles): by its N-number,
 * or for every airplane of its model, the registry's make and model else
 * the profile's type. Manufacturers' handbooks are copyrighted, so the
 * app ships none: each pilot adds their own, and the link says which.
 * An N-number's own link stands over its model's, so one airplane with a
 * different handbook (a later serial's, a modified one) keeps its own.
 */
export interface PohLinks {
  tails: Readonly<Record<string, string>>;
  models: Readonly<Record<string, string>>;
}

export const NO_POH_LINKS: PohLinks = { tails: {}, models: {} };

/** N-numbers and models as typed differ in case and spacing alone. */
const keyOf = (words: string) => words.trim().replace(/\s+/g, " ").toUpperCase();

/** An airplane's POH, the document itself, and whether it came by its model's link. */
export interface LinkedPoh {
  doc: OwnDoc;
  forModel: boolean;
}

/** The airplane's POH, where the document linked is still on the device:
 *  its N-number's, else its model's. A document deleted is no link. */
export function pohLink(links: PohLinks, own: readonly OwnDoc[], tail: string, model: string | null): LinkedPoh | null {
  const find = (id: string | undefined) => (id ? own.find((d) => d.id === id) : undefined);
  const byTail = find(links.tails[keyOf(tail)]);
  if (byTail) return { doc: byTail, forModel: false };
  const byModel = model ? find(links.models[keyOf(model)]) : undefined;
  return byModel ? { doc: byModel, forModel: true } : null;
}

/** `id` the airplane's POH: for every airplane of its model, its N-number
 *  then following the model's; else for this N-number alone, the model's
 *  link to the same document taken off, since the pilot said it is not
 *  for all of them. */
export function linkPoh(links: PohLinks, tail: string, model: string | null, id: string, forModel: boolean): PohLinks {
  const t = keyOf(tail);
  const m = model ? keyOf(model) : null;
  const tails = { ...links.tails };
  const models = { ...links.models };
  if (forModel && m) {
    models[m] = id;
    delete tails[t];
  } else {
    tails[t] = id;
    if (m && models[m] === id) delete models[m];
  }
  return { tails, models };
}

/** The link shown taken off, the document left in the pilot's own: the
 *  N-number's where it has one, else its model's. */
export function unlinkPoh(links: PohLinks, tail: string, model: string | null): PohLinks {
  const t = keyOf(tail);
  const tails = { ...links.tails };
  const models = { ...links.models };
  if (t in tails) delete tails[t];
  else if (model) delete models[keyOf(model)];
  return { tails, models };
}

const POH = "poh";

export const pohLinks = async (s: FileStore): Promise<PohLinks> => (await s.get<PohLinks>(POH)) ?? NO_POH_LINKS;

export const changePohLinks = (s: FileStore, change: (old: PohLinks) => PohLinks) =>
  s.update<PohLinks>(POH, (old) => change(old ?? NO_POH_LINKS));
