// Desenho das marcações do docType "roteiro" — portado de drawRoteiroGroupMarkers.

import type { DesignerGroup, DesignerPage } from "../types";
import { drawSymbol, typeColor } from "./symbols";

export function drawRoteiroGroupMarkers(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  page: DesignerPage,
  group: DesignerGroup,
  r: number,
  symSize: number,
  selectedMarkerId: string | null
): void {
  group.markers.forEach((m, idx) => {
    const type = m.type || "check";
    const x = (m.fx ?? 0) * cv.width;
    const y = m.fy * cv.height;
    const isSel = m.id === selectedMarkerId;
    const tColor = typeColor(type);
    const badgeColor = isSel ? "#f2a94a" : tColor;

    const relOffMm = page.typeOffsets[type as "check" | "x" | "na"] || 0;
    const relOffPx = (relOffMm / page.heightMm) * cv.height;
    const fx_ = x;
    const fy_ = y + relOffPx;
    const hasDelta = Math.hypot(fx_ - x, fy_ - y) > 0.5;

    const cellWpx = ((page.cellW || 14.5) / page.widthMm) * cv.width;
    const cellHpx = ((page.cellH || 5) / page.heightMm) * cv.height;
    const topLineY = fy_ - cellHpx / 2; // topo real da célula (o que o TCPDF usa como $y)

    ctx.strokeStyle = isSel ? "rgba(242,169,74,0.9)" : "rgba(255,255,255,0.28)";
    ctx.lineWidth = Math.max(1, cv.width * 0.0009);
    ctx.beginPath();
    ctx.moveTo(0, topLineY);
    ctx.lineTo(cv.width, topLineY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = Math.max(1, cv.width * 0.0012);
    ctx.strokeStyle = badgeColor;
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = Math.max(1, cv.width * 0.0009);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.95, y);
    ctx.lineTo(x + r * 0.95, y);
    ctx.moveTo(x, y - r * 0.95);
    ctx.lineTo(x, y + r * 0.95);
    ctx.stroke();
    ctx.restore();

    if (hasDelta) {
      ctx.save();
      ctx.setLineDash([r * 0.5, r * 0.5]);
      ctx.strokeStyle = "rgba(94,201,143,0.9)";
      ctx.lineWidth = Math.max(1, cv.width * 0.0011);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(fx_, fy_);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = tColor;
    ctx.lineWidth = Math.max(2, cv.width * 0.0026);
    ctx.strokeRect(fx_ - cellWpx / 2, fy_ - cellHpx / 2, cellWpx, cellHpx);
    if (isSel) {
      ctx.strokeStyle = "rgba(242,169,74,0.85)";
      ctx.lineWidth = Math.max(1, cv.width * 0.0013);
      ctx.strokeRect(fx_ - cellWpx / 2 - r * 0.3, fy_ - cellHpx / 2 - r * 0.3, cellWpx + r * 0.6, cellHpx + r * 0.6);
    }
    ctx.restore();

    const customLabel =
      group.docType === "posvenda" && group.posvendaOpts
        ? (group.posvendaOpts.find((o) => o.valor === type) || { label: undefined }).label
        : undefined;
    drawSymbol(ctx, cv.width, fx_, fy_, symSize, type, customLabel);

    const bx = fx_ + symSize + r * 0.9;
    const by = fy_ - symSize - r * 0.9;
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = badgeColor;
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = `600 ${Math.round(r * 1.0)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(idx + 1), bx, by + 0.5);
  });
}
