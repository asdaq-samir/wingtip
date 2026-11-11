import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import SheetDialog from "../../components/SheetDialog";
import { ApiError, api } from "../../lib/api/client";
import { TEXT } from "../../lib/text";
import { linkAccount } from "./linkAccount";

/** The token an emailed sign-in link brought, from the address's
 *  fragment (`#signin=…`), where the link's redirect put it
 *  (MagicLinkController#confirm). */
function linkToken(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get("signin");
}

/**
 * The last step of an emailed-link sign-in, in the app's own dialog
 * over the planner rather than on a bare server page: a sheet from the
 * bottom on a phone (SheetDialog).
 *
 * Opening the link signs nobody in: mail scanners fetch links to check
 * them, and one that spent the token would leave the pilot a link that
 * says it was already used. The token is spent by the POST this dialog's
 * Sign in button makes -- the one thing a scanner does not do.
 * Success opens wherever the server sent the browser: the planner, or
 * dev mode for a developer.
 *
 * The dialog names the account the link signs in to, masked, before the
 * pilot presses Sign in (linkAccount): a link to someone else's account,
 * mailed to the pilot so that what they save lands where the sender reads
 * it, shows an address that is not theirs (the security audit's L1).
 */
export default function LinkSignIn() {
  const [token] = useState(linkToken);
  // The token taken off the address by the router (React Router's
  // navigate, replacing), so a reload or a shared link does not ask again.
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(token !== null);
  const account = useQuery({
    queryKey: ["linkAccount", token],
    queryFn: () => linkAccount(token ?? ""),
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
    meta: { silent: true },
  });
  const finish = useMutation({
    mutationFn: (value: string) => api.finishMagicLink(value),
    onSuccess: (landing) => window.location.assign(landing),
    meta: { silent: true },
  });
  if (token === null) return null;

  const spent = (finish.error instanceof ApiError && finish.error.status === 400) || account.data === null;
  const close = () => {
    setOpen(false);
    void navigate({ pathname, search }, { replace: true });
  };

  return (
    <SheetDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Sign in"
      description={
        account.data
          ? `This link signs in to ${account.data}. Sign in only if that is your email address.`
          : "Finish signing in with the link from your email."
      }
      action={{ label: "Sign in", onClick: () => finish.mutate(token), disabled: finish.isPending || spent || account.isPending }}
    >
      {(finish.isError || spent) && (
        <p role="alert" className={`text-destructive ${TEXT.prose}`}>
          {spent
            ? "This link has expired or was already used. Ask for a new one from the pilot console."
            : "Couldn't sign in just now. Try again."}
        </p>
      )}
    </SheetDialog>
  );
}
