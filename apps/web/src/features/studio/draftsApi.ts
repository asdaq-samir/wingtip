import { queryOptions } from "@tanstack/react-query";
import { data, planner } from "../../lib/api/client";
import type { components } from "../../lib/api/schema";

export type StudioDraft = components["schemas"]["StudioDraft"];

/** The crash drafts (the planner's /api/studio/drafts, from the store the
 *  crash-leads job writes; docs/STUDIO-PIPELINE.md). */
export const studioDraftsQuery = queryOptions({
  queryKey: ["studioDrafts"],
  queryFn: () => planner.GET("/api/studio/drafts").then(data<StudioDraft[]>),
  staleTime: 60_000,
  meta: { silent: true },
});

/** One draft, with its kit's captions. */
export const studioDraftQuery = (id: string) =>
  queryOptions({
    queryKey: ["studioDraft", id],
    queryFn: () => planner.GET("/api/studio/drafts/{draft_id}", { params: { path: { draft_id: id } } }).then(data<StudioDraft>),
    enabled: !!id,
    meta: { silent: true },
  });

export const confirmDraft = (id: string, confirm: boolean) =>
  planner.POST("/api/studio/drafts/{draft_id}/identity", { params: { path: { draft_id: id } }, body: { confirm } }).then(data<StudioDraft>);

export const dismissDraft = (id: string) =>
  planner.POST("/api/studio/drafts/{draft_id}/dismiss", { params: { path: { draft_id: id } } }).then(data<StudioDraft>);

export const draftRendered = (id: string) =>
  planner.POST("/api/studio/drafts/{draft_id}/rendered", { params: { path: { draft_id: id } } }).then(data<StudioDraft>);
