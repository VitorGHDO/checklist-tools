// Gravação nos repositórios locais pelo navegador: chama /api/gravar-repositorio, pede
// confirmação quando algum arquivo já existe e lembra o caminho de cada repositório.
// Só browser (fetch, confirm, localStorage).

import type { ArquivoParaGravar } from "@/app/api/gravar-repositorio/route";

export type { ArquivoParaGravar };

/** Os repositórios com que o extrator e o Designer conversam. */
export const REPOSITORIOS = {
  /** API do Entrega Impecável (migrations). */
  eiApi: { rotulo: "stellantis-ei-api", padrao: "C:/xampp/htdocs/stellantis-ei-api", exigir: "database/migrations" },
  /** API do pós-venda (migrations). */
  acampaApi: { rotulo: "acampa-api-lumen", padrao: "C:/xampp/htdocs/acampa-api-lumen", exigir: "database/migrations" },
  /** imprimir.php do Entrega Impecável. */
  eiChecklist: { rotulo: "stellantis-ei-checklist", padrao: "C:/xampp/htdocs/stellantis-ei-checklist", exigir: "stellantis" },
  /** imprimir.php do pós-venda e dos planos. */
  acampaChecklist: { rotulo: "acampa-checklist", padrao: "C:/xampp/htdocs/acampa-checklist", exigir: "tools/checklist" },
} as const;

export type ChaveRepositorio = keyof typeof REPOSITORIOS;

const CHAVE = (k: ChaveRepositorio) => `repositorio.${k}`;

export function caminhoDoRepositorio(k: ChaveRepositorio): string {
  try {
    return localStorage.getItem(CHAVE(k)) || REPOSITORIOS[k].padrao;
  } catch {
    return REPOSITORIOS[k].padrao;
  }
}

export function lembrarRepositorio(k: ChaveRepositorio, caminho: string): void {
  try {
    localStorage.setItem(CHAVE(k), caminho.trim());
  } catch {
    /* sem armazenamento: só não lembra o caminho */
  }
}

export interface ResultadoGravacao {
  raiz: string;
  arquivos: string[];
}

/**
 * Grava os arquivos. Devolve null quando o usuário recusou sobrescrever; lança com a
 * mensagem do servidor quando algo deu errado.
 */
export async function gravarNoRepositorio(
  k: ChaveRepositorio,
  repo: string,
  arquivos: ArquivoParaGravar[],
): Promise<ResultadoGravacao | null> {
  lembrarRepositorio(k, repo);
  const enviar = (sobrescrever: boolean) =>
    fetch("/api/gravar-repositorio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: repo.trim(), exigir: REPOSITORIOS[k].exigir, arquivos, sobrescrever }),
    }).then(async (r) => ({ status: r.status, corpo: await r.json() }));

  let r = await enviar(false);
  if (r.status === 409 && r.corpo.conflito) {
    const ok = confirm(`Estes arquivos já existem e serão substituídos:\n\n${r.corpo.conflito.join("\n")}\n\nContinuar?`);
    if (!ok) return null;
    r = await enviar(true);
  }
  if (!r.corpo.ok) throw new Error(r.corpo.erro ?? "Não consegui gravar no repositório.");
  return { raiz: r.corpo.raiz, arquivos: r.corpo.arquivos };
}

export interface SkillInstalada {
  nome: string;
  estado: "instalada" | "atualizada" | "igual";
}

/**
 * Põe no repositório as skills que o comando do Claude Code usa, na versão da ferramenta
 * (checklist-tools/skills). Sem isso, um dev que nunca as teve recebe "comando desconhecido".
 */
export async function instalarSkills(k: ChaveRepositorio, repo: string): Promise<SkillInstalada[]> {
  const r = await fetch("/api/instalar-skills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: repo.trim(), chave: k }),
  }).then((x) => x.json());
  if (!r.ok) throw new Error(r.erro ?? "Não consegui instalar as skills.");
  return r.skills as SkillInstalada[];
}

/** "checklist-designer instalada · checklist-pdf-marcacoes já em dia" */
export function resumoSkills(skills: SkillInstalada[]): string {
  return skills
    .map((s) => `${s.nome} ${s.estado === "igual" ? "já em dia" : s.estado}`)
    .join(" · ");
}

/** Prefixo datado do Laravel: 2026_10_30_181502. */
export function prefixoMigration(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}_${p(d.getMonth() + 1)}_${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
