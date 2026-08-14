// Geradores de código PHP/TCPDF — portados VERBATIM de checklist_construtor.html.
// Qualquer alteração aqui DEVE ser revalidada com o diff byte-a-byte contra o standalone
// (ver scripts/designer-export-parity). Funções puras; recebem pages/page em vez de globais.

import { REVISAO_X_OFFSET, REVISAO_Y_OFFSET } from "./constants";
import { isMirrored, resolveMarkerFields } from "./mirror";
import { criarFonte, headerFieldLines, phpEscape } from "./export-cabecalho";
import { getManutencaoConfig } from "./manutencao";
import { getFormularioConfig } from "./formulario";
import type { DesignerGroup, DesignerPage, HeaderField } from "./types";

export type ExportFmt = "campos" | "y" | "xy";

const MIRROR_NOTE =
  "// linhas de referência: repetem a marcação do item seguinte (rótulo sem resposta própria)";

/**
 * Chamadas avulsas para os rótulos de referência. Necessário sempre que o formato indexa
 * as posições por nome de campo (`'campo' => y`): como o rótulo usa o campo do item
 * seguinte, ele colidiria com a chave dele e o PHP manteria só uma das posições.
 */
function mirrorCallLines(
  group: DesignerGroup,
  fields: string[],
  ys: number[],
  prec: number,
  xArg?: (i: number) => string,
): string[] {
  const out: string[] = [];
  group.markers.forEach((_, i) => {
    if (!isMirrored(group, i)) return;
    if (out.length === 0) out.push(MIRROR_NOTE);
    const pos = xArg ? `${ys[i].toFixed(prec)}, ${xArg(i)}` : ys[i].toFixed(prec);
    out.push(`printChecklistMark($pdf, $dadosChecklist['${phpEscape(fields[i])}'], ${pos});`);
  });
  return out;
}

// Mora em export-cabecalho (junto do resto da emissão), mas segue exportado daqui:
// vários módulos já importavam `phpEscape` deste arquivo.
export { phpEscape };

function formatCamposArray(labels: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < labels.length; i += 6) {
    const chunk = labels
      .slice(i, i + 6)
      .map((l) => `'${phpEscape(l)}'`)
      .join(", ");
    lines.push("\t" + chunk + ",");
  }
  return lines.join("\n");
}

function isDefaultGroupTitle(title: string): boolean {
  const t = String(title || "").trim();
  return /^grupo\s*\d*$/i.test(t) || /^novo grupo$/i.test(t) || /^se[cç][aã]o\s*\d*$/i.test(t);
}

function slugifyVarName(title: string, prefix: string, usedNames: Set<string>): string {
  if (isDefaultGroupTitle(title)) {
    let plain = prefix;
    if (usedNames) {
      let n = plain;
      let i = 2;
      while (usedNames.has(n)) {
        n = plain + i;
        i++;
      }
      usedNames.add(n);
      plain = n;
    }
    return plain;
  }
  let base = String(title || "").trim().split(/\s+/)[0] || "Grupo";
  base = base.normalize("NFD").replace(/[̀-ͯ]/g, "");
  base = base.replace(/[^a-zA-Z0-9]/g, "");
  if (!base) base = "Grupo";
  base = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
  let name = prefix + base;
  if (usedNames) {
    let n = name;
    let i = 2;
    while (usedNames.has(n)) {
      n = name + i;
      i++;
    }
    usedNames.add(n);
    name = n;
  }
  return name;
}

interface BlockResult {
  code: string;
  endY: number | null;
  uniform: boolean;
}

