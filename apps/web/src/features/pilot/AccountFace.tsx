import { useState } from "react";
import { UserRound } from "lucide-react";
import { cn } from "cn";
import { TEXT } from "../../lib/text";
import { accountFill } from "./accountLook";

/** The pilot's initials, from their name: two letters at most. */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** What the account button and You's avatar show: the pilot's own photo
 *  where they chose one (Pilot Details' Choose Photo, the gateway's
 *  avatarUrl), their initials where not, or a person's glyph signed out.
 *  A photo that does not load (the session gone meanwhile) falls back to
 *  the initials rather than a broken image. */
export function AccountFace({ name, photo }: { name: string | null; photo?: string | null }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (photo && broken !== photo) {
    return (
      <img
        src={photo}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="size-full rounded-full object-cover"
        onError={() => setBroken(photo)}
        data-testid="avatar-photo"
      />
    );
  }
  return name ? <span aria-hidden="true">{initialsOf(name)}</span> : <UserRound className="size-5" aria-hidden="true" />;
}

/** The large avatar at You's head and atop Pilot Details, as Apple Maps'
 *  account card and Contacts head themselves: 88 points round. */
export function LargeFace({ name, photo }: { name: string | null; photo?: string | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn("mb-2 grid size-22 place-items-center rounded-full font-bold [&_svg]:size-10!", accountFill(!!name), TEXT.hero)}
    >
      <AccountFace name={name} photo={photo} />
    </span>
  );
}
