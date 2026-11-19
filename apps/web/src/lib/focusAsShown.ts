/**
 * A field asked for as a card over the sheet goes (the Profile's Add a
 * Stop) comes back into sight a frame or two after the card leaves: the
 * sheet under a card is hidden (SheetDrawer's GIVE_WAY, a visibility
 * transition on Base UI's data-nested-drawer-open, which the drawer drops
 * in an effect after the card's close), and a hidden field takes no focus.
 * So `focus` is asked again on each frame until `field` has the focus,
 * asked as it shows, for half a second at most (30 frames). Returns the
 * cancel.
 */
export function focusAsShown(field: () => HTMLElement | null, focus: () => void): () => void {
  let frame = 0;
  let frames = 0;
  const again = () => {
    const el = field();
    if (!el || document.activeElement === el || ++frames > 30) return;
    if (el.checkVisibility({ visibilityProperty: true })) focus();
    else frame = requestAnimationFrame(again);
  };
  frame = requestAnimationFrame(again);
  return () => cancelAnimationFrame(frame);
}
