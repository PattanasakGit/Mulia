/** Shape of the bits of an Element we read, so the check is testable without a DOM. */
type KeyTarget = {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
};

const OWN_SPACE = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY", "DIALOG"]);
const OWN_SPACE_ROLES = ["slider", "button", "switch", "checkbox", "radio", "tab", "menuitem", "link", "dialog", "alertdialog"];

/**
 * True when Space on this element already means something (type a space, press a button, move a
 * slider, confirm inside a dialog), so the room-wide play/pause shortcut must stay out of the way.
 */
export function spaceBelongsToTarget(target: EventTarget | null) {
  const el = target as KeyTarget | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (OWN_SPACE.has(el.tagName.toUpperCase()) || el.isContentEditable) return true;
  const role = el.getAttribute?.("role");
  if (role && OWN_SPACE_ROLES.includes(role)) return true;
  // anything inside an open dialog: the dialog owns the keyboard until it is closed
  return Boolean(el.closest?.('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'));
}
