// Instala (ou atualiza) no repositório de destino as skills que o comando "enviar para o
// Claude Code" usa. As skills moram VERSIONADAS no checklist-tools (pasta skills/<chave>/),
// porque o .claude dos repositórios não vai para o git e cada dev ficaria sem elas: quem
// usa a ferramenta recebe a versão dela em <repo>/.claude/skills/ na hora de enviar.
//
// Só grava arquivo que mudou; a cópia da ferramenta é a oficial — editar a skill no
// repositório de destino é sobrescrito no próximo envio (mude em checklist-tools/skills).

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { REPOSITORIOS, type ChaveRepositorio } from "@/lib/repositorio";

export const runtime = "nodejs";

async function arquivos(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...(await arquivos(p)));
    else if (!item.name.startsWith(".") && item.name !== "__pycache__") out.push(p);
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

  const origem = path.join(process.cwd(), "skills", chave);
  let lista: string[];
  try {
    lista = await arquivos(origem);
  } catch {
    return NextResponse.json({ ok: true, skills: [] }); // nenhuma skill para este repositório
  }

  // por skill: quantos arquivos não existiam, quantos mudaram e quantos havia
  const conta = new Map<string, { novos: number; mudados: number; total: number }>();
  for (const arq of lista) {
    const rel = path.relative(origem, arq);
    const skill = rel.split(path.sep)[0];
    const destino = path.join(raiz, ".claude", "skills", rel);
    const novo = await fs.readFile(arq);
    const atual = await ler(destino);
    const c = conta.get(skill) ?? { novos: 0, mudados: 0, total: 0 };
    c.total++;
    if (!atual) c.novos++;
    else if (!atual.equals(novo)) c.mudados++;
    if (!atual || !atual.equals(novo)) {
      await fs.mkdir(path.dirname(destino), { recursive: true });
      await fs.writeFile(destino, novo);
    }
    conta.set(skill, c);
  }

  const skills = [...conta].map(([nome, c]) => ({
    nome,
    estado: c.novos === c.total ? "instalada" : c.novos || c.mudados ? "atualizada" : "igual",
  }));
  return NextResponse.json({ ok: true, skills });
}
