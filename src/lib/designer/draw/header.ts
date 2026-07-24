// Desenho dos campos de cabeçalho/rodapé — portado de drawHeaderFields e helpers.

import { tipoLabel } from "../model";
import type { DesignerPage, HeaderAlign, HeaderFieldTipo } from "../types";

export function headerTypeColor(tipo: HeaderFieldTipo): string {
  if (tipo === "texto") return "#4d9eff";
  if (tipo === "assinatura") return "#c084fc";
  if (tipo === "data") return "#fbbf24";
  if (tipo === "hora") return "#fb923c";
  if (tipo === "opcoes") return "#33d17a";
  return "#5ec98f";
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawFieldBox(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  page: DesignerPage,
  xmm: number,
  ymm: number,
  wmm: number,
  hmm: number,
  color: string,
  placeholder: string | null,
  r: number,
  isSel: boolean,
  align?: HeaderAlign
): Box {
  const x = (xmm / page.widthMm) * cv.width;
  const y = (ymm / page.heightMm) * cv.height;
  const w = (wmm / page.widthMm) * cv.width;
  const h = (hmm / page.heightMm) * cv.height;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, cv.width * 0.0024);
  ctx.strokeRect(x, y, w, h);
  if (isSel) {
    ctx.strokeStyle = "rgba(242,169,74,0.85)";
    ctx.lineWidth = Math.max(1, cv.width * 0.0013);
    ctx.strokeRect(x - r * 0.3, y - r * 0.3, w + r * 0.6, h + r * 0.6);
  }
  ctx.restore();
  if (placeholder) {
    ctx.fillStyle = color;
    const fontSize = Math.max(6, Math.min(h * 0.62, w / (placeholder.length * 0.62)));
    ctx.font = `500 ${Math.round(fontSize)}px ui-monospace, monospace`;
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.85;
    const pad = w * 0.07;
    let tx: number;
    if (align === "L") {
      ctx.textAlign = "left";
      tx = x + pad;
    } else if (align === "R") {
      ctx.textAlign = "right";
      tx = x + w - pad;
    } else {
      ctx.textAlign = "center";
      tx = x + w / 2;
    }
    ctx.fillText(placeholder, tx, y + h / 2 + 0.5);
    ctx.globalAlpha = 1;
  }
  return { x, y, w, h };
}

function drawFieldLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, r: number): void {
  ctx.fillStyle = color;
  ctx.font = `600 ${Math.round(r * 1.15)}px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(text, x, y - 2);
}

function drawSeparatorBetween(ctx: CanvasRenderingContext2D, b1: Box, b2: Box, sep: string, color: string, r: number): void {
  const x = (b1.x + b1.w + b2.x) / 2;
  const y = b1.y + b1.h / 2;
  ctx.fillStyle = color;
  ctx.font = `600 ${Math.round(r * 1.1)}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sep || "/", x, y);
}

export function drawHeaderFields(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  page: DesignerPage,
  selectedHeaderFieldId: string | null,
  r: number
): void {
  page.headerFields.forEach((field) => {
    const isSel = field.id === selectedHeaderFieldId;
    const color = headerTypeColor(field.tipo);

    if (field.tipo === "texto") {
      const box = drawFieldBox(ctx, cv, page, field.x, field.y, field.w, field.h, color, field.amostra || "Texto de exemplo", r, isSel, field.align || "C");
      drawFieldLabel(ctx, box.x, box.y, field.campo || tipoLabel(field.tipo), color, r);
    } else if (field.tipo === "assinatura") {
      const box = drawFieldBox(ctx, cv, page, field.x, field.y, field.w, field.h, color, null, r, isSel);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = Math.max(1, cv.width * 0.0012);
      ctx.beginPath();
      const bx = box.x + box.w * 0.12;
      const by = box.y + box.h * 0.65;
      ctx.moveTo(bx, by);
      ctx.bezierCurveTo(box.x + box.w * 0.25, box.y + box.h * 0.15, box.x + box.w * 0.35, box.y + box.h * 0.95, box.x + box.w * 0.5, box.y + box.h * 0.4);
      ctx.bezierCurveTo(box.x + box.w * 0.62, box.y + box.h * 0.05, box.x + box.w * 0.75, box.y + box.h * 0.85, box.x + box.w * 0.9, box.y + box.h * 0.5);
      ctx.stroke();
      ctx.restore();
      drawFieldLabel(ctx, box.x, box.y, (field.campo || tipoLabel(field.tipo)) + " ✍", color, r);
    } else if (field.tipo === "data") {
      const anoPh = field.anoDigitos === "4" ? "0000" : "00";
      const b1 = drawFieldBox(ctx, cv, page, field.x1, field.y, field.w, field.h, color, "00", r, isSel);
      const b2 = drawFieldBox(ctx, cv, page, field.x2, field.y, field.w, field.h, color, "00", r, isSel);
      const b3 = drawFieldBox(ctx, cv, page, field.x3, field.y, field.w, field.h, color, anoPh, r, isSel);
      drawSeparatorBetween(ctx, b1, b2, field.separador, color, r);
      drawSeparatorBetween(ctx, b2, b3, field.separador, color, r);
      drawFieldLabel(ctx, b1.x, b1.y, field.campo || tipoLabel(field.tipo), color, r);
    } else if (field.tipo === "hora") {
      const b1 = drawFieldBox(ctx, cv, page, field.x1, field.y, field.w, field.h, color, "00", r, isSel);
      const b2 = drawFieldBox(ctx, cv, page, field.x2, field.y, field.w, field.h, color, "00", r, isSel);
      drawSeparatorBetween(ctx, b1, b2, field.separador, color, r);
      drawFieldLabel(ctx, b1.x, b1.y, field.campo || tipoLabel(field.tipo), color, r);
    } else if (field.tipo === "opcoes") {
      let firstBox: Box | null = null;
      field.opcoes.forEach((o) => {
        const b = drawFieldBox(ctx, cv, page, o.x, field.y, field.w, field.h, color, "X", r, isSel);
        if (!firstBox) firstBox = b;
      });
      if (firstBox) drawFieldLabel(ctx, (firstBox as Box).x, (firstBox as Box).y, field.campo || tipoLabel(field.tipo), color, r);
    }
  });
}
