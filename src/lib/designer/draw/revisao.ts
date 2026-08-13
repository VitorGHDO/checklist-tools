// Desenho das marcações do docType "revisão" — portado de drawRevisaoGroupMarkers/revisaoMarkColor.

import type { DesignerGroup, DesignerPage, Marker } from "../types";

export function revisaoMarkColor(m: Marker): string {
  if (m.tipo === "texto") return "#4d9eff";
  const resp = m.resposta || "1";
  if (resp === "1") return "#33d17a";
  if (resp === "2") return "#ff5252";
  return "#8b97a8";
}

export function drawRevisaoGroupMarkers(
  ctx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  page: DesignerPage,
  group: DesignerGroup,
  r: number,
  selectedMarkerId: string | null
): void {
  group.markers.forEach((m, idx) => {
    const y = m.fy * cv.height;
    const isSel = m.id === selectedMarkerId;
    const badgeColor = isSel ? "#f2a94a" : revisaoMarkColor(m);
    const anchorXmm = group.colX2 !== undefined ? group.colX2 : 0;
    const x = (anchorXmm / page.widthMm) * cv.width;

    const colHpx = ((group.colH || 6.3) / page.heightMm) * cv.height;
    const textHpx = ((group.textH || 5) / page.heightMm) * cv.height;
    const textOffPx = ((group.textYOffset || 0) / page.heightMm) * cv.height;
    const topLineY = m.tipo === "texto" ? y + textOffPx - textHpx / 2 : y - colHpx / 2;

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

    const scale = page.markScale === undefined ? 1 : page.markScale;

    if (m.tipo === "texto") {
      const w = ((group.textW || 19) / page.widthMm) * cv.width;
      const h = ((group.textH || 5) / page.heightMm) * cv.height;
      const xpx = ((group.textX || 184) / page.widthMm) * cv.width;
      const ypx = y + ((group.textYOffset || 0) / page.heightMm) * cv.height;
      ctx.save();
      ctx.strokeStyle = badgeColor;
      ctx.lineWidth = Math.max(2, cv.width * 0.0026);
      if (!page.hideMarkBox) ctx.strokeRect(xpx - w / 2, ypx - h / 2, w, h);
      if (isSel) {
        ctx.strokeStyle = "rgba(242,169,74,0.85)";
        ctx.lineWidth = Math.max(1, cv.width * 0.0013);
        ctx.strokeRect(xpx - w / 2 - r * 0.3, ypx - h / 2 - r * 0.3, w + r * 0.6, h + r * 0.6);
      }
      ctx.restore();
      ctx.fillStyle = "#1c1c1c";
      ctx.font = `600 ${Math.round(r * 1.15 * scale)}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, cv.width * 0.0034);
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText("0.00", xpx, ypx + 0.5);
      ctx.fillText("0.00", xpx, ypx + 0.5);
    } else {
      const w = ((group.colW || 7) / page.widthMm) * cv.width;
      const h = ((group.colH || 6.3) / page.heightMm) * cv.height;
      const resposta = m.resposta || "1";
      const colColors: Record<string, string> = { "1": "#33d17a", "2": "#ff5252", "0": "#4d9eff" };
      (
        [
          ["1", group.colX1],
          ["2", group.colX2],
          ["0", group.colX3],
        ] as [string, number | undefined][]
      ).forEach(([resp, xmm]) => {
        const xpx = ((xmm || 0) / page.widthMm) * cv.width;
        const active = resposta === resp;
        const colColor = colColors[resp];
        ctx.save();
        ctx.strokeStyle = colColor;
        ctx.globalAlpha = active ? 1 : 0.55;
        ctx.lineWidth = Math.max(active ? 2.4 : 1.4, cv.width * (active ? 0.0026 : 0.0016));
        if (!page.hideMarkBox) ctx.strokeRect(xpx - w / 2, y - h / 2, w, h);
        ctx.restore();
        if (active && isSel) {
          ctx.save();
          ctx.strokeStyle = "rgba(242,169,74,0.85)";
          ctx.lineWidth = Math.max(1, cv.width * 0.0013);
          ctx.strokeRect(xpx - w / 2 - r * 0.3, y - h / 2 - r * 0.3, w + r * 0.6, h + r * 0.6);
          ctx.restore();
        }
        if (active) {
          ctx.fillStyle = "#1c1c1c";
          const fontSize = Math.round(r * 1.4 * scale);
          ctx.font = `700 ${fontSize}px Helvetica, Arial, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = Math.max(2, cv.width * 0.0034);
          ctx.strokeStyle = "#ffffff";
          ctx.strokeText("X", xpx, y + 0.5);
          ctx.fillText("X", xpx, y + 0.5);
        } else {
          ctx.fillStyle = colColor;
          ctx.globalAlpha = 0.7;
          ctx.font = `500 ${Math.round(r * 0.95)}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(resp, xpx, y + 0.5);
          ctx.globalAlpha = 1;
        }
      });
    }

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
