// PDF → uma imagem por página (data URL), para virar a arte de cada folha quando o pacote
// sai direto do extrator. ~150 DPI, o padrão das artes dos repositórios.

import { NextRequest, NextResponse } from "next/server";
import { renderizarPaginas } from "@/lib/extrator/render-paginas";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const pdf = fd.get("pdf");
  if (!(pdf instanceof File) || pdf.size === 0) {
    return NextResponse.json({ ok: false, erro: "Envie o PDF." }, { status: 400 });
  }
  try {
    const { paginas, total } = await renderizarPaginas(Buffer.from(await pdf.arrayBuffer()));
    return NextResponse.json({
      ok: true,
      total,
      paginas: paginas.map((p) => `data:${p.mimeType};base64,${p.base64}`),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: e instanceof Error ? e.message : "Não consegui renderizar o PDF." },
      { status: 500 },
    );
  }
}
