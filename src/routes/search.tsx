import { createFileRoute } from "@tanstack/react-router";
import { importedPage } from "@/components/imported-page";
export const Route = createFileRoute("/search")({
  head: () => ({ meta: [
    { title: "Tìm bạn mới — Diễn Đàn FWB" },
    { name: "description", content: "Quét và tìm bạn mới gần bạn trên Diễn Đàn FWB." },
    { property: "og:title", content: "Tìm bạn mới — Diễn Đàn FWB" },
    { property: "og:description", content: "Quét và tìm bạn mới gần bạn trên Diễn Đàn FWB." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: importedPage("Index"),
});
