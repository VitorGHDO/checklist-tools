// Checklists de pós-venda com COLUNAS DE ETAPA: folhas em que o mesmo item é cobrado mais
// de uma vez na mesma linha, uma marcação por coluna ("ENTRADA" e "SAÍDA" no termo de
// empréstimo de reserva; "RECEPÇÃO"/"MECÂNICO"/"ENTREGA" nas folhas de oficina).
//
// A IA NÃO emite o item uma vez por coluna: ela declara as colunas e marca quais seções se
// repetem. Quem expande é este módulo. O motivo de a expansão ser determinística e não da
// IA: contagem desigual entre etapas (39 campos na entrada e 40 na saída) desalinha o
// mapeamento bloco→status do imprimir.php, que é a armadilha clássica dessas folhas.
//
// Os dois níveis viajam no campo `secao` do MigrationField, como "Entrada > DIANTEIRA":
// a etapa vira `checklist_status` e a seção vira `grupo`/`titulo` em checklist_perguntas.
// Isso evita um campo novo no schema só para carregar a hierarquia.

import type { MigrationField } from "@/lib/types";

/** Separador dos dois níveis dentro de `secao`. Nome de bloco de folha não usa ">". */
export const SEP_ETAPA = " > ";

/** Uma coluna de marcação da tabela — na prática, uma etapa do preenchimento. */
export interface ColunaEtapa {
  /** Sufixo do campo no banco: "entrada" → freio_estacionamento_entrada. */
  sufixo: string;
  /** Rótulo impresso na folha; vira o nome do status e o sufixo da pergunta. */
  label: string;
}

/** Um bloco da folha, já com a informação de repetir ou não entre as colunas. */
export interface SecaoExtraida {
  secao: string;
  /** true = um campo por coluna (a linha tem uma marcação em cada); false = campo único. */
  repete: boolean;
  /** Seção que não repete: a qual etapa ela pertence. Ausente = a primeira coluna. */
  coluna?: string | null;
  itens: { campo: string; pergunta: string }[];
}

export interface EstruturaPosVenda {
  colunas: ColunaEtapa[];
  secoes: SecaoExtraida[];
}

export interface ExpansaoResult {
  fields: MigrationField[];
  /** Campos renomeados por colisão de nome (o que a IA mandou → o que foi gravado). */
  colisoes: { original: string; final: string }[];
}

function slug(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Lê a resposta da IA no formato {colunas, secoes}. Devolve null quando a estrutura não
 * veio reconhecível — aí quem chama cai no parser plano dos outros tipos de checklist.
 */
export function parseEstrutura(parsed: unknown): EstruturaPosVenda | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.secoes)) return null;

  const colunas: ColunaEtapa[] = Array.isArray(obj.colunas)
    ? obj.colunas.flatMap((c) => {
        if (!c || typeof c !== "object") return [];
        const o = c as Record<string, unknown>;
        const sufixo = asStr(o.sufixo);
        return sufixo ? [{ sufixo, label: asStr(o.label) || sufixo }] : [];
      })
    : [];

  const secoes: SecaoExtraida[] = obj.secoes.flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const o = s as Record<string, unknown>;
    const itens = Array.isArray(o.itens)
      ? o.itens.flatMap((it) => {
          if (!it || typeof it !== "object") return [];
          const i = it as Record<string, unknown>;
          const campo = asStr(i.campo);
          const pergunta = asStr(i.pergunta);
          return campo && pergunta ? [{ campo, pergunta }] : [];
        })
      : [];
    if (itens.length === 0) return [];
    return [
      {
        secao: asStr(o.secao),
        repete: o.repete === true,
        coluna: asStr(o.coluna) || null,
        itens,
      },
    ];
  });

  if (secoes.length === 0) return null;
  return { colunas, secoes };
}

/**
 * Expande as seções nas colunas declaradas. A saída sai agrupada POR COLUNA — todos os
 * campos da Entrada, depois todos os da Saída —, que é a ordem em que o app pede as telas:
 * a entrada é preenchida na retirada do veículo e a saída na devolução.
 */
