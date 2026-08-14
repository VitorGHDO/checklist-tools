// Geração do PHP dos Formulários Gerais — mesmo formato do Plano de Manutenção:
// `imprimirMarcacao<Sufixo>` declarada dentro de `gerarDesenho<Sufixo>`, o objeto de
// respostas chamado `$resposta` e os fundos chegando por parâmetro.
//
// A diferença para o plano está em quem escolhe o X: aqui é a RESPOSTA do item (a coluna
// OK/NOK), então o `if` que decide o X vive dentro da função de marcação e recebe o valor
// gravado. Cada item vira uma chamada só, sem condição em volta.

import { phpEscape } from "./export-php";
import { colunaDoItem } from "./formulario";
import {
  criarFonte,
  fmtNum,
  headerFieldLines,
  nomeFuncaoDe,
  TAB,
} from "./export-cabecalho";
import type { DesignerPage, FormularioConfig, HeaderField, Marker } from "./types";


function sheetsOf(pages: DesignerPage[]): DesignerPage[] {
  return pages.filter((p) => p.kind === "checklist" && p.docType === "formulario");
}

function headerPagesOf(pages: DesignerPage[]): { header?: DesignerPage; footer?: DesignerPage } {
  const hs = pages.filter((p) => p.kind === "header" && p.docType === "formulario");
  return { header: hs.find((p) => !p.footerLike), footer: hs.find((p) => p.footerLike) };
}

export function nomeFuncao(
  prefixo: "gerarDesenho" | "gerarImpressao" | "imprimirMarcacao",
  cfg: FormularioConfig,
): string {
  return nomeFuncaoDe(prefixo, cfg.sufixoFuncao, "Formulario");
}

function fundoVar(i: number): string {
  return i === 0 ? "$fundoBg" : `$fundoBg${i + 1}`;
}

function fundoPathFor(cfg: FormularioConfig, n: number): string {
  const base = cfg.fundoPath.trim();
  if (!base) return "";
  return base.includes("{n}") ? base.replace(/\{n\}/g, String(n)) : base;
}

function varResposta(cfg: FormularioConfig): string {
  const nome = (cfg.varResposta ?? "").trim().replace(/^\$/, "") || "resposta";
  return "$" + nome;
}

/**
 * A função de marcação: recebe o valor gravado e escolhe o X da coluna. É o único lugar
 * do arquivo que conhece as posições — trocar o X de uma coluna mexe numa linha só.
 */
function funcaoMarcacao(cfg: FormularioConfig, indent: string): string[] {
  const nome = nomeFuncao("imprimirMarcacao", cfg);
  const T1 = indent + TAB;
  const T2 = indent + TAB + TAB;
  const T3 = indent + TAB + TAB + TAB;
  const L: string[] = [];
  const w = fmtNum(cfg.celulaW, 2);
  const h = fmtNum(cfg.celulaH, 2);
  L.push(`${indent}function ${nome}($pdf, &$resposta, $y)`);
  L.push(`${indent}{`);
  L.push(`${T1}if (isset($resposta)) {`);
  cfg.colunas.forEach((col, i) => {
    L.push(`${T2}${i === 0 ? "if" : "} elseif"} ($resposta == '${phpEscape(col.valor)}') {`);
    L.push(
      `${T3}$pdf->writeHTMLCell(${w}, ${h}, ${fmtNum(col.x, 2)}, $y, '${phpEscape(cfg.simbolo)}', 0, 0, 0, true, 'C', true); // ${col.label}`,
    );
  });
  L.push(`${T2}}`);
  L.push(`${T1}}`);
  L.push(`${indent}}`);
  return L;
}

function chamadaMarcacao(
  m: Marker,
  page: DesignerPage,
  cfg: FormularioConfig,
  prec: number,
): string {
  const y = fmtNum(m.fy * page.heightMm + (page.offsetY || 0), prec);
  const campo = m.label.trim() || "campo";
  return `${TAB}${nomeFuncao("imprimirMarcacao", cfg)}($pdf, ${varResposta(cfg)}->${campo}, ${y});`;
}

export interface FormularioExportResult {
  code: string;
  avisos: string[];
}

