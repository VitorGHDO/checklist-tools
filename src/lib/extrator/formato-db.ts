// Conversão do Formato DB (o de colar na grade do DBeaver) para a escrita do MySQL.
//
// A grade usa TAB entre colunas, aspas duplas em volta de cada valor e o literal
// "[NULL]" onde a coluna é nula. O MySQL quer aspas simples, vírgula, NULL sem aspas e
// `?` na coluna de blob. Converter a saída pronta — em vez de duplicar os três geradores
// (roteiro, revisão e IPE montam as mesmas 34 colunas) — mantém as duas escritas sempre
// com o mesmo conteúdo: mexer numa coluna do gerador reflete nas duas.

/**
 * `checklist_perguntas` na ordem do banco. O Formato DB emite da 2ª à 35ª — `id` é
 * auto_increment e `iconeGrupo` não é preenchido pela extração —, então o MySQL completa
 * as duas pontas: id vazio na frente, iconeGrupo nulo no fim.
 */
export const COLUNAS_CHECKLIST_PERGUNTAS = [
  "id", "checklist", "status", "campo", "pergunta", "tipo", "opcoes", "valor",
  "obrigatorio", "default", "query", "ordem", "tamanho", "selecione", "class", "grupo",
  "ordemGrupo", "titulo", "tamanhoGrupo", "boasvindas", "editavel", "foto", "video",
  "audio", "extra", "utilizacao", "orcamentoDigital", "oportunidades", "tamanhoCampo",
  "perguntaObrigatorio", "valorObrigatorio", "esconderPerguntas", "esconderQuando",
  "perguntaEsconderQuando", "desativado", "iconeGrupo",
] as const;

/** Quantas colunas o Formato DB traz: tudo menos `id` e `iconeGrupo`. */
export const COLUNAS_DA_PLANILHA = COLUNAS_CHECKLIST_PERGUNTAS.length - 2;

/** Índice (0-based) da coluna `extra` dentro da planilha, que no MySQL vira `?`. */
export const INDICE_EXTRA = COLUNAS_CHECKLIST_PERGUNTAS.indexOf("extra") - 1;

/** Valor nulo no formato da grade. */
const NULO = "[NULL]";

/** Desfaz o encapsulamento da grade: "a""b" → a"b. */
function celulaCrua(celula: string): string {
  const t = celula.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return t;
}

export interface OpcoesMysql {
  /** Emite uma 1ª coluna vazia para o id auto_increment. */
  idVazio?: boolean;
  /** Posição da coluna de blob; -1 desliga o `?`. */
  indiceExtra?: number;
  /** Valores acrescentados no fim — por padrão o `iconeGrupo`, que a extração não preenche. */
  sufixo?: string[];
}

/**
 * Uma linha do formato MySQL a partir de uma linha do formato da grade. Sem parênteses e
 * sem `INSERT`: é o miolo do VALUES, que é como o arquivo do sistema traz.
 */
export function linhaParaMysql(linha: string, opts: OpcoesMysql = {}): string {
  const { idVazio = true, indiceExtra = INDICE_EXTRA, sufixo = ["NULL"] } = opts;
  const valores = linha.split("\t").map(celulaCrua);
  const saida = valores.map((v, i) => {
    if (i === indiceExtra) return "?";
    if (v === NULO) return "NULL";
    return `'${v.replace(/'/g, "''")}'`;
  });
  if (idVazio) saida.unshift("''");
  saida.push(...sufixo);
  return saida.join(", ");
}

/**
 * Linhas cuja contagem de colunas não bate com a tabela. Um INSERT com coluna a mais ou a
 * menos só falha no banco, e o número da linha é o que permite achar a pergunta culpada.
 */
export function linhasComContagemErrada(planilha: string): number[] {
  const fora: number[] = [];
  planilha.split("\n").forEach((l, i) => {
    if (l.trim().length === 0) return;
    if (l.split("\t").length !== COLUNAS_DA_PLANILHA) fora.push(i + 1);
  });
  return fora;
}

/** O bloco inteiro, linha a linha, preservando a ordem. */
export function paraMysql(planilha: string, opts: OpcoesMysql = {}): string {
  return planilha
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => linhaParaMysql(l, opts))
    .join("\n");
}
