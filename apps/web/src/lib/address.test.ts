// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { withNuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { describe, expect, it } from "vitest";
import { ADDRESS_CLEARED, addressParams, loadAddress, navaidLink, tfrLink, useAddress, useAddressKey } from "./address";

/** The workspace's whole address and one key read on its own, as the page
 *  has them, over an address of their own; each write to it kept. */
function setUp(start: string) {
  const written: string[] = [];
  const onUrlUpdate = (event: UrlUpdateEvent) => written.push(event.queryString);
  const hook = renderHook(
    () => {
      const [address, setAddress] = useAddress();
      const [alternate, setAlternate] = useAddressKey("alternate");
      return { address, setAddress, alternate, setAlternate };
    },
    { wrapper: withNuqsTestingAdapter({ searchParams: start, hasMemory: true, onUrlUpdate }) },
  );
  return { hook, written };
}

describe("the address", () => {
  it("works out a change written as a function from the address as it is now", async () => {
    // The drawer opened just as the default route arrives, both before the
    // next render: the second is worked out from an address with the first
    // in it, and neither is lost (useSearchParamsNow's case, which nuqs's
    // setter keeps).
    const { hook } = setUp("dep=C81&dest=KDLH");
    await act(async () => {
      void hook.result.current.setAddress((prev) => ({ view: prev.view ? null : "briefing" }));
      void hook.result.current.setAddress((prev) => ({ stops: "KMSN", view: prev.view }));
    });
    expect(hook.result.current.address.view).toBe("briefing");
    expect(hook.result.current.address.stops).toBe("KMSN");
  });

  it("hands a change made by one reader to another's next change before either renders", async () => {
    const { hook } = setUp("dep=C81&dest=KDLH");
    await act(async () => {
      void hook.result.current.setAlternate("KMSN");
      void hook.result.current.setAddress((prev) => ({ fuel: prev.alternate }));
    });
    expect(hook.result.current.address.fuel).toBe("KMSN");
    expect(hook.result.current.alternate).toBe("KMSN");
  });

  it("writes the keys a change names and leaves the rest, null taking one out", async () => {
    const { hook, written } = setUp("dep=C81&dest=KDLH&place=KMSN&view=briefing");
    await act(async () => {
      await hook.result.current.setAddress({ place: null, dest: "KOSH", stops: undefined, near: true });
    });
    expect(Object.fromEntries(new URLSearchParams(written.at(-1)))).toEqual({ dep: "C81", dest: "KOSH", view: "briefing", near: "1" });
  });

  it("is a change alone over every key cleared", async () => {
    const { hook } = setUp("dep=C81&dest=KDLH&brief=1&altitude_choice=lowest&local_min=90");
    await act(async () => {
      await hook.result.current.setAddress({ ...ADDRESS_CLEARED, dest: "KOSH" });
    });
    expect(addressParams(hook.result.current.address).toString()).toBe("dest=KOSH");
  });
});

describe("the address's keys, typed", () => {
  it("reads flags, the Class B choice, the altitude's plan and a local flight's time as the page did", () => {
    const address = loadAddress("altitude_nearest=1&brief=1&near=0&class_b=0&altitude_choice=sideways&local_min=45");
    expect(address.altitude_nearest).toBe(true);
    expect(address.brief).toBe(true);
    expect(address.near).toBe(false);
    expect(address.class_b).toBe(false);
    expect(loadAddress("class_b=1").class_b).toBe(true);
    expect(address.altitude_choice).toBe("fastest");
    expect(address.local_min).toBe(45);
    expect(loadAddress("local_min=50").local_min).toBe(60);
  });

  it("reads a point held, an airplane and its past flight only where each is one", () => {
    expect(loadAddress("at=42.3172,-88.0905").at).toEqual({ lat: 42.3172, lon: -88.0905 });
    expect(loadAddress("at=91,0").at).toBeNull();
    expect(loadAddress("flight=A0B7D8").flight).toBe("a0b7d8");
    expect(loadAddress("flight=nope").flight).toBeNull();
    expect(loadAddress("past=1791723840").past).toBe(1791723840);
    expect(loadAddress("past=12").past).toBeNull();
  });

  it("leaves out what is at its default as text", () => {
    const address = loadAddress("dep=C81&class_b=1&altitude_choice=fastest&local_min=60&near=0");
    expect(addressParams(address).toString()).toBe("dep=C81");
  });

  it("opens a TFR's card by its NOTAM number, from the link its Share sends", () => {
    // TFR 6/4116 near Grand Forks (the owner's iPhone, 2026-11-14).
    const link = tfrLink("6/4116", "https://wingtipmaps.app");
    expect(link).toBe("https://wingtipmaps.app/app/plan?tfr=6%2F4116");
    expect(loadAddress(new URL(link).search).tfr).toBe("6/4116");
    expect(loadAddress("tfr=6/4116").tfr).toBe("6/4116");
    expect(addressParams({ tfr: "6/4116" }).get("tfr")).toBe("6/4116");
    // Not a NOTAM's number: no card.
    expect(loadAddress("tfr=KDLH").tfr).toBeNull();
    expect(loadAddress("tfr=6/").tfr).toBeNull();
  });

  it("opens a VOR's card by its ident and place, from the link its Share sends", () => {
    // The Northbrook VOR/DME (the owner's iPhone, 2026-11-14).
    const link = navaidLink({ ident: "OBK", lat: 42.22139, lon: -87.95167 }, "https://wingtipmaps.app");
    expect(link).toBe("https://wingtipmaps.app/app/plan?navaid=OBK%4042.2214%2C-87.9517");
    expect(loadAddress(new URL(link).search).navaid).toEqual({ ident: "OBK", lat: 42.2214, lon: -87.9517 });
    expect(addressParams({ navaid: { ident: "OBK", lat: 42.2214, lon: -87.9517 } }).get("navaid")).toBe("OBK@42.2214,-87.9517");
    // No place, or no ident: no card.
    expect(loadAddress("navaid=OBK").navaid).toBeNull();
    expect(loadAddress("navaid=@42.2,-87.9").navaid).toBeNull();
  });
});
