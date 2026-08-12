"use client";

import { useEffect, useRef } from "react";
import { SheetCanvas, type DragRef, type GroupDragRef, type HeaderDragRef } from "./sheet-canvas";
import type { DesignerPage, EditorState, Marker } from "@/lib/designer/types";

interface Props {
  st: EditorState;
  /** Folhas do contexto atual (docType + modo), na ordem. Todas são renderizadas. */
  pages: DesignerPage[];
  tick: number; // muda a cada rerender do editor → dispara o redraw das folhas
  rerender: () => void;
  commit: () => void; // rerender + bump geomTick (ressincroniza inputs de geometria)
  nextLabel: () => string;
  onImageFile: (file: File, page: DesignerPage) => void;
  onSelectPage: (pageId: string) => void;
  /** Soltou um grupo arrastado sobre uma folha: reancora e reacomoda o fluxo. */
  onGroupDrop: (groupId: string, fromPageId: string, toPageId: string, yMm: number) => void;
}

/**
 * Palco com as folhas empilhadas em rolagem contínua — ver a folha 1 e a 2 juntas é o
 * que permite acertar as quebras de grupo entre elas. A folha "atual" é só a que a
 * sidebar edita; todas continuam interativas.
 */
export function CanvasStage({ st, pages, tick, rerender, commit, nextLabel, onImageFile, onSelectPage, onGroupDrop }: Props) {
  const dragRef = useRef<DragRef | null>(null);
  const headerDragRef = useRef<HeaderDragRef | null>(null);
  const groupDragRef = useRef<GroupDragRef | null>(null);
  const redraws = useRef<Record<string, () => void>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sheetRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function registerRedraw(pageId: string, fn: (() => void) | null) {
    if (fn) redraws.current[pageId] = fn;
    else delete redraws.current[pageId];
  }

  // mouseup + teclado ficam aqui: um único listener para todas as folhas
  useEffect(() => {
    function onUp() {
      // arraste de grupo solto FORA de um canvas: cancela reacomodando o fluxo atual
      const wasGroup = groupDragRef.current;
      const was = dragRef.current || headerDragRef.current;
      dragRef.current = null;
      headerDragRef.current = null;
      groupDragRef.current = null;
      if (wasGroup) onGroupDrop(wasGroup.groupId, wasGroup.pageId, wasGroup.pageId, -1);
      else if (was) commit();
    }
    function onKey(e: KeyboardEvent) {
      if (!st.selectedMarkerId) return;
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // o marcador selecionado pode estar em qualquer folha empilhada
      let found: Marker | undefined;
      let host: DesignerPage | undefined;
      for (const p of pages) {
        for (const g of p.groups) {
          const m = g.markers.find((x) => x.id === st.selectedMarkerId);
          if (m) {
            found = m;
            host = p;
            break;
          }
        }
        if (found) break;
      }
      if (!found || !host) return;
      const m = found;
      const stepMm = e.shiftKey ? 1 : 0.1;
      const stepFx = stepMm / host.widthMm;
      const stepFy = stepMm / host.heightMm;
      if (e.key === "ArrowUp") m.fy = Math.max(0, m.fy - stepFy);
      else if (e.key === "ArrowDown") m.fy = Math.min(1, m.fy + stepFy);
      else if (e.key === "ArrowLeft") m.fx = Math.max(0, (m.fx ?? 0) - stepFx);
      else if (e.key === "ArrowRight") m.fx = Math.min(1, (m.fx ?? 0) + stepFx);
      else if (e.key === "Delete" || e.key === "Backspace") {
        for (const g of host.groups) g.markers = g.markers.filter((x) => x.id !== m.id);
        st.selectedMarkerId = null;
        st.selectedGroupId = null;
        e.preventDefault();
        rerender();
        return;
      } else return;
      e.preventDefault();
      rerender();
    }
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  });

  // rola até a folha pedida pelas abas / ações da sidebar
  useEffect(() => {
    if (!st.scrollToPageId) return;
    const el = sheetRefs.current[st.scrollToPageId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.scrollTick]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto border-t border-[#e8e8e8] bg-[#d7d7d7] px-6 py-5">
      <div className="mx-auto w-full max-w-[860px] flex flex-col gap-7">
        {pages.map((p) => (
          <div key={p.id} ref={(el) => void (sheetRefs.current[p.id] = el)} className="scroll-mt-4">
            <SheetCanvas
              st={st}
              page={p}
              tick={tick}
              rerender={rerender}
              commit={commit}
              nextLabel={nextLabel}
              onImageFile={onImageFile}
              dragRef={dragRef}
              headerDragRef={headerDragRef}
              isCurrent={p.id === st.currentPageId}
              onActivate={() => onSelectPage(p.id)}
              groupDragRef={groupDragRef}
              onGroupDrop={onGroupDrop}
              registerRedraw={registerRedraw}
              scrollRoot={scrollRef}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
