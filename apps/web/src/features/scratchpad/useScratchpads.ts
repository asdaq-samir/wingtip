import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAddressKey } from "../../lib/address";
import { toast } from "../../lib/toast";
import {
  allPads,
  flightWords,
  newPad,
  padStore,
  removePad,
  sameFlight,
  savePad,
  type FlightLink,
  type Pad,
  type PadStore,
} from "./padStore";
import { templateOf, type TemplateId } from "./templates";

/** The pages' list, asked of the device's store. */
export const PADS_KEY = ["scratchpads"] as const;

/** The flight open now, as the address has its route's ends; none without a route. */
function useFlightNow(): FlightLink | null {
  const [dep] = useAddressKey("dep");
  const [dest] = useAddressKey("dest");
  return dep || dest ? { dep: dep ?? null, dest: dest ?? null } : null;
}

/** A page as its row lists it: its template's title, its flight, when. */
export interface PadRow {
  id: string;
  title: string;
  flight: string | null;
  updated: string;
}

const rowOf = (p: Pad): PadRow => ({ id: p.id, title: templateOf(p.template).title, flight: flightWords(p.flight), updated: p.updated });

/**
 * The scratchpad's view model (ScratchpadPage): every page on this
 * device, this flight's first and the rest under them, and a new page of
 * a template for the flight open now; a page taken away with Undo.
 */
export function useScratchpads(store: PadStore = padStore()) {
  const client = useQueryClient();
  const flight = useFlightNow();
  const { data: pads = [] } = useQuery({ queryKey: PADS_KEY, queryFn: () => allPads(store), staleTime: Infinity });
  const refresh = () => client.invalidateQueries({ queryKey: PADS_KEY });
  const create = useMutation({
    mutationFn: async (template: TemplateId) => {
      const pad = newPad(template, flight);
      await savePad(store, pad);
      return pad.id;
    },
    onSuccess: refresh,
  });
  const remove = async (id: string) => {
    const pad = pads.find((p) => p.id === id);
    if (!pad) return;
    await removePad(store, id);
    await refresh();
    toast.undo(`${templateOf(pad.template).title} Deleted`, () => void savePad(store, pad).then(refresh), { testId: "scratchpad-undo" });
  };
  return {
    flight: flightWords(flight),
    thisFlight: pads.filter((p) => sameFlight(p.flight, flight)).map(rowOf),
    earlier: pads.filter((p) => !sameFlight(p.flight, flight)).map(rowOf),
    create: (template: TemplateId) => create.mutateAsync(template),
    remove,
  };
}