function generateCompactBlockForGroup(
  group: DesignerGroup,
  page: DesignerPage,
  prec: number,
  usedNames: Set<string>,
  chainFrom: number | null
): BlockResult {
  const offX = page.offsetX || 0;
  const offY = page.offsetY || 0;
  const cellHalf = (page.cellH || 5) / 2;
  const isPosvenda = group.docType === "posvenda";
  const posvendaDiff = isPosvenda && group.posvendaXMode === "diff";
  const posvendaCellHalf = (group.optH || 5) / 2;
  const posvendaWHalf = 30 / 2;
  const yFine = isPosvenda ? group.yFine || 0 : 0;
  const ys = group.markers.map((m) => m.fy * page.heightMm - (isPosvenda ? posvendaCellHalf : cellHalf) + offY + yFine);
  const inc = group.increment || 0;
  let uniform = true;
  for (let i = 1; i < ys.length; i++) {
    if (Math.abs(ys[i] - ys[i - 1] - inc) > 0.03) {
      uniform = false;
      break;
    }
  }

  // Campos efetivos: rótulos de referência do roteiro emprestam o campo do item seguinte.
  // Fora do roteiro isto devolve os próprios labels, então nada muda.
  const fields = resolveMarkerFields(group);
  const hasMirror = group.markers.some((_, i) => isMirrored(group, i));

  const lines: string[] = [];
  if (!isDefaultGroupTitle(group.title)) lines.push("/** " + group.title + " */");
  let endY: number | null = null;

  if (isPosvenda) {
    const opts = group.posvendaOpts || [];
    const baseCenter =
      posvendaDiff && opts.length && group.optX && group.optX[opts[0].valor] !== undefined
        ? group.optX[opts[0].valor]
        : group.xFixed;
    const posX = (baseCenter - posvendaWHalf + offX).toFixed(prec);
    group.markers.forEach((m, i) => {
      lines.push(`printMarcacoesChecklist($pdf, $dadosChecklist['${phpEscape(m.label)}'], ${ys[i].toFixed(prec)}, ${posX});`);
    });
    return { code: lines.join("\n"), endY: null, uniform: false };
  }

  if (uniform) {
    const varName = slugifyVarName(group.title, "campos", usedNames);
    // O array é percorrido em ordem com $posY += inc, então o campo repetido imprime a
    // mesma marcação na linha do rótulo e na do item — não precisa de chamada avulsa.
    if (hasMirror) lines.push(MIRROR_NOTE);
    lines.push(`$${varName} = [`);
    lines.push(formatCamposArray(fields));
    lines.push("];");
    if (chainFrom === null || chainFrom === undefined) {
      const posYInicial = (ys[0] - inc).toFixed(prec);
      lines.push(`$posY = ${posYInicial};`);
    } else {
      const gap = ys[0] - inc - chainFrom;
      lines.push(`$posY += ${gap.toFixed(prec)};`);
    }
    lines.push(`foreach ($${varName} as $key => $campo)`);
    lines.push(`\tprintChecklistMark($pdf, $dadosChecklist[$campo], $posY += ${inc.toFixed(prec)});`);
    endY = ys[ys.length - 1];
  } else {
    const varName = slugifyVarName(group.title, "posicoes", usedNames);
    lines.push("// (posições deste grupo não seguem um incremento único — mantido em array explícito)");
    lines.push(`$${varName} = [`);
    group.markers.forEach((m, i) => {
      if (isMirrored(group, i)) return; // sai depois, avulso: a chave colidiria com a do item
      lines.push(`\t'${phpEscape(fields[i])}' => ${ys[i].toFixed(prec)},`);
    });
    lines.push("];");
    lines.push(`foreach ($${varName} as $campo => $y) {`);
    lines.push("\tprintChecklistMark($pdf, $dadosChecklist[$campo], $y);");
    lines.push("}");
    lines.push(...mirrorCallLines(group, fields, ys, prec));
    endY = null;
  }
  return { code: lines.join("\n"), endY, uniform };
}

