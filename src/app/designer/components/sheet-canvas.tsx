"use client";

import { useEffect, useRef, useState } from "react";
import { FileImage } from "lucide-react";
import { DropZone } from "@/components/ui/drop-zone";
import { MARKER_R_FRAC } from "@/lib/designer/constants";
import {
  clamp01,
  makeMarker,
  pushMarkersBelow,
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
import { drawManutencaoGroupMarkers } from "@/lib/designer/draw/manutencao";
import { drawFormularioGroupMarkers } from "@/lib/designer/draw/formulario";
import { getManutencaoConfig } from "@/lib/designer/manutencao";
import { colunaDoItem, getFormularioConfig } from "@/lib/designer/formulario";
import { drawHeaderFields } from "@/lib/designer/draw/header";
import { drawGroupYStartPreview } from "@/lib/designer/draw/preview";
import type { DesignerGroup, DesignerPage, EditorState, HeaderField, Marker } from "@/lib/designer/types";

/** Arrasto em curso — compartilhado pelo palco para que o mouseup global saiba encerrar. */
export interface DragRef {
  pageId: string;
  markerId: string;
  groupId: string;
}
export interface HeaderDragRef {
  pageId: string;
  fieldId: string;
  pointKey: string;
}
/** Arrasto de um grupo inteiro pelo seu handle: reancora o bloco no fluxo. */
export interface GroupDragRef {
  pageId: string;
  groupId: string;
  /** Distância (mm) entre o ponto clicado e o yStart do grupo, para não "pular". */
  offsetMm: number;
}

interface Props {
  st: EditorState;
  page: DesignerPage;
  tick: number;
  rerender: () => void;
  commit: () => void;
  nextLabel: () => string;
  onImageFile: (file: File, page: DesignerPage) => void;
  dragRef: React.MutableRefObject<DragRef | null>;
  headerDragRef: React.MutableRefObject<HeaderDragRef | null>;
  groupDragRef: React.MutableRefObject<GroupDragRef | null>;
  /** Move um grupo para outra folha/posição e reacomoda o fluxo. */
  onGroupDrop: (groupId: string, fromPageId: string, toPageId: string, yMm: number) => void;
  isCurrent: boolean;
  onActivate: () => void;
  /** Redraw registrado no palco, para o mouseup global repintar a folha certa. */
  registerRedraw: (pageId: string, fn: (() => void) | null) => void;
  /** Container de rolagem do palco — precisa ser o root do observer, senão o
   *  rootMargin não atravessa o clipping dele e não há pré-carga. */
  scrollRoot: React.MutableRefObject<HTMLDivElement | null>;
}

export function SheetCanvas({
  st,
  page,
  tick,
  rerender,
  commit,
  nextLabel,
  onImageFile,
  dragRef,
  headerDragRef,
  groupDragRef,
  onGroupDrop,
  isCurrent,
  onActivate,
  registerRedraw,
  scrollRoot,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgCache = useRef<Record<string, HTMLImageElement>>({});
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  // Virtualização: com muitas folhas empilhadas, manter todos os bitmaps vivos
  // consumiria centenas de MB. Só as folhas por perto são desenhadas.
  const [near, setNear] = useState(false);

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
      const isFormulario = group.docType === "formulario";
      const formCfgHit = isFormulario ? getFormularioConfig(st.pages) : null;
      for (let i = group.markers.length - 1; i >= 0; i--) {
        const m = group.markers[i];
        let mxMm: number;
        if (isFormulario) mxMm = colunaDoItem(formCfgHit, m)?.x ?? 0;
        else if (isRevisao) mxMm = group.colX2 !== undefined ? group.colX2 : 0;
        else if (isPosvendaDiff) {
          const opts = group.posvendaOpts || [];
          mxMm = opts.length ? (group.optX ? group.optX[opts[Math.floor(opts.length / 2)].valor] : 0) || 0 : 0;
        } else mxMm = (m.fx ?? 0) * page.widthMm;
        const mx =
          isRevisao || isPosvendaDiff || isFormulario
            ? (mxMm / page.widthMm) * cv.width
            : (m.fx ?? 0) * cv.width;
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
  /** Geometria do handle de arraste de um grupo (barra à esquerda do 1º item). */
  function groupHandleRect(group: DesignerGroup, cv: HTMLCanvasElement) {
    const w = cv.width * 0.052;
    const h = cv.width * 0.026;
    const x = cv.width * 0.012;
    const y = (group.yStart / page.heightMm) * cv.height - h / 2;
    return { x, y, w, h };
  }

  function hitGroupHandle(px: number, py: number): DesignerGroup | null {
    const cv = canvasRef.current!;
    if (page.kind !== "checklist") return null;
    for (let i = page.groups.length - 1; i >= 0; i--) {
      const g = page.groups[i];
      if (!g.markers.length) continue;
      const r = groupHandleRect(g, cv);
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return g;
    }
    return null;
  }

  /** Handles dos grupos: arrastar reancora o bloco (inclusive para outra folha). */
  function drawGroupHandles(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement) {
    if (page.kind !== "checklist") return;
    ctx.save();
    ctx.font = `600 ${Math.round(cv.width * 0.015)}px sans-serif`;
    ctx.textBaseline = "middle";
    page.groups.forEach((g, i) => {
      if (!g.markers.length) return;
      const r = groupHandleRect(g, cv);
      const dragging = groupDragRef.current?.groupId === g.id;
      ctx.fillStyle = dragging ? "rgba(237,50,55,0.95)" : g.yManual ? "rgba(23,56,114,0.95)" : "rgba(23,56,114,0.55)";
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, r.h * 0.35);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(`${i + 1}${g.yManual ? "•" : ""}`, r.x + r.w * 0.22, r.y + r.h / 2);
    });
    ctx.restore();
  }

  /** Guias da faixa útil desta folha — mostram onde o fluxo pode posicionar itens. */
  function drawFlowRange(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement) {
    if (page.kind !== "checklist") return;
    const lines: { y: number; label: string }[] = [];
    if (page.flowTop !== undefined) lines.push({ y: page.flowTop, label: "início" });
    if (page.flowBottom !== undefined) lines.push({ y: page.flowBottom, label: "fim" });
    if (!lines.length) return;
    ctx.save();
    ctx.strokeStyle = "rgba(23,56,114,0.55)";
    ctx.fillStyle = "rgba(23,56,114,0.75)";
    ctx.lineWidth = Math.max(1, cv.width * 0.0015);
    ctx.setLineDash([cv.width * 0.012, cv.width * 0.008]);
    ctx.font = `${Math.round(cv.width * 0.014)}px sans-serif`;
    for (const l of lines) {
      const y = (l.y / page.heightMm) * cv.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cv.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText(`${l.label} ${l.y}mm`, cv.width * 0.008, y - cv.width * 0.006);
      ctx.setLineDash([cv.width * 0.012, cv.width * 0.008]);
    }
    ctx.restore();
  }

  function drawMarkers(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement) {
    const r = cv.width * MARKER_R_FRAC;
    if (page.kind === "header") {
      drawHeaderFields(ctx, cv, page, st.selectedHeaderFieldId, r);
      return;
    }
    drawFlowRange(ctx, cv);
    const symSize = r * 3.4 * (page.markScale === undefined ? 1 : page.markScale);
    const activeGroup = page.groups.find((g) => g.id === page.activeGroupId);
    if (activeGroup) drawGroupYStartPreview(ctx, cv, page, activeGroup, r);
    const manutCfg = page.docType === "manutencao" ? getManutencaoConfig(st.pages) : null;
    const formCfg = page.docType === "formulario" ? getFormularioConfig(st.pages) : null;
    page.groups.forEach((group) => {
      if (group.docType === "manutencao") {
        if (manutCfg) drawManutencaoGroupMarkers(ctx, cv, page, group, r, manutCfg, st.selectedMarkerId);
      } else if (group.docType === "formulario") {
        if (formCfg) drawFormularioGroupMarkers(ctx, cv, page, group, r, formCfg, st.selectedMarkerId);
      } else if (group.docType === "revisao") {
        drawRevisaoGroupMarkers(ctx, cv, page, group, r, st.selectedMarkerId);
      } else if (group.docType === "posvenda" && group.posvendaXMode === "diff") {
        drawPosvendaDiffGroupMarkers(ctx, cv, page, group, r, st.selectedMarkerId);
      } else if (group.docType === "posvenda") {
        drawPosvendaSameGroupMarkers(ctx, cv, page, group, r, st.selectedMarkerId);
      } else {
        drawRoteiroGroupMarkers(ctx, cv, page, group, r, symSize, st.selectedMarkerId);
      }
    });
    drawGroupHandles(ctx, cv);
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

  // observa a proximidade da viewport para desenhar/liberar o bitmap
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), {
      root: scrollRoot.current ?? null,
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRoot]);

  // redesenha quando o editor re-renderiza, ou libera o bitmap ao sair de vista
  useEffect(() => {
    if (near) {
      redraw();
    } else {
      const cv = canvasRef.current;
      if (cv && cv.width) {
        cv.width = 0;
        cv.height = 0;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, page.id, near]);

  // expõe o redraw para o palco (mouseup global precisa repintar esta folha)
  useEffect(() => {
    registerRedraw(page.id, redraw);
    return () => registerRedraw(page.id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id, near]);

  // ─── interações ──────────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    if (!isCurrent) onActivate();
    const pos = canvasPos(e);
    downPos.current = pos;
    moved.current = false;
    if (page.kind === "header") {
      const hit = hitHeaderPoint(pos.x, pos.y);
      if (hit) {
        headerDragRef.current = { pageId: page.id, fieldId: hit.field.id, pointKey: hit.pointKey };
        st.selectedHeaderFieldId = hit.field.id;
        rerender();
      } else {
        headerDragRef.current = null;
      }
      return;
    }
    // handle do grupo tem prioridade: arrasta o bloco inteiro
    const handle = hitGroupHandle(pos.x, pos.y);
    if (handle) {
      const cv = canvasRef.current!;
      const yMm = (pos.y / cv.height) * page.heightMm;
      groupDragRef.current = { pageId: page.id, groupId: handle.id, offsetMm: yMm - handle.yStart };
      st.selectedGroupId = handle.id;
      dragRef.current = null;
      rerender();
      return;
    }

    const hit = hitMarker(pos.x, pos.y);
    if (hit) {
      dragRef.current = { pageId: page.id, markerId: hit.marker.id, groupId: hit.group.id };
      st.selectedMarkerId = hit.marker.id;
      st.selectedGroupId = hit.group.id;
      rerender();
    } else {
      dragRef.current = null;
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const cv = canvasRef.current!;
    const pos = canvasPos(e);

    // arraste de grupo: a folha sob o cursor é a folha destino (o drop reancora lá)
    const gd = groupDragRef.current;
    if (gd) {
      if (downPos.current && Math.hypot(pos.x - downPos.current.x, pos.y - downPos.current.y) > 2) moved.current = true;
      const group = st.pages
        .find((p) => p.id === gd.pageId)
        ?.groups.find((g) => g.id === gd.groupId);
      if (group && gd.pageId === page.id) {
        // preview local durante o arraste; o fluxo definitivo roda no drop
        const yMm = (pos.y / cv.height) * page.heightMm - gd.offsetMm;
        const inc = group.increment || 6.13;
        group.yStart = +Math.max(0, yMm).toFixed(2);
        group.markers.forEach((m, k) => {
          m.fy = clamp01((group.yStart + k * inc) / page.heightMm);
        });
        redraw();
      }
      return;
    }

    if (page.kind === "header") {
      const hd = headerDragRef.current;
      if (!hd || hd.pageId !== page.id) return;
      if (downPos.current && Math.hypot(pos.x - downPos.current.x, pos.y - downPos.current.y) > 2) moved.current = true;
      const field = page.headerFields.find((f) => f.id === hd.fieldId);
      if (field) {
        const xmm = Math.min(page.widthMm, Math.max(0, (pos.x / cv.width) * page.widthMm));
        const ymm = Math.min(page.heightMm, Math.max(0, (pos.y / cv.height) * page.heightMm));
        setFieldPointXY(field, hd.pointKey, +xmm.toFixed(2), +ymm.toFixed(2));
        redraw();
      }
      return;
    }
    const d = dragRef.current;
    if (!d || d.pageId !== page.id) return;
    if (downPos.current && Math.hypot(pos.x - downPos.current.x, pos.y - downPos.current.y) > 2) moved.current = true;
    const group = page.groups.find((g) => g.id === d.groupId);
    const m = group?.markers.find((mm) => mm.id === d.markerId);
    if (group && m) {
      const skipX =
        group.docType === "revisao" ||
        group.docType === "posvenda" ||
        group.docType === "manutencao" ||
        group.docType === "formulario";
      if (!skipX) m.fx = clamp01(pos.x / cv.width);
      const fyAntes = m.fy;
      m.fy = clamp01(pos.y / cv.height);
      // Arrastar um item leva os de baixo junto, como no campo Y do painel: o bloco desce
      // inteiro e o espaçamento entre eles fica como está.
      if (page.pushBelow !== false) {
        const idx = group.markers.indexOf(m);
        pushMarkersBelow(group, page, idx, (m.fy - fyAntes) * page.heightMm);
      }
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
    // o grupo alvo pode estar em outra folha (todas têm as mesmas dimensões em mm)
    const findGroup = (id: string): { g: DesignerGroup; p: DesignerPage } | null => {
      for (const p of st.pages) {
        const g = p.groups.find((x) => x.id === id);
        if (g) return { g, p };
      }
      return null;
    };
    if (cap.kind === "flowTop" || cap.kind === "flowBottom") {
      const target = st.pages.find((p) => p.id === cap.pageId);
      if (target) {
        if (cap.kind === "flowTop") target.flowTop = +ymm.toFixed(2);
        else target.flowBottom = +ymm.toFixed(2);
      }
    } else if (cap.kind === "formularioColX") {
      const cfg = getFormularioConfig(st.pages);
      const col = cfg?.colunas.find((c) => c.id === cap.colunaId);
      if (col) col.x = +xmm.toFixed(2);
    } else if (cap.kind === "manutencaoColX") {
      const cfg = getManutencaoConfig(st.pages);
      const col = cfg?.colunas.find((c) => c.id === cap.colunaId);
      if (col) col.x = +xmm.toFixed(2);
    } else if (cap.kind === "groupStart") {
      const found = findGroup(cap.groupId);
      if (found) {
        found.g.xFixed = +xmm.toFixed(2);
        found.g.yStart = +ymm.toFixed(2);
        found.g.yManual = true;
      }
    } else if (cap.kind === "revisaoCol") {
      const found = findGroup(cap.groupId);
      if (found) {
        const g = found.g;
        const nv = +xmm.toFixed(2);
        if (found.p.pushCols && cap.colKey === "colX1") {
          const dd = nv - (g.colX1 || 0);
          g.colX2 = +((g.colX2 || 0) + dd).toFixed(2);
          g.colX3 = +((g.colX3 || 0) + dd).toFixed(2);
        }
        g[cap.colKey] = nv;
        if (found.p.syncCols) syncColumnsToAll(found.p, g);
      }
    } else if (cap.kind === "posvendaOptX") {
      const found = findGroup(cap.groupId);
      if (found) {
        const g = found.g;
        if (!g.optX) g.optX = {};
        const nv = +xmm.toFixed(2);
        const opts = g.posvendaOpts || [];
        if (found.p.pushCols && opts.length && cap.valor === opts[0].valor) {
          const dd = nv - (g.optX[cap.valor] || 0);
          opts.forEach((o) => {
            if (o.valor !== cap.valor) g.optX![o.valor] = +((g.optX![o.valor] || 0) + dd).toFixed(2);
          });
        }
        g.optX[cap.valor] = nv;
        if (found.p.syncCols) syncColumnsToAll(found.p, g);
      }
    } else if (cap.kind === "headerPoint") {
      for (const p of st.pages) {
        const f = p.headerFields.find((x) => x.id === cap.fieldId);
        if (f) {
          setFieldPointXY(f, cap.pointKey, +xmm.toFixed(2), +ymm.toFixed(2));
          break;
        }
      }
    }
    st.captureMode = null;
    commit();
  }

  /**
   * Soltar sobre ESTA folha define o destino do grupo arrastado — é o que permite
   * puxar um grupo da folha 1 e soltá-lo na folha 2 no palco empilhado.
   */
  function onMouseUp(e: React.MouseEvent) {
    const gd = groupDragRef.current;
    if (!gd) return;
    const cv = canvasRef.current!;
    const pos = canvasPos(e);
    const yMm = Math.max(0, (pos.y / cv.height) * page.heightMm - gd.offsetMm);
    groupDragRef.current = null;
    onGroupDrop(gd.groupId, gd.pageId, page.id, +yMm.toFixed(2));
  }

  function onClick(e: React.MouseEvent) {
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (groupDragRef.current) return;
    const pos = canvasPos(e);
    if (st.captureMode) {
      handleCapture(pos);
      return;
    }
    if (page.kind === "header") return; // campos de cabeçalho são criados pela sidebar
    if (hitMarker(pos.x, pos.y)) return; // seleção já tratada no mousedown
    placeMarker(pos);
  }

  const markerCount = page.groups.reduce((a, g) => a + g.markers.length, 0);

  return (
    <div ref={wrapRef} className="w-full flex flex-col items-center gap-1.5">
      {/* rótulo da folha */}
      <button
        onClick={onActivate}
        className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
          isCurrent
            ? "bg-[#173872] border-[#173872] text-white"
            : "bg-white/80 border-[#d0d0d0] text-[#80808F] hover:text-[#464E5F]"
        }`}
        title={isCurrent ? "Folha atual (a sidebar mostra os grupos dela)" : "Clique para editar esta folha na sidebar"}
      >
        {page.name}
        <span className={isCurrent ? "text-white/70" : "text-[#b0b0bf]"}>
          {page.groups.length}g · {markerCount}m
        </span>
      </button>

      <div
        className="relative bg-white leading-none w-full"
        style={{
          boxShadow: isCurrent
            ? "0 0 0 2px #173872, 0 12px 40px rgba(0,0,0,.25)"
            : "0 0 0 1px #e8e8e8, 0 12px 40px rgba(0,0,0,.18)",
          aspectRatio: hasImage ? undefined : `${page.widthMm} / ${page.heightMm}`,
        }}
      >
        {hasImage ? (
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onClick={onClick}
            className="block w-full h-auto cursor-crosshair"
            style={{ aspectRatio: `${bgPage.naturalW || page.widthMm} / ${bgPage.naturalH || page.heightMm}` }}
          />
        ) : (
          // Colado no topo: a folha vazia tem a proporção A4 inteira, e centralizado o
          // alvo caía na metade da altura, longe da área visível ao rolar o palco.
          <div className="absolute inset-0 px-4 pt-6 flex items-start justify-center" onClick={onActivate}>
            <DropZone
              onFileDrop={(files) => files[0] && onImageFile(files[0], page)}
              accept="image/*"
              icon={<FileImage className="w-8 h-8" />}
              label={`Arraste o JPG de "${page.name}"`}
              hint="ou clique para escolher — o mesmo arquivo usado como fundo no TCPDF"
            />
          </div>
        )}
      </div>
    </div>
  );
}
