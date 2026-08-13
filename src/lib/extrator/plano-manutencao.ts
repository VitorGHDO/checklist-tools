// Geração do banco para os Planos de Manutenção Programada.
//
// Diferente dos outros checklists em três pontos:
//   - a tabela é `formulario_perguntas` (27 colunas), não `checklist_perguntas`;
//   - onde o checklist tem `status`, o plano tem `pagina` — a regra de numerar é a
//     mesma (índice do grupo + 1) e NÃO existe tabela de status para popular;
//   - não há migration: os campos viram apenas a coluna `campo` das perguntas e as
//     propriedades lidas no PHP do PDF ($resposta_formulario->campo).
//
// A primeira pergunta do formulário é o seletor da revisão (`quilometragem`), cujas
// opções são geradas a partir do número de revisões e dos passos de km/meses.
//
// Módulo puro: sem React, sem DOM.

import type { PerguntaAssociada } from "@/lib/types";
import type { MigrationField } from "@/app/api/generate-fields/route";

// ─── blocos da folha que não são itens ────────────────────────────────────────
// O rodapé "NOTAS" traz as observações do plano ("(1) Itens que devem ser substituídos
// ...") em linhas que a heurística de seção enxerga como cabeçalho e itens. Nada ali é
// campo do formulário nem marcação no PDF, então o bloco é descartado na extração.

const SECOES_IGNORADAS = [/^\s*notas?\s*:?\s*$/i];

/** O título é de um bloco que não vira seção do checklist? */
export function secaoIgnorada(titulo: string | undefined): boolean {
  const t = (titulo ?? "").trim();
  return t.length > 0 && SECOES_IGNORADAS.some((re) => re.test(t));
}

// ─── itens cobrados por km E por tempo ────────────────────────────────────────
// Na folha, operações como "Fluido de freio" ocupam UMA linha com DUAS sub-linhas
// ("Km" e "Meses"), cada uma com marcação e Y próprios. Isso é um campo no PDF e
// dois no banco: <campo>_km e <campo>_tempo, nessa ordem.

export const SUFIXO_KM = "_km";
export const SUFIXO_TEMPO = "_tempo";
const ROTULO_KM = " (KM)";
const ROTULO_TEMPO = " (Tempo)";

/** Índice do par km/tempo que contém `idx`, ou null quando o campo é simples. */
export function parKmTempo(
  fields: MigrationField[],
  idx: number,
): { inicio: number; base: string } | null {
  const campo = fields[idx]?.campo ?? "";
  if (campo.endsWith(SUFIXO_KM)) {
    const base = campo.slice(0, -SUFIXO_KM.length);
    if (fields[idx + 1]?.campo === base + SUFIXO_TEMPO) return { inicio: idx, base };
    return null;
  }
  if (campo.endsWith(SUFIXO_TEMPO)) {
    const base = campo.slice(0, -SUFIXO_TEMPO.length);
    if (fields[idx - 1]?.campo === base + SUFIXO_KM) return { inicio: idx - 1, base };
  }
  return null;
}

function semRotulo(pergunta: string): string {
  return pergunta.replace(/\s*\((KM|Tempo)\)\s*$/i, "");
}

/** Troca o campo por dois: <campo>_km e <campo>_tempo, preservando seção e ordem. */
export function desdobrarKmTempo(fields: MigrationField[], idx: number): MigrationField[] {
  const f = fields[idx];
  if (!f || parKmTempo(fields, idx)) return fields;
  const base = f.campo.replace(/(_km|_tempo)$/i, "");
  const pergunta = semRotulo(f.pergunta);
  const par: MigrationField[] = [
    { ...f, campo: base + SUFIXO_KM, pergunta: pergunta + ROTULO_KM },
    { ...f, campo: base + SUFIXO_TEMPO, pergunta: pergunta + ROTULO_TEMPO },
  ];
  return [...fields.slice(0, idx), ...par, ...fields.slice(idx + 1)];
}

/** Desfaz o par, voltando ao campo único sem sufixo. */
export function juntarKmTempo(fields: MigrationField[], idx: number): MigrationField[] {
  const par = parKmTempo(fields, idx);
  if (!par) return fields;
  const f = fields[par.inicio];
  const unico: MigrationField = { ...f, campo: par.base, pergunta: semRotulo(f.pergunta) };
  return [...fields.slice(0, par.inicio), unico, ...fields.slice(par.inicio + 2)];
}

// ─── modo de cobrança do item ─────────────────────────────────────────────────
// Nem todo item da folha é cobrado nas duas escalas: há os que só têm linha de Km e
// os que só têm linha de Meses. Nesses o campo continua sendo UM — só ganha o sufixo
// que diz qual escala é. Só "ambos" desdobra em duas linhas.

export type ModoKmTempo = "nenhum" | "km" | "tempo" | "ambos";

