import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kiểm thử luồng "Phiên đăng nhập chưa sẵn sàng để đăng bài":
 * ensureChatSession phải chờ/thử lại khi cầu phiên #1 → #3 đang được thiết lập,
 * và một lần thử thất bại KHÔNG được tái sử dụng ở lần gọi sau (lỗi inflight cũ).
 */

const h = vi.hoisted(() => {
  const state = {
    primarySession: true,
    grantCalls: 0,
    grantOk: true,
    sb3Uid: null as string | null,
    verifyFails: 0,
  };
  const primary = {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: state.primarySession
            ? { user: { id: "u1" }, access_token: "t1" }
            : null,
        },
      })),
    },
  };
  const sb3 = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: state.sb3Uid ? { user: { id: state.sb3Uid } } : null },
      })),
      signOut: vi.fn(async () => ({})),
      verifyOtp: vi.fn(async (args: { token_hash?: string }) => {
        if (state.verifyFails > 0 && state.grantCalls <= state.verifyFails) {
          return { data: {}, error: { message: "otp failed" } };
        }
        state.sb3Uid = "u1";
        return { data: { session: { user: { id: "u1" }, access_token: "t3" } }, error: null };
      }),
    },
    realtime: { setAuth: vi.fn() },
  };
  return { state, primary, sb3 };
});

vi.mock("@/lib/db/router", () => ({ supabase: h.primary, db3: () => h.sb3 }));
vi.mock("@/lib/chat-session.functions", () => ({
  grantChatSessionFn: vi.fn(async () => {
    h.state.grantCalls++;
    return h.state.grantOk ? { ok: true, tokenHash: "hash" } : { ok: false, reason: "denied" };
  }),
}));

import { clearChatSession, ensureChatSession } from "./chat-session";

beforeEach(async () => {
  vi.useRealTimers();
  Object.assign(h.state, { primarySession: true, grantCalls: 0, grantOk: true, sb3Uid: null, verifyFails: 0 });
  h.primary.auth.getSession.mockClear();
  h.sb3.auth.getSession.mockClear();
  h.sb3.auth.verifyOtp.mockClear();
  await clearChatSession();
});

describe("ensureChatSession — chờ phiên sẵn sàng khi đăng bài", () => {
  it("cấp phiên #3 thành công lần đầu", async () => {
    expect(await ensureChatSession()).toBe(true);
    expect(h.state.sb3Uid).toBe("u1");
    expect(h.state.grantCalls).toBe(1);
  });

  it("verifyOtp thất bại tạm thời → thử lại rồi thành công (không báo lỗi ngay)", async () => {
    h.state.verifyFails = 2; // 2 attempt đầu verifyOtp lỗi, attempt 3 thành công
    expect(await ensureChatSession()).toBe(true);
    expect(h.state.grantCalls).toBe(3);
    expect(h.state.sb3Uid).toBe("u1");
  });

  it("lần thử thất bại KHÔNG bị tái sử dụng: gọi lại ngay lập запуск attempt mới", async () => {
    h.state.grantOk = false;
    expect(await ensureChatSession(1)).toBe(false);
    const callsAfterFirst = h.state.grantCalls;
    h.state.grantOk = true;
    expect(await ensureChatSession(1)).toBe(true);
    expect(h.state.grantCalls).toBeGreaterThan(callsAfterFirst);
    expect(h.state.sb3Uid).toBe("u1");
  });

  it("các lời gọi song song được gộp chung một lần cấp phiên", async () => {
    const [a, b, c] = await Promise.all([ensureChatSession(), ensureChatSession(), ensureChatSession()]);
    expect(a && b && c).toBe(true);
    expect(h.state.grantCalls).toBe(1);
  });

  it("không có phiên #1 (đang khôi phục) → trả false, không gọi grant", async () => {
    h.state.primarySession = false;
    expect(await ensureChatSession(1)).toBe(false);
    expect(h.state.grantCalls).toBe(0);
  });
});
