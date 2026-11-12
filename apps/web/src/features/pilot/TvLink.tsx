import { Suspense, lazy, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import SheetDialog from "../../components/SheetDialog";
import { Button } from "../../components/ui/button";
import { ApiError, api } from "../../lib/api/client";
import { pilotQuery } from "../../lib/queryClient";
import { TEXT } from "../../lib/text";
import { TV_CODE_LENGTH, fromTvAddress, tvCode } from "./tvCode";
import { FieldError } from "../../components/ui/field";

// Loaded when it is drawn: the sign-in sheet out of the first load.
const SignInModal = lazy(() => import("../../components/SignInModal"));
// The code's slots (Base UI's OTP Field), with the sheet.
const TvCodeField = lazy(() => import("./TvCodeField"));

/**
 * Signing a TV in from the phone (#207, TvCode the TV's half): opened by
 * the address the TV shows, the box
 * for its code (SheetDialog: a sheet from the bottom on a phone) -- signed in, the code typed signs the TV in as this
 * pilot; signed out, sign in first, then open the TV's address again.
 */
export default function TvLink() {
  const [open, setOpen] = useState(fromTvAddress);
  const [typed, setTyped] = useState("");
  const { data: pilot, isLoading } = useQuery(pilotQuery);
  const approve = useMutation({
    mutationFn: (code: string) => api.approveDevice(code),
    meta: { silent: true },
    // A code refused: the slots emptied for it to be typed again.
    onError: () => setTyped(""),
  });
  // Sent as the TV shows it; short, said under the slots rather than the
  // button greyed out ahead of time.
  const [short, setShort] = useState(false);
  const send = (code: string) => {
    setShort(code.length < TV_CODE_LENGTH);
    if (code.length === TV_CODE_LENGTH) approve.mutate(tvCode(code));
  };
  // Off the address at once, so a reload does not open the box again, the
  // rest of the address kept: its one key, the TV's link's own.
  const [tvLink, setTvLink] = useQueryState("tv-link");
  const marked = open && tvLink !== null;
  useEffect(() => {
    if (marked) void setTvLink(null);
  }, [marked, setTvLink]);
  if (!open) return null;
  const close = () => setOpen(false);
  return (
    <SheetDialog
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      testId="tv-link"
      title="Sign in a TV"
      description="Enter the code the TV shows, and it signs in as you. Only enter a code from a TV you are looking at: anyone who has it can use your account."
    >
      {isLoading ? null : !pilot ? (
        <div className="flex flex-col items-start gap-3">
          <p className={TEXT.prose}>Sign in on this phone first, then open the address the TV shows again.</p>
          <Suspense fallback={null}>
            <SignInModal />
          </Suspense>
        </div>
      ) : approve.isSuccess ? (
        <p role="status" className={TEXT.prose} data-testid="tv-link-done">
          The TV is signing in as <span className="font-semibold">{pilot.email}</span>.
        </p>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(typed);
          }}
        >
          <Suspense fallback={<div className="h-11" />}>
            <TvCodeField
              value={typed}
              onChange={(v) => {
                setTyped(v);
                setShort(false);
              }}
              onComplete={send}
              invalid={short || approve.isError}
            />
          </Suspense>
          {short && (
            <FieldError className={`text-destructive-ink ${TEXT.prose}`} data-testid="tv-link-short">
              Enter all {TV_CODE_LENGTH} characters the TV shows.
            </FieldError>
          )}
          {approve.isError && (
            <FieldError className={`text-destructive ${TEXT.prose}`} data-testid="tv-link-error">
              {approve.error instanceof ApiError ? approve.error.message : "Couldn't reach the server. Try again."}
            </FieldError>
          )}
          <Button type="submit" disabled={approve.isPending} aria-busy={approve.isPending} data-testid="tv-link-approve">
            Sign in the TV
          </Button>
        </form>
      )}
    </SheetDialog>
  );
}
