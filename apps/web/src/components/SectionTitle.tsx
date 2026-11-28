import type { ComponentProps, ReactNode } from "react";
import { cn } from "cn";
import { SECTION_TITLE } from "../lib/text";

/** A section's title: every list group's, every tab's strip, every
 *  card's part (lib/text SECTION_TITLE), so the app has one, where it had
 *  small grey capitals over a list, 17-point words over a strip and a
 *  bold title over a card's part. A span
 *  (`as`) where the section is itself a button, which may hold no
 *  heading: the Brief's cards. */
export default function SectionTitle({
  className,
  children,
  as: Tag = "h3",
  ...props
}: ComponentProps<"h3"> & { children: ReactNode; as?: "h3" | "span" }) {
  return (
    <Tag {...props} className={cn(SECTION_TITLE, className)}>
      {children}
    </Tag>
  );
}
