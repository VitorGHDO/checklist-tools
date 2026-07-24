"use client";

import { useEffect, useRef } from "react";
import { FileImage } from "lucide-react";
import { DropZone } from "@/components/ui/drop-zone";
import { MARKER_R_FRAC } from "@/lib/designer/constants";
import {
  clamp01,
  makeMarker,
  reflowGroupChainY,
  resolveBackgroundPage,
  syncColumnsToAll,
  syncGroupStartIfFirst,
} from "@/lib/designer/geometry";
import { getFieldPoints, setFieldPointXY } from "@/lib/designer/model";
import { parseQueueNames } from "@/lib/designer/migration-parse";
import { drawRoteiroGroupMarkers } from "@/lib/designer/draw/roteiro";
import { drawRevisaoGroupMarkers } from "@/lib/designer/draw/revisao";
import { drawPosvendaDiffGroupMarkers, drawPosvendaSameGroupMarkers } from "@/lib/designer/draw/posvenda";
import { drawHeaderFields } from "@/lib/designer/draw/header";
import { drawGroupYStartPreview } from "@/lib/designer/draw/preview";
import type { DesignerGroup, DesignerPage, EditorState, HeaderField, Marker } from "@/lib/designer/types";

interface Props {
  st: EditorState;
  page: DesignerPage;
  tick: number; // muda a cada rerender do editor → dispara o redraw abaixo
  rerender: () => void;
  commit: () => void; // rerender + bump geomTick (ressincroniza inputs de geometria)
  nextLabel: () => string;
  onImageFile: (file: File) => void;
}

