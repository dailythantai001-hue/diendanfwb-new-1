import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type PendingPost = {
  id: string; user_id: string; content: string | null; image_urls: string[] | null;
  image_url: string | null; created_at: string;
};
export const pendingCountKey = ["admin-pending-post-count"] as const;

export async function reviewRequest(body?: { postId: string; action: "approve" | "reject" }, query = "") {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Chưa đăng nhập");
  const response = await fetch(`/api/public/admin-review-post${query}`, {
    method: body ? "POST" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return response.json() as Promise<{ ok: boolean; rows?: PendingPost[]; count?: number; message?: string; code?: string; cleanupFailed?: number }>;
}

export const pendingCountOptions = queryOptions({
  queryKey: pendingCountKey,
  queryFn: async () => {
    const result = await reviewRequest(undefined, "?countOnly=1");
    if (!result.ok || typeof result.count !== "number") throw new Error(result.message || "Không tải được số bài chờ duyệt");
    return result.count;
  },
  refetchInterval: 10000, refetchOnWindowFocus: true,
});
export function usePendingPostCount() { return useQuery(pendingCountOptions); }

/** Freeze IDs before mutations: never stop at the first 100 or include subsequent arrivals. */
export async function loadAllPending(): Promise<PendingPost[]> {
  const snapshot = new Map<string, PendingPost>();
  let cursor = "";
  const cutoff = new Date().toISOString();
  while (true) {
    const query = new URLSearchParams({ cutoff });
    if (cursor) query.set("after", cursor);
    const result = await reviewRequest(undefined, `?${query}`);
    if (!result.ok) throw new Error(result.message || "Không tải được bài chờ duyệt");
    const page = result.rows || [];
    for (const post of page) snapshot.set(post.id, post);
    if (page.length < 100) return [...snapshot.values()];
    const last = page.at(-1);
    if (!last || last.id === cursor) throw new Error("Không tải được toàn bộ hàng chờ");
    cursor = last.id;
  }
}

export async function reviewPendingSnapshot(ids: string[], action: "approve" | "reject", onProcessed: (id: string) => void) {
  let succeeded = 0, failed = 0, cleanupFailed = 0;
  for (const id of new Set(ids)) {
    try {
      const result = await reviewRequest({ postId: id, action });
      if (result.ok || result.code === "NOT_PENDING") onProcessed(id);
      if (result.ok) { succeeded++; cleanupFailed += result.cleanupFailed || 0; }
      else if (result.code !== "NOT_PENDING") failed++;
    } catch { failed++; }
  }
  return { succeeded, failed, cleanupFailed };
}