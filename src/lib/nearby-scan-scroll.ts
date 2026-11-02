/** Align before fixing the body: smooth scrolling cannot finish after a body lock. */
export function pinMobileScan(page: HTMLElement): () => void {
  if (!window.matchMedia("(max-width: 767px)").matches) return () => {};
  const frame = page.querySelector<HTMLElement>(".pk-card--scan");
  if (!frame) return () => {};
  const body = document.body, html = document.documentElement;
  const x = window.scrollX, y = window.scrollY;
  const previous = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, htmlOverflow: html.style.overflow, behavior: html.style.scrollBehavior, padding: page.style.getPropertyValue("padding-bottom"), paddingPriority: page.style.getPropertyPriority("padding-bottom") };
  html.style.scrollBehavior = "auto";
  const headerBottom = document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0;
  const backBottom = page.querySelector(".pk-back-row")?.getBoundingClientRect().bottom ?? headerBottom;
  const top = Math.max(0, headerBottom, backBottom) + 20;
  const bottom = Math.min(window.innerHeight, page.querySelector(".pk-bar")?.getBoundingClientRect().top ?? window.innerHeight) - 20;
  // offsetHeight ignores the camera animation's temporary transform.
  const rect = frame.getBoundingClientRect();
  const targetTop = top + Math.max(0, (bottom - top - frame.offsetHeight) / 2);
  const target = Math.max(0, y + rect.top - targetTop);
  const missingSpace = target - Math.max(0, html.scrollHeight - window.innerHeight);
  if (missingSpace > 0) page.style.setProperty("padding-bottom", `${parseFloat(getComputedStyle(page).paddingBottom) + missingSpace + 16}px`, "important");
  window.scrollTo(x, target);
  const pinnedY = window.scrollY;
  body.style.overflow = html.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${pinnedY}px`;
  body.style.left = `-${x}px`;
  body.style.width = "100%";
  const stop = (event: TouchEvent) => event.preventDefault();
  document.addEventListener("touchmove", stop, { passive: false });
  return () => {
    body.style.overflow = previous.overflow; body.style.position = previous.position;
    body.style.top = previous.top; body.style.left = previous.left; body.style.width = previous.width;
    html.style.overflow = previous.htmlOverflow;
    if (previous.padding) page.style.setProperty("padding-bottom", previous.padding, previous.paddingPriority);
    else page.style.removeProperty("padding-bottom");
    document.removeEventListener("touchmove", stop);
    window.scrollTo(x, y);
    html.style.scrollBehavior = previous.behavior;
  };
}