export function CanvasStage({ st, page, tick, rerender, commit, nextLabel, onImageFile }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgCache = useRef<Record<string, HTMLImageElement>>({});
  const dragState = useRef<{ markerId: string; groupId: string } | null>(null);
  const headerDrag = useRef<{ fieldId: string; pointKey: string } | null>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const bgPage = resolveBackgroundPage(st.pages, page);
  const hasImage = !!bgPage.imageSrc;

  // ─── geometria de ponteiro ────────────────────────────────────────────────
  function canvasPos(evt: React.MouseEvent): { x: number; y: number } {
    const cv = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    const scaleX = cv.width / rect.width;
    const scaleY = cv.height / rect.height;
    return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
  }

  function hitMarker(px: number, py: number): { group: DesignerGroup; marker: Marker } | null {
    const cv = canvasRef.current!;
    const rAnchor = cv.width * MARKER_R_FRAC * 1.6;
    const rSymbol = cv.width * MARKER_R_FRAC * 3.4 * 1.25;
    let best: { group: DesignerGroup; marker: Marker } | null = null;
    let bestDist = Infinity;
    for (let gi = page.groups.length - 1; gi >= 0; gi--) {
      const group = page.groups[gi];
      const isRevisao = group.docType === "revisao";
      const isPosvendaDiff = group.docType === "posvenda" && group.posvendaXMode === "diff";
      for (let i = group.markers.length - 1; i >= 0; i--) {
        const m = group.markers[i];
        let mxMm: number;
        if (isRevisao) mxMm = group.colX2 !== undefined ? group.colX2 : 0;
        else if (isPosvendaDiff) {
          const opts = group.posvendaOpts || [];
          mxMm = opts.length ? (group.optX ? group.optX[opts[Math.floor(opts.length / 2)].valor] : 0) || 0 : 0;
        } else mxMm = (m.fx ?? 0) * page.widthMm;
        const mx = isRevisao || isPosvendaDiff ? (mxMm / page.widthMm) * cv.width : (m.fx ?? 0) * cv.width;
        const my = m.fy * cv.height;
        const dAnchor = Math.hypot(mx - px, my - py);
        if (dAnchor <= rAnchor && dAnchor < bestDist) {
          bestDist = dAnchor;
          best = { group, marker: m };
        }
        if (isRevisao || isPosvendaDiff) {
          const dRow = Math.hypot(mx - px, my - py);
          if (dRow <= rSymbol * 2.2 && dRow < bestDist) {
            bestDist = dRow;
            best = { group, marker: m };
          }
        } else {
          const relOffMm = (page.typeOffsets && page.typeOffsets[(m.type as "check" | "x" | "na") || "check"]) || 0;
          const relOffPx = (relOffMm / page.heightMm) * cv.height;
          const dSymbol = Math.hypot(mx - px, my + relOffPx - py);
          if (dSymbol <= rSymbol && dSymbol < bestDist) {
            bestDist = dSymbol;
            best = { group, marker: m };
          }
        }
      }
    }
    return best;
  }

  function nextQueueName(group: DesignerGroup): string | null {
    const names = parseQueueNames(group.queue);
    const used = new Set(group.markers.map((m) => m.label));
    for (const n of names) if (!used.has(n)) return n;
    return null;
  }

  function hitHeaderPoint(px: number, py: number): { field: HeaderField; pointKey: string } | null {
    const cv = canvasRef.current!;
    const r = cv.width * MARKER_R_FRAC * 1.8;
    let best: { field: HeaderField; pointKey: string } | null = null;
    let bestDist = Infinity;
    for (let fi = page.headerFields.length - 1; fi >= 0; fi--) {
      const field = page.headerFields[fi];
      const pts = getFieldPoints(field);
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        const x = (p.x / page.widthMm) * cv.width;
        const y = (p.y / page.heightMm) * cv.height;
        const d = Math.hypot(x - px, y - py);
        if (d <= r && d < bestDist) {
          bestDist = d;
          best = { field, pointKey: p.key };
        }
      }
    }
    return best;
  }

  // ─── render ────────────────────────────────────────────────────────────────
  function drawMarkers(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement) {
    const r = cv.width * MARKER_R_FRAC;
    if (page.kind === "header") {
      drawHeaderFields(ctx, cv, page, st.selectedHeaderFieldId, r);
      return;
    }
    const symSize = r * 3.4 * (page.markScale === undefined ? 1 : page.markScale);
    const activeGroup = page.groups.find((g) => g.id === page.activeGroupId);
    if (activeGroup) drawGroupYStartPreview(ctx, cv, page, activeGroup, r);
    page.groups.forEach((group) => {
      if (group.docType === "revisao") {
        drawRevisaoGroupMarkers(ctx, cv, page, group, r, st.selectedMarkerId);
      } else if (group.docType === "posvenda" && group.posvendaXMode === "diff") {
        drawPosvendaDiffGroupMarkers(ctx, cv, page, group, r, st.selectedMarkerId);
      } else if (group.docType === "posvenda") {
        drawPosvendaSameGroupMarkers(ctx, cv, page, group, r, st.selectedMarkerId);
      } else {
        drawRoteiroGroupMarkers(ctx, cv, page, group, r, symSize, st.selectedMarkerId);
      }
    });
  }

  function redraw() {
    const cv = canvasRef.current;
    if (!cv) return;
    const bg = resolveBackgroundPage(st.pages, page);
    if (!bg.imageSrc) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const cap = 1600;
    let w = bg.naturalW;
    let h = bg.naturalH;
    if (w > cap) {
      h = h * (cap / w);
      w = cap;
    }
    cv.width = w;
    cv.height = h;

    let img = imgCache.current[bg.id];
    if (!img || img.src !== bg.imageSrc) {
      img = new Image();
      img.src = bg.imageSrc;
      imgCache.current[bg.id] = img;
      img.onload = () => redraw();
      if (!img.complete) return;
    }
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    drawMarkers(ctx, cv);
  }

  // redesenha quando o editor re-renderiza (tick) ou troca de página
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, page.id]);

  // ─── interações ──────────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    const pos = canvasPos(e);
    downPos.current = pos;
    moved.current = false;
    if (page.kind === "header") {
      const hit = hitHeaderPoint(pos.x, pos.y);
      if (hit) {
        headerDrag.current = { fieldId: hit.field.id, pointKey: hit.pointKey };
        st.selectedHeaderFieldId = hit.field.id;
        rerender();
      } else {
        headerDrag.current = null;
      }
      return;
    }
    const hit = hitMarker(pos.x, pos.y);
    if (hit) {
      dragState.current = { markerId: hit.marker.id, groupId: hit.group.id };
      st.selectedMarkerId = hit.marker.id;
      st.selectedGroupId = hit.group.id;
      rerender();
    } else {
      dragState.current = null;
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const pos = canvasPos(e);
    const cv = canvasRef.current!;
    if (page.kind === "header") {
      if (!headerDrag.current) return;
      if (downPos.current && Math.hypot(pos.x - downPos.current.x, pos.y - downPos.current.y) > 2) moved.current = true;
      const field = page.headerFields.find((f) => f.id === headerDrag.current!.fieldId);
      if (field) {
        const xmm = Math.min(page.widthMm, Math.max(0, (pos.x / cv.width) * page.widthMm));
        const ymm = Math.min(page.heightMm, Math.max(0, (pos.y / cv.height) * page.heightMm));
        setFieldPointXY(field, headerDrag.current.pointKey, +xmm.toFixed(2), +ymm.toFixed(2));
        redraw();
      }
      return;
    }
    if (!dragState.current) return;
    if (downPos.current && Math.hypot(pos.x - downPos.current.x, pos.y - downPos.current.y) > 2) moved.current = true;
    const group = page.groups.find((g) => g.id === dragState.current!.groupId);
    const m = group?.markers.find((mm) => mm.id === dragState.current!.markerId);
    if (group && m) {
      const skipX = group.docType === "revisao" || group.docType === "posvenda";
      if (!skipX) m.fx = clamp01(pos.x / cv.width);
      m.fy = clamp01(pos.y / cv.height);
      syncGroupStartIfFirst(group, page, m);
      if (page.chainY) reflowGroupChainY(page);
      redraw(); // imperativo, sem re-render do editor
    }
  }

  function placeMarker(pos: { x: number; y: number }) {
    const cv = canvasRef.current!;
    const group = page.groups.find((g) => g.id === page.activeGroupId) || page.groups[0];
    if (!group) return;
    const label = group.useQueueOnClick ? nextQueueName(group) || nextLabel() : nextLabel();
    const m = makeMarker(group, page, label, (pos.y / cv.height) * page.heightMm);
    const isFirst = group.markers.length === 0;
    group.markers.push(m);
    if (isFirst) {
      if (m.fx !== undefined) group.xFixed = +(m.fx * page.widthMm).toFixed(2);
      group.yStart = +(m.fy * page.heightMm).toFixed(2);
    }
    st.selectedGroupId = group.id;
    st.selectedMarkerId = m.id;
    commit();
  }

  function handleCapture(pos: { x: number; y: number }) {
    const cap = st.captureMode;
    if (!cap) return;
    const cv = canvasRef.current!;
    const xmm = (pos.x / cv.width) * page.widthMm;
    const ymm = (pos.y / cv.height) * page.heightMm;
    if (cap.kind === "groupStart") {
      const g = page.groups.find((x) => x.id === cap.groupId);
      if (g) {
        g.xFixed = +xmm.toFixed(2);
        g.yStart = +ymm.toFixed(2);
        g.yManual = true;
      }
    } else if (cap.kind === "revisaoCol") {
      const g = page.groups.find((x) => x.id === cap.groupId);
      if (g) {
        const nv = +xmm.toFixed(2);
        if (page.pushCols && cap.colKey === "colX1") {
          const d = nv - (g.colX1 || 0);
          g.colX2 = +((g.colX2 || 0) + d).toFixed(2);
          g.colX3 = +((g.colX3 || 0) + d).toFixed(2);
        }
        g[cap.colKey] = nv;
        if (page.syncCols) syncColumnsToAll(page, g);
      }
    } else if (cap.kind === "posvendaOptX") {
      const g = page.groups.find((x) => x.id === cap.groupId);
      if (g) {
        if (!g.optX) g.optX = {};
        const nv = +xmm.toFixed(2);
        const opts = g.posvendaOpts || [];
        if (page.pushCols && opts.length && cap.valor === opts[0].valor) {
          const d = nv - (g.optX[cap.valor] || 0);
          opts.forEach((o) => {
            if (o.valor !== cap.valor) g.optX![o.valor] = +((g.optX![o.valor] || 0) + d).toFixed(2);
          });
        }
        g.optX[cap.valor] = nv;
        if (page.syncCols) syncColumnsToAll(page, g);
      }
    } else if (cap.kind === "headerPoint") {
      const f = page.headerFields.find((x) => x.id === cap.fieldId);
      if (f) setFieldPointXY(f, cap.pointKey, +xmm.toFixed(2), +ymm.toFixed(2));
    }
    st.captureMode = null;
    commit();
  }

  function onClick(e: React.MouseEvent) {
    if (moved.current) {
      moved.current = false;
      return;
    }
    const pos = canvasPos(e);
    if (st.captureMode) {
      handleCapture(pos);
      return;
    }
    if (page.kind === "header") return; // criação de campos de cabeçalho: Fase C (via sidebar)
    if (hitMarker(pos.x, pos.y)) return; // seleção já tratada no mousedown
    placeMarker(pos);
  }

  // mouseup (window) + teclado
  useEffect(() => {
    function onUp() {
      const was = !!dragState.current || !!headerDrag.current;
      dragState.current = null;
      headerDrag.current = null;
      if (was) commit();
    }
    function onKey(e: KeyboardEvent) {
      if (!st.selectedMarkerId) return;
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      let found: Marker | undefined;
      for (const g of page.groups) {
        found = g.markers.find((x) => x.id === st.selectedMarkerId);
        if (found) break;
      }
      if (!found) return;
      const m = found;
      const stepMm = e.shiftKey ? 1 : 0.1;
      const stepFx = stepMm / page.widthMm;
      const stepFy = stepMm / page.heightMm;
      if (e.key === "ArrowUp") m.fy = Math.max(0, m.fy - stepFy);
      else if (e.key === "ArrowDown") m.fy = Math.min(1, m.fy + stepFy);
      else if (e.key === "ArrowLeft") m.fx = Math.max(0, (m.fx ?? 0) - stepFx);
      else if (e.key === "ArrowRight") m.fx = Math.min(1, (m.fx ?? 0) + stepFx);
      else if (e.key === "Delete" || e.key === "Backspace") {
        for (const g of page.groups) g.markers = g.markers.filter((x) => x.id !== m.id);
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

  if (!hasImage) {
    return (
      <div className="flex-1 overflow-auto border-t border-[#e8e8e8] bg-[#d7d7d7] flex items-start justify-center p-6">
        <div className="w-[520px] max-w-[90%] min-h-[400px]">
          <DropZone
            onFileDrop={(files) => files[0] && onImageFile(files[0])}
            accept="image/*"
            icon={<FileImage className="w-8 h-8" />}
            label="Arraste o JPG da folha aqui"
            hint="ou clique para escolher — o mesmo arquivo usado como fundo no TCPDF"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto border-t border-[#e8e8e8] bg-[#d7d7d7] flex items-start justify-center p-6">
      <div
        className="relative bg-white leading-none"
        style={{ boxShadow: "0 0 0 1px #e8e8e8, 0 12px 40px rgba(0,0,0,.25)" }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onClick={onClick}
          className="block w-full h-auto cursor-crosshair"
        />
      </div>
    </div>
  );
}