function generateHeaderFieldCode(field: HeaderField, page: DesignerPage, prec: number): string {
  const offX = page.offsetX || 0;
  const offY = page.offsetY || 0;
  const X = (v: number) => (v + offX).toFixed(prec);
  const Y = (v: number) => (v + offY).toFixed(prec);
  const campo = field.campo || "campo_sem_nome";
  const lines: string[] = [];

  if (field.tipo === "texto") {
    if (field.fontSize) lines.push(`$pdf->SetFont('Helvetica', '', ${field.fontSize});`);
    const alignCode = field.align || "C";
    lines.push(
      `$pdf->writeHTMLCell(${field.w}, ${field.h}, ${X(field.x)}, ${Y(field.y)}, $dadosChecklist['${phpEscape(campo)}'] ?? '', 0, 0, 0, true, '${alignCode}', true);`
    );
  } else if (field.tipo === "assinatura") {
    lines.push(`printSignature($pdf, $dadosChecklist['${phpEscape(campo)}'], ${X(field.x)}, ${Y(field.y)}, ${field.w}, ${field.h});`);
  } else if (field.tipo === "data") {
    const listVars = field.formato === "dmy" ? "$dia, $mes, $ano" : "$ano, $mes, $dia";
    const anoExpr = field.anoDigitos === "4" ? "$ano ?? ''" : "substr($ano, 2, 4) ?? ''";
    lines.push(`if(isset($dadosChecklist['${phpEscape(campo)}'])){`);
    lines.push(`\t$data = $dadosChecklist['${phpEscape(campo)}'];`);
    lines.push(`\t$partes = explode('${phpEscape(field.separador)}', $data);`);
    lines.push("\tif(count($partes) === 3) {");
    lines.push(`\t\tlist(${listVars}) = $partes;`);
    if (field.fontSizeDentro) lines.push(`\t\t$pdf->SetFont('Helvetica', '', ${field.fontSizeDentro});`);
    lines.push(`\t\t$pdf->writeHTMLCell(${field.w}, ${field.h}, ${X(field.x1)}, ${Y(field.y)}, $dia ?? '', 0, 0, 0, true, 'C', true);`);
    lines.push(`\t\t$pdf->writeHTMLCell(${field.w}, ${field.h}, ${X(field.x2)}, ${Y(field.y)}, $mes ?? '', 0, 0, 0, true, 'C', true);`);
    lines.push(`\t\t$pdf->writeHTMLCell(${field.w}, ${field.h}, ${X(field.x3)}, ${Y(field.y)}, ${anoExpr}, 0, 0, 0, true, 'C', true);`);
    if (field.fontSizeDepois) lines.push(`\t\t$pdf->SetFont('Helvetica', '', ${field.fontSizeDepois});`);
    lines.push("\t}");
    lines.push("}");
  } else if (field.tipo === "hora") {
    lines.push(`if(isset($dadosChecklist['${phpEscape(campo)}'])){`);
    lines.push(`\t$dataHora = $dadosChecklist['${phpEscape(campo)}'];`);
    lines.push(`\t$partes = explode('${phpEscape(field.separador)}', $dataHora);`);
    lines.push("\tif(count($partes) === 2) {");
    lines.push("\t\tlist($hora, $minuto) = $partes;");
    lines.push(`\t\t$pdf->writeHTMLCell(${field.w}, ${field.h}, ${X(field.x1)}, ${Y(field.y)}, $hora ?? '', 0, 0, 0, true, 'C', true);`);
    lines.push(`\t\t$pdf->writeHTMLCell(${field.w}, ${field.h}, ${X(field.x2)}, ${Y(field.y)}, $minuto ?? '', 0, 0, 0, true, 'C', true);`);
    lines.push("\t}");
    lines.push("}");
  } else if (field.tipo === "opcoes") {
    const varName = "$valor_" + (campo.replace(/[^a-zA-Z0-9_]/g, "_") || "campo");
    lines.push(`if(isset($dadosChecklist['${phpEscape(campo)}'])){`);
    if (field.fontSize) lines.push(`\t$pdf->SetFont('Helvetica', '', ${field.fontSize});`);
    lines.push(`\t${varName} = $dadosChecklist['${phpEscape(campo)}'];`);
    field.opcoes.forEach((o, i) => {
      const kw = i === 0 ? "if" : "}else if";
      const valLiteral = /^-?\d+$/.test(String(o.valor)) ? o.valor : `'${phpEscape(o.valor)}'`;
      lines.push(`\t${kw}(${varName} == ${valLiteral}){`);
      lines.push(`\t\t$pdf->writeHTMLCell(${field.w}, ${field.h}, ${X(o.x)}, ${Y(field.y)}, '<b>X</b>', 0, 0, 0, true, 'C', true);`);
    });
    lines.push("\t}");
    lines.push("}");
  }

  return lines.join("\n");
}

/**
 * Plano de manutenção e formulários gerais leem a resposta por OBJETO
 * (`$resposta->placa`), não pelo array `$dadosChecklist` dos outros docTypes.
 */
function usaObjetoDeResposta(page: DesignerPage): boolean {
  return page.docType === "manutencao" || page.docType === "formulario";
}

