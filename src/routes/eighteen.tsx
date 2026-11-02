import { createFileRoute, redirect } from "@tanstack/react-router";
// Trang Code cũ đã bị gỡ bỏ — chuyển hướng vĩnh viễn sang Tìm kiếm.
export const Route = createFileRoute("/eighteen")({
  beforeLoad: () => {
    throw redirect({ to: "/search", replace: true, statusCode: 301 });
  },
});
