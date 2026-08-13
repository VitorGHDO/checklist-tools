// Desenho das marcações do docType "pós-venda" — portado de
// drawPosvendaDiffGroupMarkers / drawPosvendaSameGroupMarkers.

import type { DesignerGroup, DesignerPage } from "../types";
import { typeColor } from "./symbols";

export function drawPosvendaDiffGroupMarkers(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  page: DesignerPage,
  group: DesignerGroup,
  r: number,
  selectedMarkerId: string | null
): void {
  const opts = group.posvendaOpts || [];
  const optX = group.optX || {};
  const scale = page.markScale === undefined ? 1 : page.markScale;
  const wPx = ((group.optW || 4.3) / page.widthMm) * cv.width;
  const hPx = ((group.optH || 5) / page.heightMm) * cv.height;
  const anchorXmm = opts.length ? optX[opts[Math.floor(opts.length / 2)].valor] || 0 : 0;
  const anchorX = (anchorXmm / page.widthMm) * cv.width;

  group.markers.forEach((m, idx) => {
    const y = m.fy * cv.height;
    const isSel = m.id === selectedMarkerId;
    const badgeColor = isSel ? "#f2a94a" : typeColor(m.type || (opts[0] ? opts[0].valor : "1"));

    const topLineY = y - hPx / 2;
    ctx.strokeStyle = isSel ? "rgba(242,169,74,0.9)" : "rgba(255,255,255,0.28)";
    ctx.lineWidth = Math.max(1, cv.width * 0.0009);
    ctx.beginPath();
    ctx.moveTo(0, topLineY);
    ctx.lineTo(cv.width, topLineY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(anchorX, y, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = Math.max(1, cv.width * 0.0012);
    ctx.strokeStyle = badgeColor;
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = Math.max(1, cv.width * 0.0009);
    ctx.beginPath();
    ctx.moveTo(anchorX - r * 0.95, y);
    ctx.lineTo(anchorX + r * 0.95, y);
    ctx.moveTo(anchorX, y - r * 0.95);
    ctx.lineTo(anchorX, y + r * 0.95);
    ctx.stroke();
    ctx.restore();

    opts.forEach((o) => {
      const xmm = optX[o.valor] || 0;
      const xpx = (xmm / page.widthMm) * cv.width;
      const active = (m.type || opts[0].valor) === o.valor;
      const color = typeColor(o.valor);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = active ? 1 : 0.55;
      ctx.lineWidth = Math.max(active ? 2.4 : 1.4, cv.width * (active ? 0.0026 : 0.0016));
      if (!page.hideMarkBox) ctx.strokeRect(xpx - wPx / 2, y - hPx / 2, wPx, hPx);
      ctx.restore();
      if (active && isSel) {
        ctx.save();
        ctx.strokeStyle = "rgba(242,169,74,0.85)";
        ctx.lineWidth = Math.max(1, cv.width * 0.0013);
        ctx.strokeRect(xpx - wPx / 2 - r * 0.3, y - hPx / 2 - r * 0.3, wPx + r * 0.6, hPx + r * 0.6);
        ctx.restore();
      }
      if (active) {
        ctx.fillStyle = "#1c1c1c";
        const fontSize = Math.round(r * 1.15 * scale);
        ctx.font = `700 ${fontSize}px Helvetica, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(2, cv.width * 0.0034);
        ctx.strokeStyle = "#ffffff";
        ctx.strokeText(o.label, xpx, y + 0.5);
        ctx.fillText(o.label, xpx, y + 0.5);
      } else {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.font = `500 ${Math.round(r * 0.95 * scale)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(o.label, xpx, y + 0.5);
        ctx.globalAlpha = 1;
      }
    });

    const bx = anchorX + r * 2.6;
    const by = y - r * 2.6;
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

export function drawPosvendaSameGroupMarkers(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  page: DesignerPage,
  group: DesignerGroup,
  r: number,
  selectedMarkerId: string | null
): void {
  const opts = group.posvendaOpts || [];
  const scale = page.markScale === undefined ? 1 : page.markScale;
  const wPx = ((group.optW || 4.3) / page.widthMm) * cv.width;
  const hPx = ((group.optH || 5) / page.heightMm) * cv.height;
  const x = ((group.xFixed || 0) / page.widthMm) * cv.width;

  group.markers.forEach((m, idx) => {
    const y = m.fy * cv.height;
    const isSel = m.id === selectedMarkerId;
    const activeOpt = opts.find((o) => o.valor === (m.type || (opts[0] ? opts[0].valor : "1"))) || opts[0];
    const color = activeOpt ? typeColor(activeOpt.valor) : "#5ec98f";
    const badgeColor = isSel ? "#f2a94a" : color;

    const topLineY = y - hPx / 2;
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

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2.4, cv.width * 0.0026);
    if (!page.hideMarkBox) ctx.strokeRect(x - wPx / 2, y - hPx / 2, wPx, hPx);
    if (isSel) {
      ctx.strokeStyle = "rgba(242,169,74,0.85)";
      ctx.lineWidth = Math.max(1, cv.width * 0.0013);
      ctx.strokeRect(x - wPx / 2 - r * 0.3, y - hPx / 2 - r * 0.3, wPx + r * 0.6, hPx + r * 0.6);
    }
    ctx.restore();

    const label = activeOpt ? activeOpt.label : "";
    ctx.fillStyle = "#1c1c1c";
    const fontSize = Math.round(r * 1.15 * scale);
    ctx.font = `700 ${fontSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, cv.width * 0.0034);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(label, x, y + 0.5);
    ctx.fillText(label, x, y + 0.5);

    const bx = x + r * 2.6;
    const by = y - r * 2.6;
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