function generateHeaderCode(page: DesignerPage, prec: number, varResposta = "resposta"): string {
  if (!page.headerFields || page.headerFields.length === 0) return "// (nenhum campo de cabeçalho nesta aba)";
  if (usaObjetoDeResposta(page)) {
    // Mesmo emissor que o arquivo desses docTypes usa, para o bloco avulso do cabeçalho
    // sair idêntico ao que aparece dentro de gerarDesenho.
    const fonte = criarFonte();
    const resp = "$" + varResposta.trim().replace(/^\$/, "");
    return page.headerFields.flatMap((f) => headerFieldLines(f, "", fonte, resp)).join("\n");
  }
  return page.headerFields.map((f) => generateHeaderFieldCode(f, page, prec)).join("\n\n");
}

/** Nome do objeto de respostas configurado no docType da página (sem o $). */
function varRespostaDoDocType(pages: DesignerPage[], page: DesignerPage): string {
  if (page.docType === "manutencao") return getManutencaoConfig(pages)?.varResposta || "resposta";
  if (page.docType === "formulario") return getFormularioConfig(pages)?.varResposta || "resposta";
  return "resposta";
}

function pageFundoBgVarName(pages: DesignerPage[], page: DesignerPage): string {
  const checklistPages = pages.filter((p) => p.kind === "checklist" && p.docType === page.docType);
  const idx = checklistPages.indexOf(page);
  if (idx <= 0) return "$fundoBg";
  return "$fundoBg" + (idx + 1);
}

function generatePageSetupBlock(pages: DesignerPage[], page: DesignerPage): string {
  const varName = pageFundoBgVarName(pages, page);
  return [
    "$pdf->AddPage('P', 'A4');",
    "$bMargin = $pdf->getBreakMargin();",
    "$auto_page_break = $pdf->getAutoPageBreak();",
    "$pdf->SetAutoPageBreak(false, 0);",
    `$img_file = ${varName};`,
    "$pdf->Image($img_file, 0, 0, 210, 297, '', '', '', false, 300, '', false, false, 0);",
    "$pdf->setPageMark();",
  ].join("\n");
}

function findXRealForPage(page: DesignerPage): number {
  const cellW = page.cellW || 14.5;
  const g = page.groups.find((g) => g.markers.length > 0);
  if (g) return g.xFixed - cellW / 2;
  return (page.groups[0] ? page.groups[0].xFixed : 189.5) - cellW / 2;
}

function generatePrintChecklistMarkFunction(page: DesignerPage): string {
  const w = page.cellW || 14.5;
  const h = page.cellH || 5;
  const xReal = findXRealForPage(page).toFixed(2);
  const to = page.typeOffsets || { check: 0, x: 0.45, na: 0.74 };
  const offX = to.x !== undefined ? to.x : 0.45;
  const offNa = to.na !== undefined ? to.na : 0.74;
  const offXStr = offX >= 0 ? "+ " + offX : "- " + Math.abs(offX);
  const offNaStr = offNa >= 0 ? "+ " + offNa : "- " + Math.abs(offNa);

  return [
    "function printChecklistMark($pdf, &$question, $height)",
    "{",
    "\t$pdf->SetDrawColor(255, 0, 0); // vermelho",
    "\tif (isset($question)) {",
    "\t\t$pdf->SetFont('Helvetica', '', 14);",
    "\t\tif ($question == 1) {",
    "\t\t\t$pdf->SetFont('ZapfDingbats', '', 16);",
    `\t\t\t$pdf->writeHTMLCell(${w}, ${h}, ${xReal}, $height, chr(51), 0, 0, 0, true, 'C', true);`,
    "\t\t} else if ($question == 2) {",
    `\t\t\t$pdf->writeHTMLCell(${w}, ${h}, ${xReal}, ($height ${offXStr}), '<b>X</b>', 0, 0, 0, true, 'C', true);`,
    "\t\t} else if ($question == 3) {",
    "\t\t\t$pdf->SetFont('Helvetica', '', 12);",
    `\t\t\t$pdf->writeHTMLCell(${w}, ${h}, ${xReal}, ($height ${offNaStr}), '<b>NA</b>', 0, 0, 0, true, 'C', true);`,
    "\t\t}",
    "\t\t$pdf->SetFont('Helvetica', '', 9);",
    "\t}",
    "}",
  ].join("\n");
}

