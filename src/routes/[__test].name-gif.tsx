import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MockAuthProvider } from "@/components/candy/mock-auth-provider";
import { PostCard } from "@/components/candy/post/PostCard";
import { __devSeedVipMediaAssign } from "@/lib/clone-vip-media";
import type { PostRecord } from "@/lib/app-types";

/** Trang xem thử khung "GIF sau tên" — dữ liệu mẫu cục bộ, không ghi database. */
const GIF =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='20'><rect rx='6' width='40' height='20' fill='#ff4fa3'/><text x='20' y='14' font-size='11' font-family='Arial' font-weight='700' fill='white' text-anchor='middle'>GIF</text></svg>`,
  );

const LONG =
  "Mình mới chuyển về Sài Gòn làm việc, muốn tìm bạn đi cà phê cuối tuần, trò chuyện nhẹ nhàng và tôn trọng nhau. " +
  "Mình thích nhạc acoustic, đọc sách và thỉnh thoảng đi phượt ngắn ngày. Ai hợp thì nhắn tin cho mình nhé, " +
  "mình sẽ trả lời sớm nhất có thể. Đây là đoạn nội dung dài để kiểm tra khả năng đọc trên nền khung nổi bật.";

const prof = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, display_name: name, full_name: name, gender: "female", avatar: null, ...extra }) as any;

const posts: (PostRecord & { _label: string })[] = [
  { _label: "1. Có GIF + có VIP", id: "ng-1", user_id: "u-gif-vip", content: LONG, created_at: "2026-11-02T10:00:00Z", facebook_url: "https://facebook.com/x", zalo_url: "0900000000", profiles: prof("u-gif-vip", "Ngọc Trâm VIP", { vip_level: 3 }) } as any,
  { _label: "2. Có GIF, không VIP", id: "ng-2", user_id: "u-gif", content: "Tối nay ai rảnh đi dạo phố đi bộ không?", created_at: "2026-11-02T09:00:00Z", profiles: prof("u-gif", "Minh Anh", { vip_level: 0 }) } as any,
  { _label: "3. Không GIF", id: "ng-3", user_id: "u-plain", content: "Bài đăng thường, giữ giao diện cũ.", created_at: "2026-11-02T08:00:00Z", profiles: prof("u-plain", "Hoàng Nam", { vip_level: 0 }) } as any,
  { _label: "4. Đã xác minh (VIP) nhưng không GIF", id: "ng-4", user_id: "u-vip", content: "Tài khoản VIP không có GIF — không áp khung.", created_at: "2026-11-02T07:00:00Z", profiles: prof("u-vip", "Thu Hà", { vip_level: 3 }) } as any,
  { _label: "6. Có GIF + VIP, tên rất dài", id: "ng-6", user_id: "u-gif-vip", content: "Kiểm tra tên dài không đè GIF, nhãn VIP hay menu.", created_at: "2026-11-02T05:00:00Z", profiles: prof("u-gif-vip", "Nguyễn Thị Phương Thảo Ngọc Trâm Siêu Dài", { vip_level: 3 }) } as any,
  { _label: "5. Có GIF + VIP, nội dung dài", id: "ng-5", user_id: "u-gif-vip", content: LONG + "\n\n" + LONG, created_at: "2026-11-02T06:00:00Z", profiles: prof("u-gif-vip", "Ngọc Trâm VIP", { vip_level: 3 }) } as any,
];

function Harness() {
  const [qc] = useState(() => {
    __devSeedVipMediaAssign({ "u-gif-vip": { name: [GIF] }, "u-gif": { name: [GIF] } });
    return new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } } });
  });
  return (
    <QueryClientProvider client={qc}>
      <MockAuthProvider>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "12px 0 40px" }}>
          {posts.map(({ _label, ...post }) => (
            <section key={post.id} data-case={post.id}>
              <p style={{ padding: "14px 12px 4px", fontSize: 12, fontWeight: 700, opacity: 0.7 }}>{_label}</p>
              <PostCard post={post as PostRecord} onRefresh={() => {}} onViewProfile={() => {}} feedSurface="home" />
            </section>
          ))}
        </div>
      </MockAuthProvider>
    </QueryClientProvider>
  );
}

export const Route = createFileRoute("/__test/name-gif")({
  beforeLoad: () => { if (!import.meta.env.DEV) throw notFound(); },
  head: () => ({
    meta: [
      { title: "Xem thử khung GIF | Diễn Đàn FWB" },
      { name: "description", content: "Trang xem thử nội bộ khung bài đăng có GIF sau tên." },
      { property: "og:title", content: "Xem thử khung GIF | Diễn Đàn FWB" },
      { property: "og:description", content: "Trang xem thử nội bộ khung bài đăng có GIF sau tên." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Harness,
});
