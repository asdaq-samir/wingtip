import { Button as BaseButton } from "@base-ui/react/button";
import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { cn } from "cn";
import AppleLogo from "./icons/AppleLogo";
import GoogleLogo from "./icons/GoogleLogo";
import { Button, buttonVariants } from "./ui/button";
import SheetDialog from "./SheetDialogBody";
import { Input } from "./ui/input";
import { Spinner } from "./ui/spinner";
import { ApiError, api } from "../lib/api/client";
import { LEGAL_PAGES } from "../lib/legal";
import { capabilitiesQuery } from "../lib/queryClient";
import { TEXT } from "../lib/text";
import { Separator } from "./ui/separator";
import { FieldError, FieldLabel } from "./ui/field";
import { errorIdOf, invalidProps } from "../lib/fieldError";
import { WORDING } from "../lib/wording/generated/wording";

/**
 * Three ways in, the standard shape every "sign in" prompt (Auth.js,
 * Clerk, Supabase Auth, and Apple/Google's own examples) already
 * converges on: one branded button per OIDC provider, opening a
 * redirect this app doesn't otherwise touch, plus an email fallback
 * for a pilot who'd rather not use either. Google/Apple are plain
 * links to Spring Security's own `/oauth2/authorization/{id}` routes,
 * offered only for the providers the deployment has registered
 * (capabilitiesQuery). Both were offered whatever was registered, and
 * one that was not opened a blank 401 -- on the local stack, which
 * registers neither, both did.
 */
/** What is said under the field for an address that can't be one. */
const BAD_ADDRESS = "Enter an email address like you@example.com.";