function generatePrintMarcacoesChecklistFunction(page: DesignerPage): string {
  const defaultOpts = [
    { valor: "1", label: "Ok" },
    { valor: "3", label: "N/ Ok" },
    { valor: "0", label: "Não se aplica" },
  ];
  const diffGroup =
    page.groups.find((g) => g.docType === "posvenda" && g.posvendaXMode === "diff" && g.markers.length > 0) ||
    page.groups.find((g) => g.docType === "posvenda" && g.posvendaXMode === "diff");

  if (diffGroup) {
    const opts = diffGroup.posvendaOpts || defaultOpts;
    const optX = diffGroup.optX || {};
    const h = diffGroup.optH || 5;
    const baseCenter = opts.length && optX[opts[0].valor] !== undefined ? optX[opts[0].valor] : 160;
    const lines: string[] = [];
    lines.push("function printMarcacoesChecklist($pdf, $valor, $posY, $posX)");
    lines.push("{");
    opts.forEach((o, i) => {
      const center = optX[o.valor] !== undefined ? optX[o.valor] : 160;
      const off = center - baseCenter;
      const xExpr = Math.abs(off) < 0.005 ? "$posX" : off > 0 ? "$posX + " + off.toFixed(2) : "$posX - " + Math.abs(off).toFixed(2);
      lines.push(`\t${i === 0 ? "if" : "} elseif"} ($valor == '${phpEscape(o.valor)}') {`);
      lines.push(`\t\t$pdf->writeHTMLCell(30, ${h}, ${xExpr}, $posY, '${phpEscape(o.label)}', 0, 0, 0, true, 'C', true);`);
    });
    lines.push("\t}");
    lines.push("}");
    return lines.join("\n");
  }

  const sameGroup =
    page.groups.find((g) => g.docType === "posvenda" && g.markers.length > 0) ||
    page.groups.find((g) => g.docType === "posvenda");
  const opts = (sameGroup && sameGroup.posvendaOpts) || defaultOpts;
  const h = (sameGroup && sameGroup.optH) || 5;
  const lines: string[] = [];
  lines.push("function printMarcacoesChecklist($pdf, $valor, $posY, $posX)");
  lines.push("{");
  opts.forEach((o, i) => {
    lines.push(`\t${i === 0 ? "if" : "} elseif"} ($valor == '${phpEscape(o.valor)}') {`);
    lines.push(`\t\t$pdf->writeHTMLCell(30, ${h}, $posX, $posY, '${phpEscape(o.label)}', 0, 0, 0, true, 'C', true);`);
  });
  lines.push("\t}");
  lines.push("}");
  return lines.join("\n");
}

function generateRevisaoCompactBlockForGroup(
  group: DesignerGroup,
  page: DesignerPage,
  prec: number,
  usedNames: Set<string>,
  chainFrom: number | null
): BlockResult {
  const offY = page.offsetY || 0;
  const cellHalf = (group.colH || 6.3) / 2;
  const ys = group.markers.map((m) => m.fy * page.heightMm - cellHalf + offY + REVISAO_Y_OFFSET);
  const inc = group.increment || 0;
  let uniform = true;
  for (let i = 1; i < ys.length; i++) {
    if (Math.abs(ys[i] - ys[i - 1] - inc) > 0.03) {
      uniform = false;
      break;
    }
  }
  const dadosVar = "$perguntasRespostasImprimir";

  const lines: string[] = [];
  if (!isDefaultGroupTitle(group.title)) lines.push("/** " + group.title + " */");
  let endY: number | null = null;

  if (uniform) {
    const varName = slugifyVarName(group.title, "campos", usedNames);
    lines.push(`$${varName} = [`);
    lines.push(formatCamposArray(group.markers.map((m) => m.label)));
    lines.push("];");
    if (chainFrom === null || chainFrom === undefined) {
      const posYInicial = (ys[0] - inc).toFixed(prec);
      lines.push(`$posY = ${posYInicial};`);
    } else {
      const gap = ys[0] - inc - chainFrom;
      lines.push(`$posY += ${gap.toFixed(prec)};`);
    }
    lines.push(`foreach ($${varName} as $key => $campo)`);
    lines.push(`\timprimirResposta($pdf, ${dadosVar}, $campo, $posY += ${inc.toFixed(prec)});`);
    endY = ys[ys.length - 1];
  } else {
    const varName = slugifyVarName(group.title, "posicoes", usedNames);
    lines.push("// (posições deste grupo não seguem um incremento único — mantido em array explícito)");
    lines.push(`$${varName} = [`);
    group.markers.forEach((m, i) => {
      lines.push(`\t'${phpEscape(m.label)}' => ${ys[i].toFixed(prec)},`);
    });
    lines.push("];");
    lines.push(`foreach ($${varName} as $campo => $y) {`);
    lines.push(`\timprimirResposta($pdf, ${dadosVar}, $campo, $y);`);
    lines.push("}");
    endY = null;
  }
  return { code: lines.join("\n"), endY, uniform };
}

