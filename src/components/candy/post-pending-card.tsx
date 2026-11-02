/** Success-only notice; the existing caller opens it after the post insert resolves. */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function PostPendingCard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => onCloseRef.current(), 6000);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="post-approval-notice" role="status" aria-live="polite" aria-atomic="true">
      Bài Viết Đã Được Gửi Đi Phê Duyệt
    </div>,
    document.body,
  );
}

export default PostPendingCard;
