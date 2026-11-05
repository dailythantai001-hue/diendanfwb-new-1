/**
 * 🔗 Cầu nối phiên đăng nhập: Supabase #1 (auth chính) → Supabase #3 (chat/feed/logs).
 *
 * - Không đổi UI, không đổi logic Chat: chỉ gắn session thật của #3 vào client `logs`
 *   để `auth.uid()` hoạt động trên #3 (chuẩn bị cho bước siết RLS sau này).
 * - Nếu cầu nối đang được thiết lập / phiên #1 đang được khôi phục, các lời gọi
 *   chờ hoàn tất (tối đa `attempts` lần, cách nhau 700ms) thay vì báo lỗi ngay.
 * - Mọi lỗi đều nuốt im lặng: phiên #1 và chat hiện tại (anon bridge) không bị ảnh hưởng.
 */
import { db3, supabase } from "@/lib/db/router";
import { grantChatSessionFn } from "@/lib/chat-session.functions";

let inflight: Promise<boolean> | null = null;
let lastOkUserId: string | null = null;

const RETRY_DELAY_MS = 700;

async function currentSb3UserId(): Promise<string | null> {
  try {
    const { data } = await db3().auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function run(uid: string, accessToken: string): Promise<boolean> {
  try {
    const already = await currentSb3UserId();
    if (already === uid) {
      lastOkUserId = uid;
      return true;
    }
    if (already && already !== uid) {
      await db3().auth.signOut().catch(() => {});
    }

    const grant = await grantChatSessionFn({ data: { accessToken } });
    if (!grant?.ok || !grant.tokenHash) {
      console.warn("[chat-session] không cấp được phiên #3:", grant?.reason);
      return false;
    }

    const { data, error } = await db3().auth.verifyOtp({
      type: "magiclink",
      token_hash: grant.tokenHash,
    });
    if (error || !data.session) {
      console.warn("[chat-session] verifyOtp #3 thất bại:", error?.message);
      return false;
    }

    try {
      (db3() as any).realtime?.setAuth?.(data.session.access_token);
    } catch { /* ignore */ }

    lastOkUserId = uid;
    return true;
  } catch (err) {
    console.warn("[chat-session] lỗi ngoài dự kiến:", err);
    return false;
  }
}

async function attemptOnce(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.user?.id || !session.access_token) return false;
    if (lastOkUserId === session.user.id && (await currentSb3UserId()) === session.user.id) {
      return true;
    }
    return await run(session.user.id, session.access_token);
  } catch {
    return false;
  }
}

/**
 * Đảm bảo client #3 có session của đúng user #1 đang đăng nhập.
 *
 * Các lời gọi song song được gộp chung 1 lần cấp phiên. Một lần thử thất bại
 * KHÔNG bị tái sử dụng: attempt kết thúc là được giải phóng ngay, lần gọi sau
 * (kể cả retry sau khi phiên #1 refresh) luôn bắt đầu một lần cấp mới.
 */
export async function ensureChatSession(attempts = 3): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const max = Math.max(1, attempts);
  for (let i = 0; i < max; i++) {
    if (!inflight) {
      inflight = attemptOnce().finally(() => {
        // Giải phóng NGAY khi attempt kết thúc (kể cả thất bại) để caller retry
        // nhận một attempt mới, không tái dùng kết quả false đã cũ.
        inflight = null;
      });
    }
    const pending = inflight;
    const ok = await pending;
    if (ok) return true;
    if (i < max - 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  return false;
}

/** Đăng xuất phiên #3 (gọi kèm khi logout #1). */
export async function clearChatSession(): Promise<void> {
  lastOkUserId = null;
  try {
    await db3().auth.signOut();
  } catch { /* ignore */ }
}
