// Geração do PHP do Plano de Manutenção — o arquivo inteiro, no formato do modelo
// Jeep Commander DS 2025: `match` para o X da revisão, a função `imprimirMarcacao<Sufixo>`
// declarada dentro da 1ª folha e as condições como `$quilometragemValida<Nome>` +
// `in_array`. O objeto da resposta chama-se `$resposta` e os fundos chegam por
// parâmetro ($fundoBg, $fundoBg2, ...).
//
// O acesso aos dados é por OBJETO (`$resposta->campo`), diferente dos outros
// docTypes que usam `$dadosChecklist['campo']` — por isso este módulo não
// reaproveita o emissor de cabeçalho do export-php.
//
// A função de marcação recebe o campo POR REFERÊNCIA (`&$resposta`): é o que evita
// o "Undefined property" quando o formulário não tem aquele campo preenchido, sem
// precisar de `?? null` em cada chamada.

import { phpEscape } from "./export-php";
import {
  criarFonte,
  fmtNum,
  headerFieldLines,
  nomeFuncaoDe,
  sufixoLimpoDe,
  TAB,
} from "./export-cabecalho";
import {
  assinaturaMascara,
  cobreTodasAsRevisoes,
  colunaLabel,
  itensDoPlano,
  mascaraDoItem,
  ordenarPorColuna,
  valoresDaColuna,
} from "./manutencao";
import type { DesignerGroup, DesignerPage, ManutencaoConfig, Marker } from "./types";

function sheetsOf(pages: DesignerPage[]): DesignerPage[] {
  return pages.filter((p) => p.kind === "checklist" && p.docType === "manutencao");
}

function headerPagesOf(pages: DesignerPage[]): { header?: DesignerPage; footer?: DesignerPage } {
  const hs = pages.filter((p) => p.kind === "header" && p.docType === "manutencao");
  return {
    header: hs.find((p) => !p.footerLike),
    footer: hs.find((p) => p.footerLike),
  };
}

/** Sufixo limpo de acentos e espaços, usado nos nomes das funções. */
export function sufixoLimpo(cfg: ManutencaoConfig): string {
  return sufixoLimpoDe(cfg.sufixoFuncao, "PlanoManutencao");
}

export function nomeFuncao(
  prefixo: "gerarDesenho" | "gerarImpressao" | "imprimirMarcacao",
  cfg: ManutencaoConfig,
): string {
  return nomeFuncaoDe(prefixo, cfg.sufixoFuncao, "PlanoManutencao");
}

/** $fundoBg, $fundoBg2, $fundoBg3… — a 1ª folha sem número, como no modelo. */
function fundoVar(i: number): string {
  return i === 0 ? "$fundoBg" : `$fundoBg${i + 1}`;
}

function fundoPathFor(cfg: ManutencaoConfig, n: number): string {
  const base = cfg.fundoPath.trim();
  if (!base) return "";
  return base.includes("{n}") ? base.replace(/\{n\}/g, String(n)) : base;
}

// ─── função de marcação ───────────────────────────────────────────────────────

/**
 * Declarada DENTRO de gerarDesenho, na 1ª folha, como no modelo. Aninhada em PHP a
 * função só passa a existir quando a externa roda — imprimir dois planos no mesmo
 * request daria "Cannot redeclare", mas é assim que o sistema usa.
 *
 * O ramo do triângulo (resposta 2) só sai quando algum item do plano o utiliza: no
 * modelo, que só tem ✓ e X, ele não existe.
 */
