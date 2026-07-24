// Linha-guia do "Y inicial" + prévia fantasma dos itens da fila — portado de
// drawGroupYStartPreview (todos os docTypes).

import type { DesignerGroup, DesignerPage } from "../types";
import { nextGenBaseMm } from "../geometry";
import { parseQueueNames } from "../migration-parse";
import { typeColor } from "./symbols";

export function drawGroupYStartPreview(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  page: DesignerPage,
  group: DesignerGroup,
  r: number
): void {
  if (group.docType === "revisao") {
    const colHpx = ((group.colH || 6.3) / page.heightMm) * cv.height;
    const yStartPx = (group.yStart / page.heightMm) * cv.height - colHpx / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(242,169,74,0.85)";
    ctx.lineWidth = Math.max(1, cv.width * 0.0012);
    ctx.setLineDash([r * 0.7, r * 0.5]);
    ctx.beginPath();
    ctx.moveTo(0, yStartPx);
    ctx.lineTo(cv.width, yStartPx);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#f2a94a";
    ctx.font = `600 ${Math.round(r * 1.1)}px ui-monospace, monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Y inicial (" + group.title + ")", 4, yStartPx - 3);

    const names = parseQueueNames(group.queue);
    const used = new Set(group.markers.map((m) => m.label));
    const missing = names.filter((n) => !used.has(n));
    if (missing.length === 0) return;
    const baseMm = nextGenBaseMm(group, page);
    const w = ((group.colW || 7) / page.widthMm) * cv.width;
    const h = ((group.colH || 6.3) / page.heightMm) * cv.height;
    missing.forEach((label, k) => {
      const yMm = baseMm + k * group.increment;
      const yPx = (yMm / page.heightMm) * cv.height;
      (
        [
          [group.colX1, "#33d17a"],
          [group.colX2, "#ff5252"],
          [group.colX3, "#4d9eff"],
        ] as [number | undefined, string][]
      ).forEach(([xmm, color]) => {
        const xpx = ((xmm || 0) / page.widthMm) * cv.width;
        ctx.save();
        ctx.setLineDash([r * 0.35, r * 0.3]);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = Math.max(1, cv.width * 0.0011);
        ctx.strokeRect(xpx - w / 2, yPx - h / 2, w, h);
        ctx.restore();
      });
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `500 ${Math.round(r * 0.95)}px ui-monospace, monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const leftmostX = Math.min(group.colX1 || 0, group.colX2 || 0, group.colX3 || 0);
      const leftPx = (leftmostX / page.widthMm) * cv.width;
      ctx.fillText(label, leftPx - w / 2 - r * 0.7, yPx);
    });
    return;
  }

  if (group.docType === "posvenda") {
    const isDiff = group.posvendaXMode === "diff";
    const opts = group.posvendaOpts || [];
    const optHpx = ((group.optH || 5) / page.heightMm) * cv.height;
    const yStartPx = (group.yStart / page.heightMm) * cv.height - optHpx / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(242,169,74,0.85)";
    ctx.lineWidth = Math.max(1, cv.width * 0.0012);
    ctx.setLineDash([r * 0.7, r * 0.5]);
    ctx.beginPath();
    ctx.moveTo(0, yStartPx);
    ctx.lineTo(cv.width, yStartPx);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#f2a94a";
    ctx.font = `600 ${Math.round(r * 1.1)}px ui-monospace, monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("Y inicial (" + group.title + ")", 4, yStartPx - 3);

    const names = parseQueueNames(group.queue);
    const used = new Set(group.markers.map((m) => m.label));
    const missing = names.filter((n) => !used.has(n));
    if (missing.length === 0) return;
    const baseMm = nextGenBaseMm(group, page);
    const w = ((group.optW || 4.3) / page.widthMm) * cv.width;
    const h = ((group.optH || 5) / page.heightMm) * cv.height;
    const xsArr = isDiff ? opts.map((o) => (group.optX ? group.optX[o.valor] : 0) || 0) : [group.xFixed || 0];
    const leftmostX = xsArr.length ? Math.min.apply(null, xsArr) : 0;
    const leftPx = (leftmostX / page.widthMm) * cv.width;
    missing.forEach((label, k) => {
      const yMm = baseMm + k * group.increment;
      const yPx = (yMm / page.heightMm) * cv.height;
      xsArr.forEach((xmm, i) => {
        const xpx = (xmm / page.widthMm) * cv.width;
        ctx.save();
        ctx.setLineDash([r * 0.35, r * 0.3]);
        ctx.strokeStyle = isDiff ? typeColor(opts[i].valor) : "rgba(255,255,255,0.4)";
        ctx.globalAlpha = isDiff ? 0.45 : 1;
        ctx.lineWidth = Math.max(1, cv.width * 0.0011);
        ctx.strokeRect(xpx - w / 2, yPx - h / 2, w, h);
        ctx.restore();
      });
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `500 ${Math.round(r * 0.95)}px ui-monospace, monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(label, leftPx - w / 2 - r * 0.7, yPx);
    });
    return;
  }

  // roteiro
  const cellWpx = ((page.cellW || 14.5) / page.widthMm) * cv.width;
  const cellHpx = ((page.cellH || 5) / page.heightMm) * cv.height;
  const xPx = (group.xFixed / page.widthMm) * cv.width;
  const yStartPx = (group.yStart / page.heightMm) * cv.height - cellHpx / 2;

  ctx.save();
  ctx.strokeStyle = "rgba(242,169,74,0.85)";
  ctx.lineWidth = Math.max(1, cv.width * 0.0012);
  ctx.setLineDash([r * 0.7, r * 0.5]);
  ctx.beginPath();
  ctx.moveTo(0, yStartPx);
  ctx.lineTo(cv.width, yStartPx);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#f2a94a";
  ctx.font = `600 ${Math.round(r * 1.1)}px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Y inicial (" + group.title + ")", 4, yStartPx - 3);

  const names = parseQueueNames(group.queue);
  const used = new Set(group.markers.map((m) => m.label));
  const missing = names.filter((n) => !used.has(n));
  if (missing.length === 0) return;
  const baseMm = nextGenBaseMm(group, page);
  missing.forEach((label, k) => {
    const yMm = baseMm + k * group.increment;
    const yPx = (yMm / page.heightMm) * cv.height;
    ctx.save();
    ctx.setLineDash([r * 0.35, r * 0.3]);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = Math.max(1, cv.width * 0.0011);
    ctx.strokeRect(xPx - cellWpx / 2, yPx - cellHpx / 2, cellWpx, cellHpx);
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `500 ${Math.round(r * 0.95)}px ui-monospace, monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(label, xPx - cellWpx / 2 - r * 0.7, yPx);
  });
}
