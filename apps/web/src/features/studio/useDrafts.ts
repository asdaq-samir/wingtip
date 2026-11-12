import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { describeError } from "../../lib/api/client";
import { confirmDraft, dismissDraft, draftRendered, studioDraftQuery, studioDraftsQuery, type StudioDraft } from "./draftsApi";
import { useStudioAddress } from "./studioAddress";

/** The UTC day a draft's track is on: its nearest report's, else the middle of its window. */
export function draftDay(draft: StudioDraft): string | null {
  const id = draft.identity;
  const t = id?.nearest?.t ?? (id?.window ? (id.window.start + id.window.end) / 2 : null);
  return t === null ? null : new Date(t * 1000).toISOString().slice(0, 10);
}

declare global {
  interface Window {
    /** scripts/dev/studio-render.mjs marks a draft rendered through the page, signed in as the developer. */
    __studioDraftRendered?: (id: string) => Promise<StudioDraft>;
  }
}

/**
 * The Studio's crash drafts (docs/STUDIO-PIPELINE.md): the list, the one
 * open (the address's `draft`, so the mailed link opens it), and the
 * developer's words on it -- the identity right or not, set aside -- each
 * said where it failed. Opening a draft with a track loads it into the
 * Studio by its N-number and UTC day: the address's `q` and `day`, which
 * useStudio reads, the draft kept open beside them.
 */
export function useDrafts() {
  const [{ draft: open }, setAddress] = useStudioAddress();
  const id = open ?? "";
  const queryClient = useQueryClient();
  const list = useQuery(studioDraftsQuery);
  const one = useQuery(studioDraftQuery(id));
  const refresh = (draft: StudioDraft) => {
    queryClient.setQueryData(studioDraftQuery(draft.id).queryKey, (was) => ({ ...was, ...draft, captions: was?.captions ?? null }));
    void queryClient.invalidateQueries({ queryKey: studioDraftsQuery.queryKey });
  };
  const identity = useMutation({ mutationFn: (confirm: boolean) => confirmDraft(id, confirm), onSuccess: refresh, meta: { silent: true } });
  const dismiss = useMutation({ mutationFn: () => dismissDraft(id), onSuccess: refresh, meta: { silent: true } });

  useEffect(() => {
    window.__studioDraftRendered = async (draftId: string) => {
      const draft = await draftRendered(draftId);
      refresh(draft);
      return draft;
    };
    return () => {
      delete window.__studioDraftRendered;
    };
  });

  // The draft's track loaded once it is opened, where it has one.
  const draft = one.data;
  const tail = draft?.track === "adsb" ? draft.n_number : null;
  const day = draft && tail ? draftDay(draft) : null;
  useEffect(() => {
    if (!tail || !day) return;
    void setAddress({ q: tail || null, day: day || null });
  }, [tail, day, setAddress]);

  const failed = identity.error ?? dismiss.error ?? one.error;
  return {
    drafts: list.data ?? [],
    draft: draft ?? null,
    problem: failed ? describeError(failed, "The draft couldn't be changed") : null,
    busy: identity.isPending || dismiss.isPending,
    /** Open a draft (null: back to the list). */
    select: (draftId: string | null) => void setAddress({ draft: draftId || null }),
    confirm: () => identity.mutate(true),
    reject: () => identity.mutate(false),
    dismiss: () => dismiss.mutate(),
  };
}

export type Drafts = ReturnType<typeof useDrafts>;