function funcaoMarcacao(cfg: ManutencaoConfig, indent: string, usaTriangulo: boolean): string[] {
  const nome = nomeFuncao("imprimirMarcacao", cfg);
  const T1 = indent + TAB;
  const T2 = indent + TAB + TAB;
  const T3 = indent + TAB + TAB + TAB;
  const L: string[] = [];
  L.push(`${indent}function ${nome}($pdf, &$resposta, $largura_itens, $y)`);
  L.push(`${indent}{`);
  L.push(`${T1}if (isset($resposta)) {`);
  L.push(`${T2}if ($resposta == 1) {`);
  L.push(`${T3}$pdf->SetFont('dejavusans', '', 10);`);
  L.push(`${T3}$pdf->writeHTMLCell(30, 5, $largura_itens, $y, '✓', 0, 0, 0, true, 'L', true);`);
  L.push(`${T3}$pdf->SetFont('Helvetica', '', 7);`);
  if (usaTriangulo) {
    L.push(`${T2}} elseif ($resposta == 2) {`);
    L.push(`${T3}$pdf->SetFont('dejavusans', '', 10);`);
    L.push(`${T3}$pdf->writeHTMLCell(30, 5, $largura_itens, $y, '▲', 0, 0, 0, true, 'L', true);`);
    L.push(`${T3}$pdf->SetFont('Helvetica', '', 7);`);
  }
  L.push(`${T2}} elseif ($resposta == 3) {`);
  L.push(`${T3}$pdf->writeHTMLCell(30, 5, $largura_itens, $y, '<b>X</b>', 0, 0, 0, true, 'L', true);`);
  L.push(`${T2}}`);
  L.push(`${T1}}`);
  L.push(`${indent}}`);
  return L;
}

// ─── itens ────────────────────────────────────────────────────────────────────

/** Um trecho de itens consecutivos com a MESMA máscara — vira um `if` só. */
interface BlocoItens {
  chave: string;
  markers: Marker[];
}

/** Chave do item na emissão: "*" quando imprime sempre (não vira `if`). */
function chaveDoItem(cfg: ManutencaoConfig, m: Marker): string {
  const mascara = mascaraDoItem(cfg, m);
  return cobreTodasAsRevisoes(cfg, mascara) ? "*" : assinaturaMascara(mascara);
}

function blocosPorMascara(group: DesignerGroup, cfg: ManutencaoConfig): BlocoItens[] {
  const out: BlocoItens[] = [];
  group.markers.forEach((m) => {
    const chave = chaveDoItem(cfg, m);
    const last = out[out.length - 1];
    if (last && last.chave === chave) last.markers.push(m);
    else out.push({ chave, markers: [m] });
  });
  return out;
}

/** `$resposta` — o objeto com as respostas dentro da função de desenho. */
function varResposta(cfg: ManutencaoConfig): string {
  const nome = (cfg.varResposta ?? "").trim().replace(/^\$/, "") || "resposta";
  return "$" + nome;
}

/** Nome PHP válido a partir de um texto qualquer ("24 em 24" → "24_em_24"). */
function slugVar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

/** Uma máscara do plano: onde é declarada, com que nome e quais valores entram na lista. */
interface MascaraEmitida {
  /** Nome da variável, sem o $. */
  nome: string;
  /** Índice da folha onde a lista é declarada — a primeira que a usa. */
  folha: number;
  valores: string[];
}

/**
 * Mapeia cada máscara distinta para uma variável PHP. O nome sai do campo do primeiro
 * item que a usa (`$ignicao_veiculo`), como se escreve à mão; quando a máscara bate com
 * um preset E é compartilhada, o nome do preset ganha, que explica melhor o porquê.
 * Máscaras iguais viram UMA variável — nada de duas listas idênticas.
 */