export function expandirEstrutura(est: EstruturaPosVenda): ExpansaoResult {
  const colunas = est.colunas.filter((c) => c.sufixo && c.label);
  const fields: MigrationField[] = [];
  const colisoes: { original: string; final: string }[] = [];
  const usados = new Set<string>();

  // O prompt pede nomes distintos, mas um duplicado chega ao banco como coluna repetida e
  // derruba a migration inteira. Renomear e reportar deixa ver na UI qual item confundiu —
  // o caso típico é "Retrovisores", que aparece igual em LATERAL LE e LATERAL LD.
  const nomeLivre = (base: string, original: string): string => {
    if (!usados.has(base)) {
      usados.add(base);
      return base;
    }
    let n = 2;
    while (usados.has(`${base}_${n}`)) n++;
    const final = `${base}_${n}`;
    usados.add(final);
    colisoes.push({ original, final });
    return final;
  };

  // Sem colunas declaradas a folha é de etapa única: nada de sufixo e nada de hierarquia,
  // o resultado fica igual ao dos outros tipos de checklist.
  if (colunas.length === 0) {
    for (const sec of est.secoes) {
      for (const it of sec.itens) {
        fields.push({
          campo: nomeLivre(slug(it.campo), it.campo),
          pergunta: it.pergunta,
          secao: sec.secao,
        });
      }
    }
    return { fields, colisoes };
  }

  const padrao = slug(colunas[0].sufixo);
  for (const col of colunas) {
    const atual = slug(col.sufixo);
    for (const sec of est.secoes) {
      // Seção que repete entra em todas as colunas; a que não repete entra só na dona.
      if (!sec.repete && (slug(sec.coluna ?? "") || padrao) !== atual) continue;
      for (const it of sec.itens) {
        const base = slug(it.campo);
        fields.push({
          campo: nomeLivre(sec.repete ? `${base}_${atual}` : base, it.campo),
          pergunta: sec.repete ? `${it.pergunta} (${col.label})` : it.pergunta,
          secao: `${col.label}${SEP_ETAPA}${sec.secao}`,
        });
      }
    }
  }
  return { fields, colisoes };
}

/** Quebra um `secao` expandido nos dois níveis. Sem separador, a etapa vem vazia. */
export function partesDaSecao(secao: string): { etapa: string; grupo: string } {
  const s = secao ?? "";
  const i = s.indexOf(SEP_ETAPA);
  if (i < 0) return { etapa: "", grupo: s.trim() };
  return { etapa: s.slice(0, i).trim(), grupo: s.slice(i + SEP_ETAPA.length).trim() };
}

/** Etapas na ordem em que aparecem nos campos — viram os status do checklist. */
export function etapasDosCampos(fields: MigrationField[]): string[] {
  const vistas: string[] = [];
  for (const f of fields) {
    const { etapa } = partesDaSecao(f.secao ?? "");
    if (etapa && !vistas.includes(etapa)) vistas.push(etapa);
  }
  return vistas;
}

/**
 * Um grupo por seção distinta, na ordem em que aparecem nos campos. Cada grupo vira uma
 * linha de `checklist_status`, ou seja, uma tela do app — por isso a seção não pode ser
 * só um subtítulo: 40 itens numa tela só não é folha de conferência, é rolagem infinita.
 *
 * O rótulo sai idêntico ao `secao` do campo de propósito: é a chave que o casamento
 * campo→grupo usa. Renomear o grupo na UI depois não quebra nada, porque a associação
 * já foi feita.
 */
export function gruposDasSecoes(
  fields: MigrationField[],
): { id: string; name: string; questions: string[] }[] {
  const porSecao = new Map<string, string[]>();
  for (const f of fields) {
    const secao = (f.secao ?? "").trim();
    if (!secao) continue;
    const lista = porSecao.get(secao);
    if (lista) lista.push(f.pergunta);
    else porSecao.set(secao, [f.pergunta]);
  }
  return Array.from(porSecao.entries(), ([name, questions], i) => ({
    id: `sec-${i}`,
    name,
    questions,
  }));
}
