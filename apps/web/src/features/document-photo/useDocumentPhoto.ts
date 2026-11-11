/**
 * "Add from a Photo"'s one hook: the page photographed and read (the
 * assistant reads it, the engine checks it), the items the pilot confirms
 * one by one, a figure corrected and checked again, and -- only when the
 * pilot asks -- the confirmed figures handed to the airplane's form, or
 * the confirmed flights logged. Nothing is saved without that ask.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import type { DocumentRead } from "../../lib/api/types";
import { readPage, type DocumentKind } from "../../lib/documentPhoto";
import { done } from "../../lib/doneNote";
import { localDay } from "../../lib/format/time";
import {
  checkHandbook,
  checkLogbook,
  confirmedFigures,
  handbookOf,
  loggable,
  logbookOf,
  withFigure,
  type HandbookCheck,
  type HandbookRead,
  type LogbookCheck,
  type LogbookRead,
} from "./reads";

export type Confirmed = ReturnType<typeof confirmedFigures>;

export function useDocumentPhoto(first: DocumentKind) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DocumentKind>(first);
  const [answer, setAnswer] = useState<DocumentRead | null>(null);
  const [handbook, setHandbook] = useState<{ read: HandbookRead; check: HandbookCheck } | null>(null);
  const [logbook, setLogbook] = useState<{ read: LogbookRead; check: LogbookCheck } | null>(null);
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [logged, setLogged] = useState<ReadonlySet<number>>(new Set());

  const reading = useMutation({
    mutationFn: (photo: Blob) => readPage(kind, photo),
    onSuccess: (read) => {
      setAnswer(read);
      setConfirmed(new Set());
      setLogged(new Set());
      const h = handbookOf(read);
      setHandbook(h && read.handbook_check ? { read: h, check: read.handbook_check as HandbookCheck } : null);
      const l = logbookOf(read);
      setLogbook(l && read.logbook_check ? { read: l, check: read.logbook_check as LogbookCheck } : null);
    },
  });

  const toggle = (key: string) =>
    setConfirmed((now) => {
      const next = new Set(now);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** A handbook figure corrected at its path and the page checked again. */
  const correct = (path: string, value: number) =>
    setHandbook((now) => {
      if (!now) return now;
      const read = withFigure(now.read, path, value);
      return { read, check: checkHandbook(read) };
    });

  /** A logbook row's member corrected and the page checked again. */
  const correctRow = (row: number, member: string, value: number | string | null) =>
    setLogbook((now) => {
      if (!now) return now;
      const read = withFigure(now.read, `rows.${row}.${member}`, value);
      return { read, check: checkLogbook(read, localDay()) };
    });

  /** The confirmed handbook items' figures, the engine asked again with
   *  only those: for the airplane's form, which the pilot then saves. */
  const confirmedHandbook = (): Confirmed | null => (handbook && confirmed.size ? confirmedFigures(handbook.read, confirmed) : null);

  // The confirmed rows that can be logged, in the page's order.
  const rows = logbook?.check.rows ?? [];
  const toLog = rows.map((r, i) => ({ ...r, i })).filter((r) => confirmed.has(`row.${r.i}`) && loggable(r.entry) && !logged.has(r.i));

  /** The confirmed flights logged, one at a time, through the gateway's
   *  logbook (as a typed one is); each kept as it lands, so a failure
   *  part way leaves the rest to log again and none twice. */
  const log = useMutation({
    mutationFn: async () => {
      for (const r of toLog) {
        await api.logbook.add({ ...r.entry, flownOn: r.entry.flownOn as string });
        setLogged((now) => new Set(now).add(r.i));
      }
      return toLog.length;
    },
    onSuccess: (n) => {
      done(n === 1 ? "Flight Logged" : `${n} Flights Logged`);
      for (const key of ["logbook", "currency", "training", "paperwork"]) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });

  const reset = () => {
    reading.reset();
    log.reset();
    setAnswer(null);
    setHandbook(null);
    setLogbook(null);
    setConfirmed(new Set());
    setLogged(new Set());
  };

  return {
    kind,
    setKind,
    answer,
    handbook,
    logbook,
    confirmed,
    logged,
    toggle,
    correct,
    correctRow,
    read: reading.mutate,
    reading: reading.isPending,
    readError: reading.error,
    confirmedHandbook,
    toLog: toLog.length,
    log: log.mutate,
    logging: log.isPending,
    logError: log.error,
    reset,
  };
}

export type DocumentPhoto = ReturnType<typeof useDocumentPhoto>;
