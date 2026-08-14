// Desenho das marcações do docType "formulario".
//
// A folha já traz as colunas de resultado impressas; o item só decide em qual delas a
// marcação cai. Por isso o canvas mostra o símbolo na coluna escolhida e as outras
// esmaecidas — é a comparação lado a lado que denuncia um X de coluna mal calibrado.
//
// O TCPDF escreve com writeHTMLCell ancorando no canto SUPERIOR ESQUERDO, então a caixa
// desenhada começa em (colunaX, markerY), como sai na folha.

import { colunaDoItem } from "../formulario";
import type { DesignerGroup, DesignerPage, FormularioConfig } from "../types";

const COR_ATIVA = "#173872";
const COR_INATIVA = "rgba(70,78,95,0.30)";

function desenharSimbolo(
  ctx: CanvasRenderingContext2D,
  simbolo: string,
  x: number,
  y: number,
  w: number,
  h: number,
  ativa: boolean,
): void {
  ctx.save();
  ctx.font = `700 ${Math.round(Math.min(w, h) * 0.95)}px ui-sans-serif, system-ui, "Segoe UI Symbol", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (ativa) {
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.22);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineJoin = "round";
    ctx.strokeText(simbolo, cx, cy);
    ctx.fillStyle = COR_ATIVA;
  } else {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = COR_INATIVA;
  }
  ctx.fillText(simbolo, cx, cy);
  ctx.restore();
}

export function drawFormularioGroupMarkers(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  page: DesignerPage,
  group: DesignerGroup,
  r: number,
  cfg: FormularioConfig,
  selectedMarkerId: string | null,
): void {
  const w = (cfg.celulaW / page.widthMm) * cv.width;
  const h = (cfg.celulaH / page.heightMm) * cv.height;

  group.markers.forEach((m, idx) => {
    const y = m.fy * cv.height;
    const isSel = m.id === selectedMarkerId;
    const escolhida = colunaDoItem(cfg, m);

    // Linha da altura do item: a referência para casar a marcação com a linha impressa.
    ctx.save();
    ctx.strokeStyle = isSel ? "rgba(242,169,74,0.9)" : "rgba(23,56,114,0.14)";
    ctx.lineWidth = Math.max(1, cv.width * 0.0009);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cv.width, y);
    ctx.stroke();
    ctx.restore();

    cfg.colunas.forEach((col) => {
      const x = (col.x / page.widthMm) * cv.width;
      const ativa = col.id === escolhida?.id;
      desenharSimbolo(ctx, cfg.simbolo, x, y, w, h, ativa);
      if (!page.hideMarkBox) {
        ctx.save();
        ctx.setLineDash(ativa ? [] : [w * 0.25, w * 0.25]);
        ctx.strokeStyle = ativa
          ? isSel
            ? "rgba(242,169,74,0.95)"
            : "rgba(23,56,114,0.55)"
          : "rgba(70,78,95,0.28)";
        ctx.lineWidth = Math.max(1, cv.width * (ativa && isSel ? 0.0016 : 0.0008));
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      }
    });

    // Índice do item, à esquerda da 1ª coluna.
    const primeira = cfg.colunas[0];
    if (!primeira) return;
    const bx = (primeira.x / page.widthMm) * cv.width - r * 1.4;
    const by = y + h / 2;
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = isSel ? "#f2a94a" : COR_ATIVA;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${Math.round(r * 1.0)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(idx + 1), bx, by + 0.5);
  });
}
