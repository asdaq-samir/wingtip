import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api/client";
import { TEXT } from "../lib/text";
import { FieldError } from "./ui/field";

/**
 * Signing in on a TV, at the owner's ask (#207): the emailed link opens on
 * the phone where the mail is read, never on the TV, so the TV shows a
 * code and the address to type it at on a phone already signed in, as
 * streaming apps do (DeviceSignInController), and asks every few seconds
 * until it has been typed in -- then it is signed in as that pilot. A
 * code ten minutes old is replaced by a new one.
 */
export default function TvCode() {
  const client = useQueryClient();
  // The code, asked again every ten seconds while it can't be had: no
  // keyboard on a TV to reload with.
  const { data: code, failureCount } = useQuery({
    queryKey: ["device-code"],
    queryFn: api.deviceCode,
    staleTime: Infinity,
    gcTime: 0,
    retry: true,
    retryDelay: 10_000,
    meta: { silent: true },
  });
  const failed = !code && failureCount > 0;
  // Asked every `interval` seconds, as the gateway says, while it is
  // waiting (not while the page is away, TanStack's own); the network
  // failing for a moment, asked again at the same pace.
  const { data: answer } = useQuery({
    queryKey: ["device-token", code?.deviceCode],
    queryFn: () => api.deviceToken(code!.deviceCode),
    enabled: !!code,
    refetchInterval: (query) => (code && (query.state.data ?? "waiting") === "waiting" ? code.interval * 1000 : false),
    retry: true,
    retryDelay: () => (code?.interval ?? 5) * 1000,
    gcTime: 0,
    meta: { silent: true },
  });
  useEffect(() => {
    // A code ten minutes old: a new one.
    if (answer === "gone") void client.resetQueries({ queryKey: ["device-code"] });
    else if (answer && answer !== "waiting") window.location.assign(answer.next);
  }, [answer, client]);
  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center" data-testid="tv-sign-in">
      <p className={TEXT.prose}>On your phone, signed in to Wingtip Maps, open</p>
      <p className={`font-semibold text-tint ${TEXT.row}`} data-testid="tv-address">
        {window.location.host}
        {code?.verificationPath ?? "/tv"}
      </p>
      <p className={TEXT.prose}>and enter</p>
      <p className="font-mono text-4xl font-bold tracking-widest tabular-nums" data-testid="tv-code" aria-live="polite">
        {code?.userCode ?? "····-····"}
      </p>
      {failed && <FieldError className={`text-destructive ${TEXT.prose}`}>Couldn't get a code. Check the TV's connection.</FieldError>}
    </div>
  );
}
