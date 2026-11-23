import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { ApiError, describeError } from "../../lib/api/errors";
import type { Connection } from "../../lib/api/types";
import { showError } from "../../lib/problems";

const KEY = ["connections"] as const;

/**
 * You's Connected Apps, its one hook: the AI apps the pilot connected
 * through the connector (the MCP server), and one of them ended from
 * Wingtip's side, asked first, its tokens revoked at once (the deep
 * security review of 2026-11-21, N2). A connection already gone (a 404)
 * is simply no longer listed; any other failure is said where the pilot
 * is (lib/problems).
 */
export function useConnectedApps() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: KEY, queryFn: api.connections.list });
  // The connection the pilot asked to end, until they answer.
  const [asked, setAsked] = useState<Connection | null>(null);
  const disconnect = useMutation({
    mutationFn: (id: string) => api.connections.disconnect(id),
    onError: (err) => {
      if (!(err instanceof ApiError && err.status === 404)) showError("The app was not disconnected", describeError(err));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  return {
    connections: list.data,
    loading: list.isPending,
    failed: list.isError,
    asked,
    ask: setAsked,
    confirm: () => {
      if (asked) disconnect.mutate(asked.id);
      setAsked(null);
    },
    ending: disconnect.isPending ? disconnect.variables : undefined,
  };
}
