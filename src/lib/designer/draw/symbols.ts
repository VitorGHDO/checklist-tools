// Desenho de símbolos no canvas — portado de checklist_construtor.html (typeColor/drawSymbol).

export function typeColor(type: string | undefined): string {
  if (type === "x" || type === "3") return "#ff5252";
  if (type === "na") return "#4d9eff";
  if (type === "0") return "#8b97a8";
  return "#33d17a"; // check / '1'
}

export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  cvWidth: number,
  x: number,
  y: number,
  size: number,
  type: string,
  customLabel?: string
): void {
  if (type === "1" || type === "3" || type === "0") {
    const label = customLabel || (type === "1" ? "Ok" : type === "3" ? "N/Ok" : "NA");
    const fontSize = Math.round(size * 0.62);
    ctx.font = `700 ${fontSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, cvWidth * 0.0034);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText(label, x, y + 0.5);
    ctx.fillStyle = "#1c1c1c";
    ctx.fillText(label, x, y + 0.5);
    return;
  }
  const label = type === "x" ? "X" : type === "na" ? "NA" : "✓";
  const fontSize = Math.round(size * (type === "na" ? 1.3 : 1.5));
  ctx.font = `700 ${fontSize}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, cvWidth * 0.0034);
  ctx.strokeStyle = "#ffffff";
  ctx.strokeText(label, x, y + 0.5);
  ctx.fillStyle = "#1c1c1c";
  ctx.fillText(label, x, y + 0.5);
}