const RE_SUFIXO = /(_km|_tempo)$/i;

/** Modo atual do campo em `idx`, deduzido do par e do sufixo. */
export function modoKmTempo(fields: MigrationField[], idx: number): ModoKmTempo {
  if (parKmTempo(fields, idx)) return "ambos";
  const campo = (fields[idx]?.campo ?? "").toLowerCase();
  if (campo.endsWith(SUFIXO_KM)) return "km";
  if (campo.endsWith(SUFIXO_TEMPO)) return "tempo";
  return "nenhum";
}

/**
 * Leva o campo em `idx` para `modo`, seja qual for o modo atual. Desfaz o par antes
 * de aplicar, então trocar "ambos" por "km" volta a ser uma linha só, com sufixo.
 */
export function aplicarModoKmTempo(
  fields: MigrationField[],
  idx: number,
  modo: ModoKmTempo,
): MigrationField[] {
  if (modoKmTempo(fields, idx) === modo) return fields;

  // Normaliza para um campo único, sem sufixo e sem rótulo.
  const par = parKmTempo(fields, idx);
  const base = par ? juntarKmTempo(fields, idx) : fields;
  const i = par ? par.inicio : idx;
  const f = base[i];
  if (!f) return fields;
  const campoBase = f.campo.replace(RE_SUFIXO, "");
  const perguntaBase = semRotulo(f.pergunta);

  if (modo === "ambos") {
    const limpo = [...base];
    limpo[i] = { ...f, campo: campoBase, pergunta: perguntaBase };
    return desdobrarKmTempo(limpo, i);
  }

  const unico: MigrationField =
    modo === "km"
      ? { ...f, campo: campoBase + SUFIXO_KM, pergunta: perguntaBase + ROTULO_KM }
      : modo === "tempo"
      ? { ...f, campo: campoBase + SUFIXO_TEMPO, pergunta: perguntaBase + ROTULO_TEMPO }
      : { ...f, campo: campoBase, pergunta: perguntaBase };
  return [...base.slice(0, i), unico, ...base.slice(i + 1)];
}

/** Colunas de `formulario_perguntas`, na ordem do schema. */
export const PLANO_COLUNAS = [
  "id",
  "formulario",
  "pagina",
  "botaoPagina",
  "campo",
  "pergunta",
  "tipo",
  "opcoes",
  "valor",
  "obrigatorio",
  "default",
  "ordem",
  "tamanho",
  "class",
  "grupo",
  "ordemGrupo",
  "titulo",
  "tamanhoGrupo",
  "foto",
  "video",
  "extra",
  "tamanhoCampo",
  "perguntaObrigatorio",
  "valorObrigatorio",
  "oficinaDigital",
  "nivelAcesso",
  "desativado",
] as const;

export interface PlanoManutencaoConfig {
  /** Valor da coluna `formulario` (o "codFormulario" do PHP). */
  formulario: string;
  /** Rótulo do botão de cada página. */
  botaoPagina: string;
  /** Quantas revisões o plano tem. */
  revisoes: number;
  /** km da 1ª revisão; as seguintes são múltiplos dele. */
  kmBase: number;
  /** Meses da 1ª revisão; as seguintes são múltiplos dele. */
  mesesBase: number;
  /** Emitir a pergunta `quilometragem` (o seletor da revisão) antes dos itens. */
  incluirRevisao: boolean;
  campoRevisao: string;
  perguntaRevisao: string;
  grupoRevisao: string;
  tituloRevisao: string;
  ordemGrupoRevisao: number;
  /** ordemGrupo do 1º grupo de itens — os anteriores ficam para dados/revisão. */
  ordemGrupoInicial: number;
}

export function planoConfigPadrao(formulario = ""): PlanoManutencaoConfig {
  return {
    formulario,
    botaoPagina: "Salvar e Continuar",
    revisoes: 12,
    kmBase: 20000,
    mesesBase: 12,
    incluirRevisao: true,
    campoRevisao: "quilometragem",
    perguntaRevisao: "Qual Serviço a ser Realizado?",
    grupoRevisao: "dados_revisao",
    tituloRevisao: "Revisão",
    ordemGrupoRevisao: 2,
    ordemGrupoInicial: 3,
  };
}

/**
 * Opções e valores do seletor de revisão. Cada revisão entra DUAS vezes — por km e
 * por tempo — porque o plano vale pelo que ocorrer primeiro, e é esse par que o PHP
 * do PDF resolve na mesma coluna ("48000" e "48M" caem no mesmo X).
 */
export function opcoesDaRevisao(cfg: PlanoManutencaoConfig): { opcoes: string; valor: string } {
  const opcoes: string[] = [];
  const valor: string[] = [];
  for (let i = 1; i <= Math.max(0, cfg.revisoes); i++) {
    const km = cfg.kmBase * i;
    const meses = cfg.mesesBase * i;
    opcoes.push(`${i}° Revisão - ${km} km`);
    opcoes.push(`${i}° Revisão - ${meses} meses`);
    valor.push(String(km));
    valor.push(String(meses));
  }
  return { opcoes: opcoes.join(";"), valor: valor.join(";") };
}