function generateImprimirRespostaFunction(page: DesignerPage): string {
  const g = page.groups.find((g) => g.docType === "revisao" && g.markers.length > 0) || page.groups.find((g) => g.docType === "revisao");
  const colX1 = g && g.colX1 !== undefined ? g.colX1 : 181.75;
  const colX2 = g && g.colX2 !== undefined ? g.colX2 : 189.2;
  const colX3 = g && g.colX3 !== undefined ? g.colX3 : 196.5;
  const colW = (g && g.colW) || 7;
  const colH = (g && g.colH) || 6.3;
  const colHalf = colW / 2;
  const colX1r = (colX1 - colHalf + REVISAO_X_OFFSET).toFixed(2);
  const colX2r = (colX2 - colHalf + REVISAO_X_OFFSET).toFixed(2);
  const colX3r = (colX3 - colHalf + REVISAO_X_OFFSET).toFixed(2);
  const textX = g && g.textX !== undefined ? g.textX : 184;
  const textW = (g && g.textW) || 19;
  const textH = (g && g.textH) || 5;
  const textYOffset = g && g.textYOffset !== undefined ? g.textYOffset : -0.9;

  return [
    "function imprimirResposta($pdf, &$dados, $campo, $posY)",
    "{",
    "\t$dado = isset($dados[$campo]) ? $dados[$campo] : null;",
    "\tif ($dado && isset($dado['resposta']) && isset($dado['tipo'])) {",
    "\t\tif ($dado['resposta'] == '1' && $dado['tipo'] != 'text')",
    `\t\t\t$pdf->writeHTMLCell(${colW}, ${colH}, ${colX1r}, $posY, '<b>X</b>', 0, 0, 0, true, 'R', true);`,
    "\t\tif ($dado['resposta'] == '2' && $dado['tipo'] != 'text')",
    `\t\t\t$pdf->writeHTMLCell(${colW}, ${colH}, ${colX2r}, $posY, '<b>X</b>', 0, 0, 0, true, 'R', true);`,
    "\t\tif ($dado['resposta'] == '0' && $dado['tipo'] != 'text')",
    `\t\t\t$pdf->writeHTMLCell(${colW}, ${colH}, ${colX3r}, $posY, '<b>X</b>', 0, 0, 0, true, 'R', true);`,
    "\t\tif (is_numeric($dado['resposta']) && $dado['tipo'] == 'text') {",
    "\t\t\t$pdf->SetFont('Helvetica', '', 7);",
    `\t\t\t$pdf->writeHTMLCell(${textW}, ${textH}, ${textX}, $posY ${textYOffset >= 0 ? "+ " + textYOffset : "- " + Math.abs(textYOffset)}, $dado['resposta'], 0, 0, 0, true, 'C', true);`,
    "\t\t}",
    "\t\t$pdf->SetFont('Helvetica', '', 9);",
    "\t}",
    "}",
  ].join("\n");
}

