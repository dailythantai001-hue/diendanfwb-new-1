import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * requireSb3Session — cổng chặn đăng bài:
 * - phiên #1 tạm thời chưa đọc được → chờ khôi phục thay vì báo hết hạn ngay;
 * - cầu phiên #3 chưa sẵn sàng → chờ ensureChatSession hoàn tất (tự thử lại);
 * - sau khi cầu phiên xong, UID #3 phải khớp #1 mới cho đăng bài.
 */

const h = vi.hoisted(() => {
  const state = {
    primarySession: true,
    refreshCalls: 0,
    refreshRestores: true,
    ensureCalls: 0,
    ensureOk: false,
    sb3Uid: null as string | null,
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
      refreshSession: vi.fn(async () => {
        state.refreshCalls++;
        if (state.refreshRestores) {
          state.primarySession = true;
          return { data: { session: { user: { id: "u1" }, access_token: "t1b" } }, error: null };
        }
        return { data: {}, error: { message: "invalid grant" } };
      }),
    },
  };
  const sb3 = {
    auth: { getSession: vi.fn(async () => ({ data: { session: state.sb3Uid ? { user: { id: state.sb3Uid } } : null } })) },
  };
  return { state, primary, sb3 };
});

vi.mock("@/lib/db/router", () => ({ supabase: h.primary, db3: () => h.sb3 }));
vi.mock("@/lib/chat-session", () => ({
  ensureChatSession: vi.fn(async () => {
    h.state.ensureCalls++;
    if (h.state.ensureOk && !h.state.sb3Uid) h.state.sb3Uid = "u1";
    return h.state.ensureOk;
  }),
}));

import { PostSlotError, SB3_SESSION_MESSAGE, requireSb3Session } from "./post-quota";

beforeEach(() => {
  Object.assign(h.state, {
    primarySession: true,
    refreshCalls: 0,
    refreshRestores: true,
    ensureCalls: 0,
    ensureOk: false,
    sb3Uid: null,
  });
  // Khôi phục implementation gốc — các test trước có thể mockResolvedValue/mockOnce.
  h.primary.auth.getSession.mockReset();
  h.primary.auth.getSession.mockImplementation(async () => ({
    data: {
      session: h.state.primarySession
        ? { user: { id: "u1" }, access_token: "t1" }
        : null,
    },
  }));
  h.primary.auth.refreshSession.mockReset();
  h.primary.auth.refreshSession.mockImplementation(async () => {
    h.state.refreshCalls++;
    if (h.state.refreshRestores) {
      h.state.primarySession = true;
      return { data: { session: { user: { id: "u1" }, access_token: "t1b" } }, error: null };
    }
    return { data: {}, error: { message: "invalid grant" } };
  });
});

describe("requireSb3Session — chờ phiên sẵn sàng thay vì báo lỗi ngay", () => {
  it("cầu phiên thành công → cho đăng bài", async () => {
    h.state.ensureOk = true;
    await expect(requireSb3Session()).resolves.toBeUndefined();
  });

  it("lần ensure đầu thất bại → refresh phiên #1 rồi thử lại, không ném SB3_SESSION_MESSAGE", async () => {
    h.state.ensureOk = false;
    // refresh xong thì ensure thành công (mô phỏng phiên đang được khôi phục)
    h.primary.auth.refreshSession.mockImplementation(async () => {
      h.state.ensureOk = true;
      h.state.refreshCalls++;
      return { data: { session: { user: { id: "u1" }, access_token: "t1b" } }, error: null };
    });
    await expect(requireSb3Session()).resolves.toBeUndefined();
    expect(h.state.refreshCalls).toBe(1);
  });

  it("phiên #1 chưa đọc được ngay → chờ khôi phục rồi tiếp tục", async () => {
    h.state.ensureOk = true;
    // getSession đầu tiên trống (storage khôi phục xong ở lần đọc sau)
    h.primary.auth.getSession.mockImplementationOnce(async () => ({ data: { session: null } }));
    await expect(requireSb3Session()).resolves.toBeUndefined();
  });

  it("không thể khôi phục phiên #1 → báo 'hết hạn, đăng nhập lại' (không phải SB3_SESSION_MESSAGE)", async () => {
    h.state.primarySession = false;
    h.state.refreshRestores = false;
    h.primary.auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(requireSb3Session()).rejects.toThrow(/đăng nhập lại/);
  });

  it("refresh phiên #1 xong vẫn không cấp được phiên #3 → đúng SB3_SESSION_MESSAGE", async () => {
    // refresh thành công (mặc định) nhưng ensureChatSession vẫn false ở mọi lần thử
    await expect(requireSb3Session()).rejects.toThrow(SB3_SESSION_MESSAGE);
    await expect(requireSb3Session()).rejects.toBeInstanceOf(PostSlotError);
    expect(h.state.ensureCalls).toBeGreaterThanOrEqual(2);
  });

  it("UID #3 lệch UID #1 (chưa khớp) → chờ đọc lại; vẫn lệch thì chặn", async () => {
    h.state.ensureOk = true;
    h.state.sb3Uid = "other";
    await expect(requireSb3Session()).rejects.toThrow(SB3_SESSION_MESSAGE);
    // giờ phiên #3 đúng UID → cho qua
    h.state.sb3Uid = "u1";
    await expect(requireSb3Session()).resolves.toBeUndefined();
  });
});