/** Um valor por coluna de PLANO_COLUNAS. `null` = NULL no banco. */
type Linha = (string | number | null)[];

function linhaDaRevisao(cfg: PlanoManutencaoConfig): Linha {
  const { opcoes, valor } = opcoesDaRevisao(cfg);
  return [
    "", // id: vazio, o auto_increment resolve
    cfg.formulario,
    1, // a revisão fica na 1ª página
    cfg.botaoPagina,
    cfg.campoRevisao,
    cfg.perguntaRevisao,
    "select",
    opcoes,
    valor,
    1,
    null,
    1,
    "col-12",
    null,
    cfg.grupoRevisao,
    cfg.ordemGrupoRevisao,
    cfg.tituloRevisao,
    "col-12",
    0,
    0,
    null,
    255,
    null,
    null,
    0,
    null,
    0,
  ];
}

function linhaDoItem(p: PerguntaAssociada, cfg: PlanoManutencaoConfig): Linha {
  return [
    "", // id: vazio, o auto_increment resolve
    cfg.formulario,
    p.statusIdx + 1, // pagina — mesma regra de numeração do status
    cfg.botaoPagina,
    p.campo,
    p.pergunta,
    p.tipo,
    p.opcoes,
    p.valor,
    p.obrigatorio,
    p.defaultVal ? p.defaultVal : null,
    p.ordem,
    p.tamanho,
    p.classCor ? p.classCor : null,
    p.grupo,
    p.ordemGrupo,
    p.titulo,
    p.tamanhoGrupo,
    p.foto,
    p.video,
    null, // extra (mediumblob)
    p.tamanhoCampo,
    p.perguntaObrigatorio ? p.perguntaObrigatorio : null,
    p.valorObrigatorio ? p.valorObrigatorio : null,
    p.orcamentoDigital,
    null, // nivelAcesso
    p.desativado,
  ];
}

/** Perguntas com página atribuída, na ordem de emissão (página, depois ordem). */
function ordenadas(perguntas: PerguntaAssociada[]): PerguntaAssociada[] {
  return perguntas
    .filter((p) => p.statusIdx >= 0)
    .sort((a, b) => (a.statusIdx !== b.statusIdx ? a.statusIdx - b.statusIdx : a.ordem - b.ordem));
}

/**
 * Linhas para colar no banco: cada valor entre aspas simples, separados por vírgula, e
 * `'[NULL]'` onde a coluna é nula. O `id` sai vazio — quem numera é o auto_increment.
 */
export function buildPlanoDbRows(perguntas: PerguntaAssociada[], cfg: PlanoManutencaoConfig): string {
  const q = (v: string | number | null) =>
    `'${String(v === null ? "[NULL]" : v).replace(/'/g, "''")}'`;
  const linhas: Linha[] = [];
  if (cfg.incluirRevisao) linhas.push(linhaDaRevisao(cfg));
  ordenadas(perguntas).forEach((p) => linhas.push(linhaDoItem(p, cfg)));
  return linhas.map((l) => l.map(q).join(",")).join("\n");
}

function insert(linha: Linha): string {
  const cols: string[] = [];
  const vals: string[] = [];
  PLANO_COLUNAS.forEach((col, i) => {
    if (col === "id") return; // auto_increment
    const v = linha[i];
    if (v === null) return; // NULL: fora do INSERT, o default da coluna resolve
    cols.push(col === "default" ? "`default`" : col);
    vals.push(typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  });
  return `INSERT INTO formulario_perguntas (${cols.join(",")})\n    VALUES (${vals.join(",")});`;
}

export function buildPlanoSql(perguntas: PerguntaAssociada[], cfg: PlanoManutencaoConfig): string {
  const lines: string[] = [
    `-- Plano de Manutenção — formulario ${cfg.formulario || "(sem id)"}`,
    "-- Sem migration e sem tabela de status: a coluna `pagina` numera as páginas.",
    "",
  ];
  if (cfg.incluirRevisao) {
    lines.push("-- Seletor da revisão (o PHP do PDF lê este campo para achar a coluna)");
    lines.push(insert(linhaDaRevisao(cfg)));
    lines.push("");
  }
  let paginaAtual = -1;
  ordenadas(perguntas).forEach((p) => {
    if (p.statusIdx !== paginaAtual) {
      paginaAtual = p.statusIdx;
      lines.push(`-- página ${paginaAtual + 1} — ${p.titulo}`);
    }
    lines.push(insert(linhaDoItem(p, cfg)));
  });
  return lines.join("\n");
}
