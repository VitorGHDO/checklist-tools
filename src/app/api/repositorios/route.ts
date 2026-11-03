// Ajuda a cada dev apontar os repositórios: cada um guarda os projetos num lugar
// (htdocs, www, Área de Trabalho, outro disco). O navegador não entrega o caminho de uma
// pasta escolhida, então quem navega é o servidor — que roda na própria máquina do dev.
//
//   verificar — a pasta existe e tem o marcador do repositório (database/migrations…)?
//   listar    — subpastas de um caminho (sem caminho: os discos) para o seletor de pasta;
//   procurar  — busca os repositórios pelo nome nos lugares de costume.
//
// Só lista nomes de pastas; não lê nem devolve conteúdo de arquivo.

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { outroRepositorio } from "@/lib/repositorio-servidor";

export const runtime = "nodejs";

async function ehPasta(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function subpastas(p: string): Promise<string[]> {
  try {
    const itens = await fs.readdir(p, { withFileTypes: true });
    return itens
      .filter((i) => i.isDirectory() && !i.name.startsWith(".") && !i.name.startsWith("$") && i.name !== "node_modules")
      .map((i) => i.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Discos do Windows (C:/, D:/…) ou a raiz nos outros sistemas. */
async function raizes(): Promise<string[]> {
  if (process.platform !== "win32") return ["/"];
  const discos: string[] = [];
  for (const l of "CDEFGHIJ") if (await ehPasta(`${l}:/`)) discos.push(`${l}:/`);
  return discos;
}

const barra = (p: string) => p.replace(/\\/g, "/");

async function verificar(caminho: string, exigir: string, nome?: string) {
  if (!caminho || !path.isAbsolute(caminho)) return { valido: false, motivo: "informe o caminho completo" };
  if (!(await ehPasta(caminho))) return { valido: false, motivo: "pasta não existe" };
  if (!(await ehPasta(path.join(caminho, ...exigir.split("/"))))) return { valido: false, motivo: `sem ${exigir}` };
  const outro = nome ? await outroRepositorio(caminho, nome) : null;
  if (outro) return { valido: false, motivo: `é o ${outro}, não o ${nome}` };
  return { valido: true, motivo: "" };
}

/** Lugares de costume, até 3 níveis abaixo, atrás de uma pasta com o nome e o marcador. */
async function procurar(alvos: { chave: string; nome: string; exigir: string }[]) {
  const casa = os.homedir();
  const bases = [
    casa,
    path.join(casa, "Desktop"),
    path.join(casa, "Documents"),
    path.join(casa, "projetos"),
    path.join(casa, "Projects"),
    "C:/xampp/htdocs",
    "C:/laragon/www",
    "C:/wamp64/www",
    "/var/www",
    ...(await raizes()),
  ];
  const achados: Record<string, string> = {};
  const vistos = new Set<string>();
  const fila: { p: string; nivel: number }[] = [];
  for (const b of bases) if (await ehPasta(b)) fila.push({ p: path.resolve(b), nivel: 0 });
  let visitadas = 0;
  while (fila.length && visitadas < 4000 && Object.keys(achados).length < alvos.length) {
    const { p, nivel } = fila.shift()!;
    if (vistos.has(p)) continue;
    vistos.add(p);
    visitadas++;
    for (const nome of await subpastas(p)) {
      const filho = path.join(p, nome);
      for (const a of alvos) {
        if (achados[a.chave] || nome.toLowerCase() !== a.nome.toLowerCase()) continue;
        if ((await verificar(filho, a.exigir, a.nome)).valido) achados[a.chave] = barra(filho);
      }
      if (nivel < 2) fila.push({ p: filho, nivel: nivel + 1 });
    }
  }
  return achados;
}

export async function POST(req: NextRequest) {
  let corpo: {
    acao?: string;
    caminho?: string;
    exigir?: string;
    nome?: string;
    alvos?: { chave: string; nome: string; exigir: string }[];
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  if (corpo.acao === "verificar") {
    return NextResponse.json(await verificar((corpo.caminho ?? "").trim(), corpo.exigir ?? "", corpo.nome));
  }

  if (corpo.acao === "listar") {
    const c = (corpo.caminho ?? "").trim();
    if (!c) return NextResponse.json({ caminho: "", pai: null, pastas: await raizes() });
    const abs = path.resolve(c);
    if (!(await ehPasta(abs))) return NextResponse.json({ erro: "Pasta não existe." }, { status: 404 });
    const pai = path.dirname(abs);
    return NextResponse.json({ caminho: barra(abs), pai: pai === abs ? "" : barra(pai), pastas: await subpastas(abs) });
  }

  if (corpo.acao === "procurar") {
    return NextResponse.json({ achados: await procurar(corpo.alvos ?? []) });
  }

  return NextResponse.json({ erro: "Ação desconhecida." }, { status: 400 });
}