export function generateFormularioFile(
  pages: DesignerPage[],
  cfg: FormularioConfig,
  prec: number,
): FormularioExportResult {
  const sheets = sheetsOf(pages);
  const { header, footer } = headerPagesOf(pages);
  const avisos: string[] = [];

  if (sheets.length === 0) avisos.push("Nenhuma folha de checklist neste formulário.");
  if (cfg.colunas.length === 0) avisos.push("Nenhuma coluna de resultado configurada.");
  if (!cfg.codFormulario.trim())
    avisos.push("codFormulario em branco: a query sai com WHERE codFormulario = ''.");
  const valores = cfg.colunas.map((c) => c.valor.trim());
  if (new Set(valores).size !== valores.length)
    avisos.push("Há colunas com o mesmo valor — só a primeira delas seria impressa.");
  if (valores.some((v) => !v)) avisos.push("Há coluna sem valor: ela nunca casa com a resposta.");

  const desenho = nomeFuncao("gerarDesenho", cfg);
  const impressao = nomeFuncao("gerarImpressao", cfg);
  const fundos = sheets.map((_, i) => fundoVar(i));
  const resp = varResposta(cfg);
  const completo = cfg.formatoArquivo === "completo";

  const L: string[] = [];
  L.push("<?php");

  if (completo) {
    const declaracoes = sheets
      .map((_, i) => ({ v: fundoVar(i), path: fundoPathFor(cfg, i + 1) }))
      .filter((d) => d.path);
    if (declaracoes.length) {
      L.push("");
      declaracoes.forEach((d) => L.push(`${d.v} = ${d.path};`));
    }
  }

  L.push(`function ${desenho}(${resp}, $pdf, ${fundos.join(", ")})`);
  L.push("{");

  const ORDINAIS = ["PRIMEIRA", "SEGUNDA", "TERCEIRA", "QUARTA", "QUINTA", "SEXTA"];
  const fonte = criarFonte();
  sheets.forEach((sheet, i) => {
    const ultima = i === sheets.length - 1;
    L.push("");
    L.push(`${TAB}//====== IMPRESSÃO ${ORDINAIS[i] ?? `FOLHA ${i + 1}`} FOLHA ======`);
    L.push(`${TAB}$pdf->AddPage('P', 'A4');`);
    L.push(`${TAB}$pdf->SetAutoPageBreak(false, 0);`);
    L.push(
      `${TAB}$pdf->Image(${fundoVar(i)}, 0, 0, ${sheet.widthMm}, ${sheet.heightMm}, '', '', '', false, 300, '', false, false, 0);`,
    );
    L.push(`${TAB}$pdf->setPageMark();`);

    const campos = (header?.headerFields ?? []).filter((f: HeaderField) => i === 0 || f.todasFolhas);
    if (campos.length) {
      L.push("");
      campos.forEach((f) => headerFieldLines(f, TAB, fonte, resp).forEach((l: string) => L.push(l)));
    }

    L.push("");
    L.push(`${TAB}$pdf->SetFont('dejavusans', '', 10);`);
    // A função de marcação nasce na 1ª folha, como no modelo do plano.
    if (i === 0) funcaoMarcacao(cfg, TAB).forEach((l) => L.push(l));
    L.push("");

    const comItens = sheet.groups.filter((g) => g.markers.length > 0);
    if (comItens.length === 0) {
      L.push(`${TAB}// (nenhum item nesta folha ainda)`);
    } else {
      comItens.forEach((group, gi) => {
        if (gi > 0) L.push("");
        L.push(`${TAB}//${group.title.toUpperCase()}`);
        group.markers.forEach((m) => L.push(chamadaMarcacao(m, sheet, cfg, prec)));
      });
    }

    if (ultima && footer?.headerFields?.length) {
      L.push("");
      footer.headerFields.forEach((f) => headerFieldLines(f, TAB, fonte, resp).forEach((l: string) => L.push(l)));
    }
  });

  L.push("}");
  L.push("");

  L.push(`function ${impressao}($conexao, $codCheckList, $pdf, ${fundos.join(", ")})`);
  L.push("{");
  L.push(`${TAB}$conexao->sql("`);
  L.push(`${TAB}${TAB}SELECT *`);
  L.push(`${TAB}${TAB}FROM formulario_respostas`);
  L.push(
    `${TAB}${TAB}WHERE codFormulario = '${phpEscape(cfg.codFormulario.trim())}' AND codChecklist = '" . $codCheckList . "'`,
  );
  L.push(`${TAB}");`);
  L.push(`${TAB}$rs = $conexao->query();`);
  L.push(`${TAB}if (mysqli_num_rows($rs) > 0) {`);
  L.push(`${TAB}${TAB}$row = mysqli_fetch_assoc($rs);`);
  L.push(`${TAB}${TAB}$row["dados"] = preg_replace('/[\\r\\n\\t]+/', ' ', trim($row["dados"]));`);
  L.push(`${TAB}${TAB}$resposta = json_decode($row["dados"]);`);
  L.push(`${TAB}${TAB}if (isset($resposta)) {`);
  if (cfg.buscarNomeFantasia) {
    L.push(
      `${TAB}${TAB}${TAB}$conexao->sql("Select nomeFantasia from concessionaria where codConcessionaria = '" . ($resposta->codConcessionaria) . "'");`,
    );
    L.push(`${TAB}${TAB}${TAB}$rs_concessionaria = $conexao->query();`);
    L.push(`${TAB}${TAB}${TAB}$row_concessionaria = mysqli_fetch_assoc($rs_concessionaria);`);
    L.push(`${TAB}${TAB}${TAB}$resposta->nomeFantasia = $row_concessionaria['nomeFantasia'] ?? '';`);
  }
  L.push(`${TAB}${TAB}${TAB}${desenho}($resposta, $pdf, ${fundos.join(", ")});`);
  L.push(`${TAB}${TAB}}`);
  L.push(`${TAB}}`);
  L.push("}");

  return { code: L.join("\n"), avisos };
}

/** Resumo das colunas para a UI: "OK → x 178 · NOK → x 192". */
export function resumoColunas(cfg: FormularioConfig): string {
  return cfg.colunas.map((c) => `${c.label} → x ${c.x}`).join(" · ");
}

/** Usada pelo painel para mostrar em que coluna um item cai. */
export { colunaDoItem };
