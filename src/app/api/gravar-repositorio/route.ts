// Grava arquivos num repositório local: a migration no repositório da API, as artes e o
// código na pasta do checklist, o pacote do pós-venda. O Designer e o extrator rodam na
// máquina do usuário, então a rota escreve direto no disco.
//
// Cuidados: o repositório tem de ter a pasta que o identifica (`exigir`: database/migrations
// numa API, parvi_frota/v1 no acampa-checklist…) e, havendo remote no git, o nome dele confere; todo caminho é relativo, sem "..", e
// resolve dentro do repositório; nada é sobrescrito sem o usuário confirmar (409 lista o
// que já existe). Migration é só gravada — rodar continua com o usuário.

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { outroRepositorio } from "@/lib/repositorio-servidor";

export const runtime = "nodejs";

export interface ArquivoParaGravar {
  /** Relativo à raiz do repositório, com "/". */
  caminho: string;
  /** Conteúdo de texto (código, JSON)… */
  texto?: string;
  /** …ou uma imagem em data URL (as artes). */
  dataUrl?: string;
}

interface Entrada {
  repo: string;
  /** Pasta que precisa existir no repositório para ele ser o certo. */
  exigir: string;
  /** Nome esperado no remote do git (as duas APIs têm as mesmas pastas). */
  nome?: string;
  arquivos: ArquivoParaGravar[];
  sobrescrever?: boolean;
}

/** Segmentos com letras, números, "_", "-" e "."; sem "..", sem barra no começo. */
const CAMINHO_VALIDO = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

async function existe(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function erro(mensagem: string, status = 400) {
  return NextResponse.json({ ok: false, erro: mensagem }, { status });
}

export async function POST(req: NextRequest) {
  let entrada: Entrada;
  try {
    entrada = (await req.json()) as Entrada;
  } catch {
    return erro("Corpo inválido.");
  }
  const { repo, exigir, nome, arquivos, sobrescrever } = entrada;

  if (!repo || !path.isAbsolute(repo)) return erro("Informe o caminho completo do repositório.");
  const raiz = path.resolve(repo);
  if (!exigir || !(await existe(path.join(raiz, ...exigir.split("/"))))) {
    return erro(`"${repo}" não parece o repositório certo (não achei ${exigir}).`);
  }
  const outro = nome ? await outroRepositorio(raiz, nome) : null;
  if (outro) return erro(`"${repo}" é o ${outro}, não o ${nome}.`);
  if (!Array.isArray(arquivos) || arquivos.length === 0) return erro("Nada para gravar.");

  const destinos: { abs: string; rel: string; a: ArquivoParaGravar }[] = [];
  for (const a of arquivos) {
    const rel = (a.caminho ?? "").replace(/\\/g, "/");
    if (!CAMINHO_VALIDO.test(rel) || rel.split("/").some((s) => s === "." || s === "..")) {
      return erro(`Caminho inválido: "${a.caminho}".`);
    }
    const abs = path.resolve(raiz, ...rel.split("/"));
    if (!abs.startsWith(raiz + path.sep)) return erro(`Caminho fora do repositório: "${a.caminho}".`);
    if (a.texto === undefined && !a.dataUrl) return erro(`Sem conteúdo: "${a.caminho}".`);
    destinos.push({ abs, rel, a });
  }

  const existentes: string[] = [];
  for (const d of destinos) if (await existe(d.abs)) existentes.push(d.rel);
  if (existentes.length && !sobrescrever) {
    return NextResponse.json({ ok: false, conflito: existentes }, { status: 409 });
  }

  for (const { abs, rel, a } of destinos) {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    if (a.dataUrl) {
      const m = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(a.dataUrl);
      if (!m) return erro(`"${rel}" não veio como imagem.`);
      await fs.writeFile(abs, Buffer.from(m[1], "base64"));
    } else {
      await fs.writeFile(abs, a.texto!, "utf8");
    }
  }

  return NextResponse.json({
    ok: true,
    raiz: raiz.replace(/\\/g, "/"),
    arquivos: destinos.map((d) => d.rel),
  });
}
