import { describe, expect, it } from "vitest";
import { linkPoh, NO_POH_LINKS, pohLink, unlinkPoh } from "./pohLinks";
import type { OwnDoc } from "./deviceFiles";

const doc = (id: string): OwnDoc => ({ id, name: `POH ${id}`, bytes: 1, added: "2026-11-26T00:00:00Z" });
const OWN = [doc("a"), doc("b")];
const MODEL = "Piper PA-28-140";

describe("an airplane's POH link", () => {
  it("is none until one is linked", () => {
    expect(pohLink(NO_POH_LINKS, OWN, "N654FL", MODEL)).toBeNull();
  });

  it("links by the N-number alone, in any case", () => {
    const links = linkPoh(NO_POH_LINKS, "n654fl", MODEL, "a", false);
    expect(pohLink(links, OWN, "N654FL", MODEL)).toEqual({ doc: OWN[0], forModel: false });
    expect(pohLink(links, OWN, "N123AB", MODEL)).toBeNull();
  });

  it("for every airplane of the model, by its words in any case or spacing", () => {
    const links = linkPoh(NO_POH_LINKS, "N654FL", MODEL, "a", true);
    expect(pohLink(links, OWN, "N123AB", "PIPER  pa-28-140")).toEqual({ doc: OWN[0], forModel: true });
    expect(pohLink(links, OWN, "N123AB", null)).toBeNull();
  });

  it("keeps an N-number's own over its model's", () => {
    const all = linkPoh(NO_POH_LINKS, "N654FL", MODEL, "a", true);
    const links = linkPoh(all, "N123AB", MODEL, "b", false);
    expect(pohLink(links, OWN, "N123AB", MODEL)?.doc.id).toBe("b");
    expect(pohLink(links, OWN, "N654FL", MODEL)?.doc.id).toBe("a");
  });

  it("moves between the N-number and the model as the choice changes", () => {
    const one = linkPoh(NO_POH_LINKS, "N654FL", MODEL, "a", false);
    const all = linkPoh(one, "N654FL", MODEL, "a", true);
    expect(all).toEqual({ tails: {}, models: { "PIPER PA-28-140": "a" } });
    expect(linkPoh(all, "N654FL", MODEL, "a", false)).toEqual({ tails: { N654FL: "a" }, models: {} });
  });

  it("is no link once its document is deleted from the device", () => {
    const links = linkPoh(NO_POH_LINKS, "N654FL", MODEL, "gone", false);
    expect(pohLink(links, OWN, "N654FL", MODEL)).toBeNull();
  });

  it("unlinks the one shown, the N-number's first, the model's after", () => {
    const both = linkPoh(linkPoh(NO_POH_LINKS, "N1", MODEL, "a", true), "N654FL", MODEL, "b", false);
    const once = unlinkPoh(both, "N654FL", MODEL);
    expect(pohLink(once, OWN, "N654FL", MODEL)?.doc.id).toBe("a");
    expect(pohLink(unlinkPoh(once, "N654FL", MODEL), OWN, "N654FL", MODEL)).toBeNull();
  });
});