function mapearMascaras(
  sheets: DesignerPage[],
  cfg: ManutencaoConfig,
): Map<string, MascaraEmitida> {
  const out = new Map<string, MascaraEmitida>();
  const usados = new Set<string>();
  const contagem = new Map<string, number>();

  sheets.forEach((page) =>
    page.groups.forEach((g) =>
      g.markers.forEach((m) => {
        const chave = chaveDoItem(cfg, m);
        contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
      }),
    ),
  );

  const presetPorChave = new Map<string, string>();
  cfg.condicoes.forEach((cond) => {
    const chave = assinaturaMascara(ordenarPorColuna(cfg, cond.colunas));
    if (!presetPorChave.has(chave)) presetPorChave.set(chave, cond.nome);
  });

  sheets.forEach((page, folha) =>
    page.groups.forEach((g) =>
      g.markers.forEach((m) => {
        const mascara = mascaraDoItem(cfg, m);
        if (cobreTodasAsRevisoes(cfg, mascara)) return; // impresso sempre: sem `if` em volta
        if (mascara.length === 0) return; // nada marcado: o item nem é emitido
        const chave = assinaturaMascara(mascara);
        if (out.has(chave)) return;
        const preset = presetPorChave.get(chave);
        const base =
          slugVar(preset && (contagem.get(chave) ?? 0) > 1 ? preset : m.label) || "revisoes";
        let nome = base;
        let n = 2;
        while (usados.has(nome)) nome = `${base}_${n++}`;
        usados.add(nome);
        const valores = mascara
          .map((id) => cfg.colunas.find((c) => c.id === id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .flatMap((c) => valoresDaColuna(c));
        out.set(chave, { nome, folha, valores });
      }),
    ),
  );
  return out;
}

/** Declarações das máscaras desta folha, alinhadas pelo `=` como se escreve à mão. */
function declaracoesDaFolha(mascaras: Map<string, MascaraEmitida>, folha: number): string[] {
  const daFolha = [...mascaras.values()].filter((m) => m.folha === folha);
  if (!daFolha.length) return [];
  const largura = Math.max(...daFolha.map((m) => m.nome.length));
  const out: string[] = [];
  daFolha.forEach((m) => {
    const lista = m.valores.map((v) => `'${phpEscape(v)}'`).join(", ");
    out.push(`${TAB}$${m.nome.padEnd(largura)} = [${lista}];`);
  });
  return out;
}

function chamadaMarcacao(
  m: Marker,
  page: DesignerPage,
  cfg: ManutencaoConfig,
  prec: number,
  indent: string,
): string {
  const y = fmtNum(m.fy * page.heightMm + (page.offsetY || 0), prec);
  const campo = m.label.trim() || "campo";
  const resp = varResposta(cfg);
  return `${indent}${nomeFuncao("imprimirMarcacao", cfg)}($pdf, ${resp}->${campo}, $largura_itens, ${y});`;
}

function itensDaFolha(
  page: DesignerPage,
  cfg: ManutencaoConfig,
  mascaras: Map<string, MascaraEmitida>,
  prec: number,
): string[] {
  const out: string[] = [];
  const comItens = page.groups.filter((g) => g.markers.length > 0);
  if (comItens.length === 0) return [`${TAB}// (nenhum item nesta folha ainda)`];

  comItens.forEach((group, gi) => {
    if (gi > 0) out.push("");
    out.push(`${TAB}//${group.title.toUpperCase()}`);
    blocosPorMascara(group, cfg).forEach((bloco) => {
      // Linha ainda sem nenhuma revisão marcada: em vez de um `if` com lista vazia, que
      // nunca é verdade, fica o rastro do que falta configurar na grade.
      if (bloco.chave === "") {
        bloco.markers.forEach((m) =>
          out.push(`${TAB}// ${m.label.trim() || "campo"}: sem revisão marcada na grade`),
        );
        return;
      }
      const emitida = mascaras.get(bloco.chave);
      if (emitida) {
        out.push(
          `${TAB}if (in_array(${varResposta(cfg)}->${cfg.campoRevisao.trim() || "quilometragem"}, $${emitida.nome})) {`,
        );
        bloco.markers.forEach((m) => out.push(chamadaMarcacao(m, page, cfg, prec, TAB + TAB)));
        out.push(`${TAB}}`);
      } else {
        bloco.markers.forEach((m) => out.push(chamadaMarcacao(m, page, cfg, prec, TAB)));
      }
    });
  });
  return out;
}

// ─── arquivo completo ─────────────────────────────────────────────────────────

export interface ManutencaoExportResult {
  code: string;
  /** Avisos para a UI — nada aqui impede a geração. */
  avisos: string[];
}

export function generateManutencaoFile(
  pages: DesignerPage[],
  cfg: ManutencaoConfig,
  prec: number,
): ManutencaoExportResult {
  const sheets = sheetsOf(pages);
  const { header, footer } = headerPagesOf(pages);
  const avisos: string[] = [];

  if (sheets.length === 0) avisos.push("Nenhuma folha de checklist no plano.");
  if (cfg.colunas.length === 0) avisos.push("Nenhuma coluna de revisão configurada — o match sai vazio.");
  if (!cfg.codFormulario.trim()) avisos.push("codFormulario em branco: a query sai com WHERE codFormulario = ''.");
  cfg.colunas.forEach((c, i) => {
    if (valoresDaColuna(c).length === 0) {
      avisos.push(`Coluna ${c.label || colunaLabel(i)} sem km nem meses — não entra no match.`);
    }
  });

  // Uma variável por máscara distinta, declarada na folha em que aparece pela 1ª vez.
  const mascaras = mapearMascaras(sheets, cfg);
  const semRevisao = itensDoPlano(pages).filter(
    ({ marker }) => mascaraDoItem(cfg, marker).length === 0,
  );
  if (semRevisao.length) {
    avisos.push(
      `${semRevisao.length} item(ns) sem nenhuma revisão marcada na grade — nunca serão impressos: ` +
        semRevisao
          .slice(0, 5)
          .map(({ marker }) => marker.label)
          .join(", ") +
        (semRevisao.length > 5 ? "…" : ""),
    );
  }

  const desenho = nomeFuncao("gerarDesenho", cfg);
  const impressao = nomeFuncao("gerarImpressao", cfg);
  const fundos = sheets.map((_, i) => fundoVar(i));
  const campoRev = cfg.campoRevisao.trim() || "quilometragem";
  const resp = varResposta(cfg);
  // "funcao" é o arquivo que o sistema inclui (funcao_impressao/imprimir.php): as duas
  // funções, sem os caminhos — quem declara os $fundoBg é a página do PDF, que já
  // existe. "completo" declara também, para quando não há página pronta.
  const completo = cfg.formatoArquivo === "completo";
  const params = fundos;
  /** Algum item marca triângulo? Sem isso o ramo `== 2` nem é emitido. */
  const usaTriangulo = sheets.some((p) => p.groups.some((g) => g.markers.some((m) => m.type === "2")));

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

  L.push(`function ${desenho}(${resp}, $pdf, ${params.join(", ")})`);
  L.push("{");

  // match da revisão → X da coluna
  L.push(`${TAB}$km = ${resp}->${campoRev};`);
  L.push(`${TAB}$largura_itens = match ($km) {`);
  cfg.colunas.forEach((col) => {
    const valores = valoresDaColuna(col);
    if (valores.length === 0) return;
    const casos = valores.map((v) => `'${phpEscape(v)}'`).join(", ");
    L.push(`${TAB}${TAB}${casos} => ${col.x},`);
  });
  L.push(`${TAB}${TAB}default => ${cfg.colunas[0]?.x ?? 0},`);
  L.push(`${TAB}};`);

  // folhas
  const ORDINAIS = ["PRIMEIRA", "SEGUNDA", "TERCEIRA", "QUARTA", "QUINTA", "SEXTA", "SÉTIMA", "OITAVA"];
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

    // Cabeçalho: na 1ª folha todos os campos; nas demais só os marcados para repetir.
    const campos = (header?.headerFields ?? []).filter((f) => i === 0 || f.todasFolhas);
    if (campos.length) {
      L.push("");
      campos.forEach((f) => headerFieldLines(f, TAB, fonte, resp).forEach((l) => L.push(l)));
    }

    L.push("");
    fonte(7, TAB).forEach((l) => L.push(l));
    if (i === 0) funcaoMarcacao(cfg, TAB, usaTriangulo).forEach((l) => L.push(l));
    // Cada folha declara as máscaras que ela estreia — perto de onde são lidas.
    const declaracoes = declaracoesDaFolha(mascaras, i);
    if (declaracoes.length) {
      if (L[L.length - 1] !== "") L.push("");
      declaracoes.forEach((l) => L.push(l));
    }
    if (L[L.length - 1] !== "") L.push("");
    itensDaFolha(sheet, cfg, mascaras, prec).forEach((l) => L.push(l));

    if (ultima && footer?.headerFields?.length) {
      L.push("");
      footer.headerFields.forEach((f) => headerFieldLines(f, TAB, fonte, resp).forEach((l) => L.push(l)));
    }
  });

  L.push("}");
  L.push("");

  // função de impressão (busca no banco)
  L.push(`function ${impressao}($conexao, $codCheckList, $pdf, ${params.join(", ")})`);
  L.push("{");
  L.push(`${TAB}$conexao->sql("`);
  L.push(`${TAB}${TAB}SELECT *`);
  L.push(`${TAB}${TAB}FROM formulario_respostas`);
  L.push(`${TAB}${TAB}WHERE codFormulario = '${phpEscape(cfg.codFormulario.trim())}' AND codChecklist = '" . $codCheckList . "'`);
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
  L.push(`${TAB}${TAB}${TAB}${desenho}($resposta, $pdf, ${params.join(", ")});`);
  L.push(`${TAB}${TAB}}`);
  L.push(`${TAB}}`);
  L.push("}");

  return { code: L.join("\n"), avisos };
}
