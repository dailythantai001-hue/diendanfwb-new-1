/**
 * CommonLockedPopup — compatibility adapter to the single VIP ZALO screen.
 *
 * Mọi tính năng khoá (Kết bạn Zalo, Facebook, Xem số điện thoại, Live Móc,
 * Voice Call, Video Call, Chat bị khoá…) đều gọi component này.
 * Content comes exclusively from vip_zalo_v2; legacy props are inert.
 *
 * Full-screen presentation keeps the originating page mounted underneath.
 */
import { VipZaloScreen } from "./vip-zalo-screen";

/** Giữ export cũ để không vỡ call-site đang import. */
export const VIP_UNLOCK_BENEFITS = [
  "Kết bạn Zalo",
  "Xem số Zalo",
  "Voice Call",
  "Video Call",
  "Live Móc",
  "Hỗ trợ Admin",
] as const;

export interface CommonLockedPopupProps {
  open: boolean;
  onClose: () => void;
  /** Tên tính năng bị khoá (chỉ hiển thị 1 dòng nhỏ, không đổi giao diện). */
  featureName?: string;
  /** Các prop cũ chỉ giữ để không vỡ call-site — KHÔNG còn tác dụng ghi đè. */
  variant?: string;
  title?: string;
  /** Tên nhóm/khu vực cho luồng tham gia VIP Zalo. */
  groupName?: string;
  message?: string;
  contactLink?: string | null;
  /** Class bổ sung cho popup card. Dùng để scope style riêng (vd: Album). */
  className?: string;
  /** Tiêu đề cố định cho riêng ngữ cảnh gọi (vd: Album VIP) — mặc định dùng tiêu đề Admin. */
  forceTitle?: string;
  /** Preserve a legacy gate's explanation and action without changing Admin config. */
  gate?: { title: string; message: string; actionLabel: string; onAction: () => void };
}

/** Compatibility only: eligibility remains in callers; old CTA callbacks never grant access. */
export function CommonLockedPopup({ open, onClose }: CommonLockedPopupProps) {
  return <VipZaloScreen open={open} onClose={onClose} />;
}

export default CommonLockedPopup;
