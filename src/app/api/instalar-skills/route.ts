// Instala (ou atualiza) no repositório de destino as skills que o comando "enviar para o
// Claude Code" usa. As skills moram VERSIONADAS no checklist-tools (pasta skills/<chave>/),
// porque o .claude dos repositórios não vai para o git e cada dev ficaria sem elas: quem
// usa a ferramenta recebe a versão dela em <repo>/.claude/skills/ na hora de enviar.
//
// Junto vão as ferramentas que a skill chama na raiz do repositório (scripts de medição,
// doc de apoio), e o .gitignore do repositório passa a ignorar tudo isso — é bancada
// de trabalho, não código do checklist.
//
// Só grava arquivo que mudou; a cópia da ferramenta é a oficial — editar no repositório
// de destino é sobrescrito no próximo envio (mude em checklist-tools).

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { REPOSITORIOS, type ChaveRepositorio } from "@/lib/repositorio";
import { outroRepositorio } from "@/lib/repositorio-servidor";

export const runtime = "nodejs";

interface Ferramentas {
  /** Pasta do checklist-tools → pasta relativa à raiz do repositório. */
  copias: { de: string; para: string }[];
  /** Entradas que o .gitignore do repositório precisa ter. */
  ignorar: string[];
}

// O que a skill de cada repositório usa fora de .claude/skills.
const FERRAMENTAS: Partial<Record<ChaveRepositorio, Ferramentas>> = {
  acampaChecklist: {
    copias: [
      { de: "tools/medicao", para: "tools/checklist" },
      { de: "skills/_raiz/acampaChecklist/docs", para: "docs" },
    ],
    ignorar: ["tools/checklist/", "docs/novo-checklist-pos-venda.md"],
  },
};

/** Ignorado em todo repositório que recebe skill. */
const IGNORAR_SEMPRE = [".claude/", "__pycache__/"];

async function arquivos(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== "__pycache__") out.push(...(await arquivos(p)));
    } else if (!item.name.startsWith(".")) out.push(p);
  }
  return out;
}

async function ler(p: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(p);
  } catch {
    return null;
  }
}

type Estado = "instalada" | "atualizada" | "igual";

/**
 * Copia `origem` para `destino` gravando só o que mudou. `chaveDe` agrupa os arquivos
 * (a skill a que pertencem); o estado sai por grupo.
 */
async function copiar(
  origem: string,
  destino: string,
  chaveDe: (rel: string) => string
): Promise<Map<string, Estado>> {
  const conta = new Map<string, { novos: number; mudados: number; total: number }>();
  for (const arq of await arquivos(origem)) {
    const rel = path.relative(origem, arq);
    const alvo = path.join(destino, rel);
    const novo = await fs.readFile(arq);
    const atual = await ler(alvo);
    const k = chaveDe(rel);
    const c = conta.get(k) ?? { novos: 0, mudados: 0, total: 0 };
    c.total++;
    if (!atual) c.novos++;
    else if (!atual.equals(novo)) c.mudados++;
    if (!atual || !atual.equals(novo)) {
      await fs.mkdir(path.dirname(alvo), { recursive: true });
      await fs.writeFile(alvo, novo);
    }
    conta.set(k, c);
  }
  return new Map(
    [...conta].map(([k, c]) => [k, c.novos === c.total ? "instalada" : c.novos || c.mudados ? "atualizada" : "igual"])
  );
}

/** Acrescenta ao .gitignore as entradas que faltam, num bloco comentado. Devolve as acrescentadas. */
async function completarGitignore(raiz: string, entradas: string[]): Promise<string[]> {
  const arq = path.join(raiz, ".gitignore");
  const atual = (await ler(arq))?.toString("utf8") ?? "";
  const sem = (s: string) => s.trim().replace(/^\//, "").replace(/\/$/, "");
  const tem = new Set(atual.split(/\r?\n/).map(sem));
  const faltam = entradas.filter((e) => !tem.has(sem(e)));
  if (!faltam.length) return [];
  const eol = atual.includes("\r\n") ? "\r\n" : "\n";
  const bloco = [`# checklist-tools: skills e ferramentas do "Enviar para o Claude Code"`, ...faltam].join(eol);
  const sep = !atual ? "" : atual.endsWith("\n") ? eol : eol + eol;
  await fs.writeFile(arq, atual + sep + bloco + eol);
  return faltam;
}

export async function POST(req: NextRequest) {
  const { repo, chave } = (await req.json()) as { repo?: string; chave?: ChaveRepositorio };
  if (!chave || !REPOSITORIOS[chave]) return NextResponse.json({ ok: false, erro: "Repositório desconhecido." }, { status: 400 });
  if (!repo || !path.isAbsolute(repo)) return NextResponse.json({ ok: false, erro: "Informe o caminho do repositório." }, { status: 400 });
  const raiz = path.resolve(repo);
  const marcador = path.join(raiz, ...REPOSITORIOS[chave].exigir.split("/"));
  const ehRepo = await fs.stat(marcador).then((s) => s.isDirectory()).catch(() => false);
  if (!ehRepo) {
    return NextResponse.json({ ok: false, erro: `"${repo}" não parece o ${REPOSITORIOS[chave].rotulo}.` }, { status: 400 });
  }
  const outro = await outroRepositorio(raiz, REPOSITORIOS[chave].rotulo);
  if (outro) {
    return NextResponse.json({ ok: false, erro: `"${repo}" é o ${outro}, não o ${REPOSITORIOS[chave].rotulo}.` }, { status: 400 });
  }

  const origem = path.join(process.cwd(), "skills", chave);
  const temSkills = await fs.stat(origem).then((s) => s.isDirectory()).catch(() => false);
  if (!temSkills) return NextResponse.json({ ok: true, skills: [] }); // nenhuma skill para este repositório

  const skills: { nome: string; estado: Estado }[] = [];
  const instaladas = await copiar(origem, path.join(raiz, ".claude", "skills"), (rel) => rel.split(path.sep)[0]);
  instaladas.forEach((estado, nome) => skills.push({ nome, estado }));

  const extra = FERRAMENTAS[chave];
  for (const c of extra?.copias ?? []) {
    const r = await copiar(path.join(process.cwd(), ...c.de.split("/")), path.join(raiz, ...c.para.split("/")), () => c.para);
    r.forEach((estado, nome) => skills.push({ nome, estado }));
  }

  const acrescentadas = await completarGitignore(raiz, [...IGNORAR_SEMPRE, ...(extra?.ignorar ?? [])]);
  skills.push({ nome: ".gitignore", estado: acrescentadas.length ? "atualizada" : "igual" });

  return NextResponse.json({ ok: true, skills, gitignore: acrescentadas });
}
