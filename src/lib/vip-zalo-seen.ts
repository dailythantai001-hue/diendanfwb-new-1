import { useSyncExternalStore } from "react";

export type VipZaloPlan = "vn" | "intl";
const records = new Map<string, ReadonlySet<string>>();
const listeners = new Set<() => void>();
const empty: ReadonlySet<string> = new Set();
const key = (user: string, preview: boolean) => `vip-zalo-seen:v1:${preview ? "preview:" : ""}${user}`;
export const benefitSeenKey = (plan: VipZaloPlan, id: string) => JSON.stringify([plan, id]);

function read(user: string | undefined, preview: boolean): ReadonlySet<string> {
  if (!user || typeof window === "undefined") return empty;
  const storageKey = key(user, preview);
  const cached = records.get(storageKey);
  if (cached) return cached;
  let value: ReadonlySet<string> = empty;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (Array.isArray(raw)) value = new Set(raw.filter((v): v is string => typeof v === "string"));
  } catch { /* Corrupt/blocked storage must not block details. */ }
  records.set(storageKey, value);
  return value;
}

export function markVipZaloSeen(user: string | undefined, plan: VipZaloPlan, id: string, preview = false) {
  if (!user || typeof window === "undefined") return;
  const storageKey = key(user, preview);
  const next = new Set(read(user, preview));
  next.add(benefitSeenKey(plan, id));
  records.set(storageKey, next);
  try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* Keep session fallback. */ }
  listeners.forEach((notify) => notify());
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith("vip-zalo-seen:v1:")) {
      if (event.key) records.delete(event.key); else records.clear();
      listeners.forEach((listener) => listener());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(notify); window.removeEventListener("storage", onStorage); };
};

export function useVipZaloSeen(user: string | undefined, preview = false) {
  const seen = useSyncExternalStore(subscribe, () => read(user, preview), () => empty);
  return {
    hasSeen: (plan: VipZaloPlan, id: string) => seen.has(benefitSeenKey(plan, id)),
    markSeen: (plan: VipZaloPlan, id: string) => markVipZaloSeen(user, plan, id, preview),
  };
}