export default function SignInModal({
  hero = false,
  inline = false,
}: {
  /** You's large line while no one is signed in, in the name's place: a
   *  tinted Sign In at the hero size, said once (the owner, 2026-11-13:
   *  "Instead of saying you, just say sign in once"). */
  hero?: boolean;
  /** A tinted link inside a sentence ("Sign in to keep the flights you
   *  plan", FPL's Saved), its 44-point area round it. */
  inline?: boolean;
} = {}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const providers = useQuery(capabilitiesQuery).data?.providers ?? [];
  const trimmedEmail = email.trim();
  // The address a link went to is the one it was asked for with -- the
  // mutation's own variable -- not a copy taken from the box when the
  // answer came back, which said "Check" whatever had been typed since,
  // and survived a close and reopen mid-request.
  const magicLink = useMutation({ mutationFn: (address: string) => api.requestMagicLink(address), meta: { silent: true } });
  // Said under the field it is about (it was a toast over the map), and
  // whose fault it was: an address the server refused is the pilot's to
  // fix; a server or network failure is not, and "check the address"
  // sent them looking for a typo that was not there.
  const linkError = magicLink.error;
  // Only a 400 is the address: a 401 or 403 is the page's own token
  // refused (an http page that could not read the https port's Secure
  // cookie was one), which a reload replaces.
  const linkFailure = !linkError
    ? null
    : linkError instanceof ApiError && linkError.status === 429
      ? "Too many sign-in links asked for. Wait a few minutes and try again."
      : linkError instanceof ApiError && linkError.status === 400
        ? "That link could not be sent. Check the address and try again."
        : linkError instanceof ApiError && linkError.status < 500
          ? "That link could not be sent. Reload the page and try again."
          : "The sign-in service could not be reached. Try again in a minute.";
  // The address checked on Send by the field's own email grammar (the
  // stock type="email"), its words said under the field where the
  // server's refusals are, not in the browser's bubble (the owner's Q3,
  // 2026-11-21); cleared as the pilot types again.
  const [addressWrong, setAddressWrong] = useState(false);
  const fieldProblem = addressWrong ? BAD_ADDRESS : linkFailure;
  const sent = magicLink.isSuccess ? magicLink.variables : null;
  // The form goes as the link is sent, its button with it: focus taken to
  // what is said in its place, not left on nothing (WCAG 2.4.3, 4.1.3).
  const sentAt = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (sent) sentAt.current?.focus();
  }, [sent]);
  const emailId = useId();
  // On a phone a sheet from the navigation bar's edge, the bottom unless
  // the pilot moved it, as iOS asks to sign in, in the floating sheet's
  // look, at the owner's pick of the sheets audit (D3, 2026-10-17); wider,
  // the dialog in the middle (SheetDialog).
  return (
    <SheetDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setEmail("");
          magicLink.reset();
        }
      }}
      title="Sign In to Wingtip Maps"
      description="Save your airplanes and filed flights to your own account."
      trigger={
        inline ? (
          <BaseButton className="relative font-semibold text-tint outline-none hit-x-1 hit-y-3 focus-visible:ring-2 focus-visible:ring-ring">
            Sign in
          </BaseButton>
        ) : hero ? (
          <Button
            variant="link"
            data-testid="sign-in"
            className={cn(
              "relative h-auto p-0 font-bold tracking-tight text-tint after:absolute after:-inset-y-2 after:inset-x-0",
              TEXT.hero,
            )}
          >
            Sign In
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            {WORDING.signIn}
          </Button>
        )
      }
    >
      <>
        {providers.length > 0 && (
          <>
            {/* Links in a button's look: they go to the provider's page, and
                  Base UI's Button rendered as one named them buttons. */}
            <div className="flex flex-col gap-2">
              {providers.includes("google") && (
                <a href="/oauth2/authorization/google" className={cn(buttonVariants({ variant: "outline" }), "justify-start gap-3")}>
                  <GoogleLogo className="size-4" />
                  Continue with Google
                </a>
              )}
              {providers.includes("apple") && (
                <a href="/oauth2/authorization/apple" className={cn(buttonVariants({ variant: "outline" }), "justify-start gap-3")}>
                  <AppleLogo className="size-4" />
                  Continue with Apple
                </a>
              )}
            </div>
            <div className={`flex items-center gap-3 text-muted-foreground ${TEXT.note}`}>
              <Separator className="flex-1" />
              or
              <Separator className="flex-1" />
            </div>
          </>
        )}
        {sent ? (
          <p ref={sentAt} tabIndex={-1} className={`text-muted-foreground outline-none ${TEXT.prose}`} role="status">
            Check <span className="font-semibold text-foreground">{sent}</span> for a sign-in link. It expires in 15 minutes.
          </p>
        ) : (
          <form
            className="flex flex-col gap-2"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const field = e.currentTarget.elements.namedItem("email");
              if (field instanceof HTMLInputElement && !field.checkValidity()) {
                setAddressWrong(true);
                field.focus();
                return;
              }
              magicLink.mutate(trimmedEmail);
            }}
          >
            {/* Its title in sight once typed in, where a placeholder goes
                (WCAG 3.3.2), and the field's name the words seen (2.5.3). */}
            <FieldLabel htmlFor={emailId} className={cn("font-normal text-muted-foreground", TEXT.note)}>
              Email Address
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                type="email"
                name="email"
                required
                placeholder="you@example.com"
                id={emailId}
                {...invalidProps(emailId, fieldProblem ?? undefined)}
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setAddressWrong(false);
                }}
              />
              {/* Its word on it, where a grey envelope alone read as nothing
                to tap (the UI audit, 2026-11-09); a spinner in place of
                the envelope while the link is on its way. */}
              <Button
                type="submit"
                disabled={magicLink.isPending || !trimmedEmail}
                aria-busy={magicLink.isPending}
                className="h-auto shrink-0"
              >
                {magicLink.isPending ? (
                  <Spinner className="size-4" role="presentation" aria-label={undefined} aria-hidden />
                ) : (
                  <Mail className="size-4" aria-hidden="true" />
                )}
                Send Link
              </Button>
            </div>
            {fieldProblem && (
              <FieldError id={errorIdOf(emailId)} className={`text-destructive ${TEXT.prose}`} data-testid="sign-in-error">
                {fieldProblem}
              </FieldError>
            )}
          </form>
        )}
      </>
      {/* One row of links, not links in a sentence: each gets its 44-point
          area from a pseudo-element, and a wrapped sentence would put
          those areas on top of each other. */}
      <p className={`text-center text-muted-foreground ${TEXT.note}`} data-testid="sign-in-accept">
        By signing in you accept the
      </p>
      <nav aria-label="Legal" className={`flex justify-center gap-2 text-tint ${TEXT.note}`} data-testid="sign-in-legal">
        {[LEGAL_PAGES[1], LEGAL_PAGES[0], LEGAL_PAGES[2]].map((p) => (
          <a
            key={p.key}
            className="relative after:absolute after:-inset-x-1 after:-inset-y-3.5"
            href={p.href}
            target="_blank"
            rel="noreferrer"
          >
            {p.title}
          </a>
        ))}
      </nav>
    </SheetDialog>
  );
}
