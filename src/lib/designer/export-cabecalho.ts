// Peças de emissão de PHP compartilhadas pelos docTypes que geram arquivo próprio
// (plano de manutenção e formulários gerais): números formatados, o emissor de SetFont
// e o desenho dos campos de cabeçalho/rodapé. Ficavam privadas no export do plano —
// foram extraídas quando o formulário passou a precisar exatamente das mesmas regras.

import type { HeaderField } from "./types";

export const TAB = "    ";

/** Escapa uma string para literal PHP entre aspas simples. */
export function phpEscape(str: string): string {
  return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Número sem zeros à toa: 76.00 → 76, 90.50 → 90.5. */
export function fmtNum(v: number, prec: number): string {
  const s = v.toFixed(prec);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** Emissor de SetFont que só escreve a linha quando o tamanho muda de verdade. */
export function criarFonte() {
  let atual: string | null = null;
  return (tamanho: string | number | undefined, indent: string): string[] => {
    if (tamanho === undefined || tamanho === "" || tamanho === null) return [];
    const v = String(tamanho);
    if (v === atual) return [];
    atual = v;
    return [`${indent}$pdf->SetFont('Helvetica', '', ${v});`];
  };
}
export type Fonte = ReturnType<typeof criarFonte>;

// ─── cabeçalho / rodapé ───────────────────────────────────────────────────────

/** Recorte de dia/mês/ano por posição — o formulário grava a data como string crua. */
export function substrsDaData(formato: "ymd" | "dmy", anoDigitos: "2" | "4"): {
  dia: string;
  mes: string;
  ano: string;
} {
  if (formato === "dmy") {
    return {
      dia: "substr($dataCampo, 0, 2)",
      mes: "substr($dataCampo, 3, 2)",
      ano: anoDigitos === "4" ? "substr($dataCampo, 6, 4)" : "substr($dataCampo, 8, 2)",
    };
  }
  return {
    dia: "substr($dataCampo, 8, 2)",
    mes: "substr($dataCampo, 5, 2)",
    ano: anoDigitos === "4" ? "substr($dataCampo, 0, 4)" : "substr($dataCampo, 2, 2)",
  };
}

export function headerFieldLines(field: HeaderField, indent: string, fonte: Fonte, resp: string): string[] {
  const out: string[] = [];
  const campo = field.campo.trim();
  if (!campo) return out;

  if (field.tipo === "texto") {
    out.push(...fonte(field.fontSize, indent));
    out.push(
      `${indent}$pdf->writeHTMLCell(${field.w}, ${field.h}, ${field.x}, ${field.y}, ${resp}->${campo} ?? '', 0, 0, 0, true, '${field.align}', true);`,
    );
    return out;
  }

  if (field.tipo === "assinatura") {
    // Assinatura vem como data URL no formulário; o modelo decodifica e imprime como
    // imagem em memória ('@' + binário), sem depender do provider de assinatura.
    out.push(`${indent}if (!empty(${resp}->${campo})) {`);
    out.push(
      `${indent}${TAB}$imgAssinatura = base64_decode(str_replace('data:image/png;base64,', '', ${resp}->${campo}));`,
    );
    out.push(`${indent}${TAB}$pdf->Image('@' . $imgAssinatura, ${field.x}, ${field.y}, ${field.w}, ${field.h});`);
    out.push(`${indent}}`);
    return out;
  }

  if (field.tipo === "data") {
    const { dia, mes, ano } = substrsDaData(field.formato, field.anoDigitos);
    const sep = field.separador ? ` . '${phpEscape(field.separador)}'` : "";
    out.push(`${indent}if (!empty(${resp}->${campo})) {`);
    out.push(`${indent}${TAB}$dataCampo = ${resp}->${campo};`);
    out.push(...fonte(field.fontSizeDentro, indent + TAB));
    out.push(
      `${indent}${TAB}$pdf->writeHTMLCell(${field.w}, ${field.h}, ${field.x1}, ${field.y}, ${dia}${sep}, 0, 0, 0, true, 'L', true);`,
    );
    out.push(
      `${indent}${TAB}$pdf->writeHTMLCell(${field.w}, ${field.h}, ${field.x2}, ${field.y}, ${mes}${sep}, 0, 0, 0, true, 'L', true);`,
    );
    out.push(
      `${indent}${TAB}$pdf->writeHTMLCell(${field.w}, ${field.h}, ${field.x3}, ${field.y}, ${ano}, 0, 0, 0, true, 'L', true);`,
    );
    out.push(...fonte(field.fontSizeDepois, indent + TAB));
    out.push(`${indent}}`);
    return out;
  }

  if (field.tipo === "hora") {
    out.push(`${indent}if (!empty(${resp}->${campo})) {`);
    out.push(`${indent}${TAB}$partesHora = explode('${phpEscape(field.separador)}', ${resp}->${campo});`);
    out.push(`${indent}${TAB}if (count($partesHora) === 2) {`);
    out.push(
      `${indent}${TAB}${TAB}$pdf->writeHTMLCell(${field.w}, ${field.h}, ${field.x1}, ${field.y}, $partesHora[0], 0, 0, 0, true, 'C', true);`,
    );
    out.push(
      `${indent}${TAB}${TAB}$pdf->writeHTMLCell(${field.w}, ${field.h}, ${field.x2}, ${field.y}, $partesHora[1], 0, 0, 0, true, 'C', true);`,
    );
    out.push(`${indent}${TAB}}`);
    out.push(`${indent}}`);
    return out;
  }

  // opções (X numa das posições)
  const varName = "$valor_" + (campo.replace(/[^a-zA-Z0-9_]/g, "_") || "campo");
  out.push(`${indent}if (isset(${resp}->${campo})) {`);
  out.push(...fonte(field.fontSize, indent + TAB));
  out.push(`${indent}${TAB}${varName} = ${resp}->${campo};`);
  field.opcoes.forEach((o, i) => {
    const kw = i === 0 ? "if" : "} elseif";
    const val = /^-?\d+$/.test(String(o.valor)) ? o.valor : `'${phpEscape(o.valor)}'`;
    out.push(`${indent}${TAB}${kw} (${varName} == ${val}) {`);
    out.push(
      `${indent}${TAB}${TAB}$pdf->writeHTMLCell(${field.w}, ${field.h}, ${o.x}, ${field.y}, '<b>X</b>', 0, 0, 0, true, 'C', true);`,
    );
  });
  out.push(`${indent}${TAB}}`);
  out.push(`${indent}}`);
  return out;
}


/** Sufixo limpo de acentos e espaços, usado nos nomes das funções. */
export function sufixoLimpoDe(texto: string, fallback: string): string {
  return (
    (texto || fallback)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "") || fallback
  );
}

/** `gerarDesenho` + sufixo — o nome como o sistema espera chamar. */
export function nomeFuncaoDe(prefixo: string, sufixo: string, fallback: string): string {
  return prefixo + sufixoLimpoDe(sufixo, fallback);
}
