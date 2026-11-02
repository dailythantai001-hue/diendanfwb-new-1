import { useEffect, useRef } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

/** Keep the originating React tree mounted; only isolate the temporary screen. */
export function useVipScreen(open: boolean, onClose: () => void) {
  const screenRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || !screenRef.current) return;
    const screen = screenRef.current;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scrolls = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => !screen.contains(el) && (el.scrollTop !== 0 || el.scrollLeft !== 0))
      .map((el) => ({ el, top: el.scrollTop, left: el.scrollLeft }));
    const siblings = Array.from(document.body.children)
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el !== screen && !el.contains(screen))
      .map((el) => ({ el, inert: el.inert }));
    siblings.forEach(({ el }) => { el.inert = true; });

    const controls = () => Array.from(screen.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
    )).filter((el) => !el.closest('[hidden], [data-state="closed"]'));
    controls()[0]?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation(); closeRef.current();
      }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0]; const last = items.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !screen.contains(document.activeElement))) {
        event.preventDefault(); last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (document.activeElement === last || !screen.contains(document.activeElement))) {
        event.preventDefault(); first.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      siblings.forEach(({ el, inert }) => { el.inert = inert; });
      scrolls.forEach(({ el, top, left }) => { if (el.isConnected) { el.scrollTop = top; el.scrollLeft = left; } });
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, [open]);

  return screenRef;
}