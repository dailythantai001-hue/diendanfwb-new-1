import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ token: z.string().min(10), postId: z.string().min(1).max(100) });

/** Admin xóa bài viết: server tự xác thực token và kiểm tra profiles.is_admin === true. */
export const adminDeletePostFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const S = await import("@/lib/admin-post-delete.server");
    return S.adminDeletePost(data.token, data.postId);
  });
