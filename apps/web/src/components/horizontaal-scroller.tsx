"use client";
// Brede tabel horizontaal scrollen: scrollbalk onder (native), een gespiegelde scrollbalk boven, en slepen met de
// ingedrukte linkermuisknop. Na echt slepen (meer dan een paar pixels) wordt de klik eronder ingeslikt, zodat je niet
// per ongeluk een woning opent; een gewone klik op een link blijft werken.
import { useEffect, useRef, useState } from "react";

const SLEEPDREMPEL = 5;

export function HorizontaalScroller({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const boven = useRef<HTMLDivElement>(null);
  const onder = useRef<HTMLDivElement>(null);
  const [breedte, setBreedte] = useState({ inhoud: 0, venster: 0 });
  const [sleept, setSleept] = useState(false);
  const sleep = useRef<{ startX: number; startScroll: number; verplaatst: boolean } | null>(null);

  useEffect(() => {
    const el = onder.current;
    if (!el) return;
    const meet = () => setBreedte({ inhoud: el.scrollWidth, venster: el.clientWidth });
    meet();
    const waarnemer = new ResizeObserver(meet);
    waarnemer.observe(el);
    if (el.firstElementChild) waarnemer.observe(el.firstElementChild);
    return () => waarnemer.disconnect();
  }, []);

  const spiegel = (van: HTMLDivElement | null, naar: HTMLDivElement | null) => {
    if (van && naar && naar.scrollLeft !== van.scrollLeft) naar.scrollLeft = van.scrollLeft;
  };

  const opPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType !== "mouse" || !onder.current) return;
    sleep.current = { startX: e.clientX, startScroll: onder.current.scrollLeft, verplaatst: false };
  };

  const opPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = sleep.current;
    const el = onder.current;
    if (!s || !el) return;
    const dx = e.clientX - s.startX;
    if (!s.verplaatst) {
      if (Math.abs(dx) < SLEEPDREMPEL) return;
      s.verplaatst = true;
      setSleept(true);
      el.setPointerCapture(e.pointerId);
      window.getSelection()?.removeAllRanges();
    }
    el.scrollLeft = s.startScroll - dx;
  };

  const stopSlepen = (e: React.PointerEvent<HTMLDivElement>) => {
    if (onder.current?.hasPointerCapture(e.pointerId)) onder.current.releasePointerCapture(e.pointerId);
    setSleept(false);
    // sleep.current blijft tot na de click staan, zodat opClickCapture weet of er gesleept is.
    setTimeout(() => (sleep.current = null), 0);
  };

  const opClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (sleep.current?.verplaatst) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const scrolbaar = breedte.inhoud > breedte.venster;

  return (
    <div className={className}>
      {scrolbaar && (
        <div ref={boven} aria-hidden className="overflow-x-auto overflow-y-hidden" onScroll={() => spiegel(boven.current, onder.current)}>
          <div style={{ width: breedte.inhoud, height: 1 }} />
        </div>
      )}
      <div
        ref={onder}
        className={`overflow-x-auto ${scrolbaar ? (sleept ? "cursor-grabbing select-none" : "cursor-grab") : ""}`}
        onScroll={() => spiegel(onder.current, boven.current)}
        onPointerDown={scrolbaar ? opPointerDown : undefined}
        onPointerMove={scrolbaar ? opPointerMove : undefined}
        onPointerUp={stopSlepen}
        onPointerCancel={stopSlepen}
        onClickCapture={opClickCapture}
        onDragStart={(e) => scrolbaar && e.preventDefault()}
      >
        {children}
      </div>
    </div>
  );
}
