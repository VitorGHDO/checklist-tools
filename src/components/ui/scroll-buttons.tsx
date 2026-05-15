"use client";

import { useState, useEffect } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function ScrollButtons({ containerRef }: Props) {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  useEffect(() => {
    function check() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCanScrollUp(rect.top < -20);
      setCanScrollDown(rect.bottom > window.innerHeight + 20);
    }
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [containerRef]);

  const scroll = (dir: "up" | "down") => {
    const el = containerRef.current;
    if (!el) return;
    const top =
      dir === "up"
        ? el.offsetTop - 80
        : el.offsetTop + el.offsetHeight - window.innerHeight + 80;
    window.scrollTo({ top, behavior: "smooth" });
  };

  if (!canScrollUp && !canScrollDown) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <button
        onClick={() => scroll("up")}
        className={`w-10 h-10 rounded-full bg-white border border-[#e0e0e0] shadow-md flex items-center justify-center text-[#80808F] hover:text-[#173872] hover:border-[#173872]/40 hover:shadow-lg transition-all ${
          canScrollUp ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        title="Ir ao topo"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
      <button
        onClick={() => scroll("down")}
        className={`w-10 h-10 rounded-full bg-white border border-[#e0e0e0] shadow-md flex items-center justify-center text-[#80808F] hover:text-[#173872] hover:border-[#173872]/40 hover:shadow-lg transition-all ${
          canScrollDown ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        title="Ir ao fim"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
  );
}
