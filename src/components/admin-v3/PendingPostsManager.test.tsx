import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getSession: vi.fn(), profiles: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: api.getSession }, from: () => ({ select: () => ({ in: api.profiles }) }) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import { PendingPostsManager } from "./PendingPostsManager";
let pending: Array<{ id: string; user_id: string; created_at: string; content: string }>;
const mutations: string[] = [];
let hold: (() => void) | undefined;
let block = false;
beforeEach(() => {
  pending = [1, 2].map(i => ({ id: `p${i}`, user_id: "member", created_at: "2026-10-31T10:00:00Z", content: `Post ${i}` }));
  mutations.length = 0; block = false;
  api.getSession.mockResolvedValue({ data: { session: { access_token: "test" } } });
  api.profiles.mockResolvedValue({ data: [] });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === "POST") {
      const body = JSON.parse(String(init.body)); mutations.push(body.postId);
      if (block) await new Promise<void>(resolve => { hold = resolve; });
      pending = pending.filter(row => row.id !== body.postId);
      return { json: async () => ({ ok: true }) };
    }
    return { json: async () => url.includes("countOnly") ? ({ ok: true, count: pending.length }) : ({ ok: true, rows: [...pending] }) };
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PendingPostsManager /></QueryClientProvider>);
  return client;
}
it("requires confirmation and cancel leaves every pending post unchanged", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false); mount();
  const button = screen.getByRole("button", { name: "Từ chối tất cả" });
  await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
  expect(window.confirm).toHaveBeenCalledOnce(); expect(mutations).toEqual([]); expect(pending).toHaveLength(2);
});
it("blocks repeated clicks and updates the count after every successful approval", async () => {
  const client = mount();
  const button = screen.getByRole("button", { name: "Duyệt tất cả" });
  await waitFor(() => expect(button).not.toBeDisabled());
  block = true; fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(mutations).toEqual(["p1"]));
  expect(screen.getByRole("button", { name: "Từ chối tất cả" })).toBeDisabled();
  block = false; await act(async () => { hold?.(); });
  await waitFor(() => expect(mutations).toEqual(["p1", "p2"]));
  await waitFor(() => expect(client.getQueryData(["admin-pending-post-count"])).toBe(0));
  expect(pending).toHaveLength(0);
});
it("refreshes new arrivals automatically without manual reload", async () => {
  mount(); await screen.findByText("Post 1");
  pending.push({ id: "p3", user_id: "member", content: "New post", created_at: "2026-10-31T11:00:00Z" });
  window.dispatchEvent(new Event("focus"));
  await screen.findByText("New post");
});