/**
 * A photographed page read and checked (the assistant's POST
 * /api/read-document, at /api/planner/... as the gateway forwards it),
 * and an airplane's handbook figures kept once confirmed (the gateway's
 * PUT /api/aircraft/{id}/handbook). Typed by the generated documents
 * (./types); a module of its own so client.ts does not grow.
 */
import { csrfHeaders, failIfNotOk } from "./client";
import { requestIdHeaders } from "./requestId";
import type { Aircraft, DocumentRead, HandbookFigures, ReadAsk } from "./types";

async function send<T>(method: "POST" | "PUT", path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method, body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...csrfHeaders(method), ...requestIdHeaders() },
  });
  await failIfNotOk(res);
  return res.json() as Promise<T>;
}

/** The page read into figures and checked by the engine; nothing saved. */
export const readDocument = (ask: ReadAsk) => send<DocumentRead>("POST", "/api/planner/api/read-document", ask);

/** The airplane's handbook figures as its pilot confirmed them; null
 *  takes them away. */
export const keepHandbook = (id: number, figures: HandbookFigures | null) =>
  send<Aircraft>("PUT", `/api/aircraft/${id}/handbook`, { figures });