export function generateCodeForPage(
  pages: DesignerPage[],
  page: DesignerPage,
  fmt: ExportFmt,
  prec: number,
  includeFuncDef: boolean
): string {
  if (page.kind === "header") return generateHeaderCode(page, prec, varRespostaDoDocType(pages, page));

  const setupBlock = generatePageSetupBlock(pages, page);
  const offX = page.offsetX || 0;
  const offY = page.offsetY || 0;
  const cellHalf = (page.cellH || 5) / 2;
  const cellWHalf = (page.cellW || 14.5) / 2;
  const groupsWithMarkers = page.groups.filter((g) => g.markers.length > 0);

  let body: string;
  if (groupsWithMarkers.length === 0) {
    body = "// (nenhuma marcação nesta página ainda)";
  } else if (page.docType === "revisao") {
    const usedNames = new Set<string>();
    let chainFrom: number | null = null;
    const blocks = groupsWithMarkers.map((g) => {
      const r = generateRevisaoCompactBlockForGroup(g, page, prec, usedNames, chainFrom);
      chainFrom = r.uniform ? r.endY : null;
      return r.code;
    });
    body = blocks.join("\n\n");
  } else if (fmt === "campos") {
    const usedNames = new Set<string>();
    let chainFrom: number | null = null;
    const blocks = groupsWithMarkers.map((g) => {
      const r = generateCompactBlockForGroup(g, page, prec, usedNames, chainFrom);
      chainFrom = r.uniform ? r.endY : null;
      return r.code;
    });
    body = blocks.join("\n\n");
  } else {
    const isPosvendaPage = page.docType === "posvenda";
    const lines: string[] = [];
    const mirrorTail: string[] = [];
    lines.push("$posicoes = [");
    groupsWithMarkers.forEach((g) => {
      const fields = resolveMarkerFields(g);
      const ys = g.markers.map((m) => m.fy * page.heightMm - cellHalf + offY);
      const xOf = (i: number) => ((g.markers[i].fx ?? 0) * page.widthMm - cellWHalf + offX).toFixed(prec);
      lines.push("    // ===== " + g.title + " =====");
      g.markers.forEach((m, i) => {
        // Rótulo de referência: fica fora do array (a chave colidiria com a do item) e
        // sai como chamada avulsa depois do foreach.
        if (isMirrored(g, i)) return;
        const y = ys[i].toFixed(prec);
        if (fmt === "y" && !isPosvendaPage) {
          lines.push(`    '${phpEscape(fields[i])}' => ${y},`);
        } else {
          lines.push(`    '${phpEscape(fields[i])}' => ['x' => ${xOf(i)}, 'y' => ${y}],`);
        }
      });
      mirrorTail.push(
        ...mirrorCallLines(g, fields, ys, prec, fmt === "y" && !isPosvendaPage ? undefined : xOf),
      );
    });
    lines.push("];");
    const usePos = fmt !== "y" || isPosvendaPage;
    lines.push("foreach ($posicoes as $campo => " + (usePos ? "$pos" : "$y") + ") {");
    if (isPosvendaPage) {
      lines.push("    printMarcacoesChecklist($pdf, $dadosChecklist[$campo], $pos['y'], $pos['x']);");
    } else if (fmt === "y") {
      lines.push("    printChecklistMark($pdf, $dadosChecklist[$campo], $y);");
    } else {
      lines.push("    printChecklistMark($pdf, $dadosChecklist[$campo], $pos['y'], $pos['x']);");
    }
    lines.push("}");
    lines.push(...mirrorTail);
    body = lines.join("\n");
  }

  const checklistPages = pages.filter((p) => p.kind === "checklist" && p.docType === page.docType);
  const isFirstChecklistPage = checklistPages.length > 0 && checklistPages[0] === page;
  let funcBlock = "";
  if (isFirstChecklistPage && includeFuncDef) {
    const gen =
      page.docType === "revisao"
        ? generateImprimirRespostaFunction
        : page.docType === "posvenda"
        ? generatePrintMarcacoesChecklistFunction
        : generatePrintChecklistMarkFunction;
    funcBlock = gen(page) + "\n\n";
  }

  return funcBlock + setupBlock + "\n\n" + body;
}

export function generateAllPagesCode(
  pages: DesignerPage[],
  docType: DesignerPage["docType"],
  fmt: ExportFmt,
  prec: number,
  includeFuncDef: boolean
): string {
  const pagesToExport = pages.filter((p) => p.docType === docType);
  const blocks = pagesToExport.map(
    (p) => `// ===== PÁGINA: ${p.name} =====\n` + generateCodeForPage(pages, p, fmt, prec, includeFuncDef)
  );
  return blocks.join("\n\n");
}
