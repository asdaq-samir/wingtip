import type { ReactElement, ReactNode } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../ui/context-menu";

/** One of a held row's actions: Share, Remove. */
export interface HeldAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  /** Its name to a screen reader, where that is more than the word. */
  spoken?: string;
  testId?: string;
}

/**
 * A row's menu from a long press or a right click, the stock ContextMenu,
 * from the popups' chunk (popupsChunk): `trigger` the row's own element,
 * `children` what is in it.
 */
export function HeldMenu({ trigger, actions, children }: { trigger: ReactElement; actions: HeldAction[]; children: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={trigger}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-48">
        {actions.map((a) => (
          <ContextMenuItem
            key={a.label}
            variant={a.destructive ? "destructive" : "default"}
            onClick={a.onClick}
            aria-label={a.spoken}
            data-testid={a.testId}
          >
            {a.icon}
            {a.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
