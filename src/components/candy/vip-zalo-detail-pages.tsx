import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDetailImage, type VipZaloSlide } from "@/lib/vip-zalo-details";

export function VipZaloDetailContent({ tab, renderText = (v) => v }: { tab: VipZaloSlide; renderText?: (v: string) => string }) {
  return <>
    {tab.image && isDetailImage(tab.image) ? <div className="vzs-detail-banner"><img src={tab.image} alt="" draggable={false} decoding="async" /></div> : null}
    <div className="vzs-detail-copy">
      {tab.title ? <h5>{renderText(tab.title)}</h5> : null}
      {tab.body ? <p>{renderText(tab.body)}</p> : null}
      <div className="vzs-detail-rows">
        {(tab.rows || []).map((row) => <div className="vzs-detail-row" key={row.id}>
          {row.icon && isDetailImage(row.icon) ? <img className="vzs-detail-icon" src={row.icon} alt="" draggable={false} loading="lazy" /> : null}
          <div className="vzs-detail-row-copy">
            {row.title ? <h6>{renderText(row.title)}</h6> : null}
            {row.body ? <p>{renderText(row.body)}</p> : null}
          </div>
        </div>)}
      </div>
    </div>
  </>;
}

export function VipZaloDetailPages({ tabs, renderText }: { tabs: VipZaloSlide[]; renderText: (v: string) => string }) {
  const [viewport, api] = useEmblaCarousel({ loop: false, watchDrag: true, duration: 25 });
  const [selected, setSelected] = useState(0);
  const update = useCallback(() => setSelected(api?.selectedScrollSnap() ?? 0), [api]);
  useEffect(() => {
    if (!api) return;
    update();
    api.on("select", update).on("reInit", update);
    return () => { api.off("select", update).off("reInit", update); };
  }, [api, update]);
  useEffect(() => {
    api?.reInit();
    api?.scrollTo(Math.min(selected, Math.max(0, tabs.length - 1)), true);
  }, [api, tabs.length]);

  if (!tabs.length) return <p className="vzs-empty">Chưa có nội dung.</p>;
  return <>
    <div ref={viewport} className="vzs-detail-viewport" data-scroll-lock-ignore>
      <div className="vzs-track">
        {tabs.map((tab, i) => <article key={tab.id || i} className="vzs-slide" aria-label={`${i + 1}/${tabs.length}`} data-scroll-lock-ignore tabIndex={selected === i ? 0 : -1} aria-hidden={selected !== i}>
          <VipZaloDetailContent tab={tab} renderText={renderText} />
        </article>)}
      </div>
    </div>
    {tabs.length > 1 ? <nav className="vzs-detail-nav" aria-label="Các trang quyền lợi">
      <Button variant="ghost" size="icon" aria-label="Trang trước" disabled={selected === 0} onClick={() => api?.scrollPrev()}><ChevronLeft /></Button>
      <div className="vzs-detail-position">
        <div className="vzs-detail-indicators">
          <div className="vzs-dots">{tabs.map((tab, i) => <Button key={tab.id || i} variant="ghost" size="unstyled" aria-label={`Mục ${i + 1}`} aria-current={i === selected ? "page" : undefined} data-active={i === selected} onClick={() => api?.scrollTo(i)}><span /></Button>)}</div>
          <span className="vzs-detail-counter" aria-live="polite">{selected + 1}/{tabs.length}</span>
          <span className="vzs-swipe-cue" data-direction={selected < tabs.length - 1 ? "next" : "previous"} aria-hidden="true">
            {selected < tabs.length - 1 ? <ChevronRight /> : <ChevronLeft />}
          </span>
        </div>
        <span className="vzs-swipe-hint">{selected < tabs.length - 1 ? "Vuốt để xem tiếp" : "Vuốt ngược để xem lại"}</span>
      </div>
      <Button variant="ghost" size="icon" aria-label="Trang tiếp theo" disabled={selected === tabs.length - 1} onClick={() => api?.scrollNext()}><ChevronRight /></Button>
    </nav> : null}
  </>;
}