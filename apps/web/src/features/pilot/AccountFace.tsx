import { UserRound } from "lucide-react";

/** The pilot's initials, from their name: two letters at most. */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** What the account button shows: the pilot's initials, or a person's
 *  glyph signed out. */
export function AccountFace({ name }: { name: string | null }) {
  return name ? <span aria-hidden="true">{initialsOf(name)}</span> : <UserRound className="size-5" aria-hidden="true" />;
}
