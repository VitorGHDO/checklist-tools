// Só no servidor (rotas nodejs): lê o disco.

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Nome do repositório pelo remote do git, quando ele NÃO é o esperado; null quando confere
 * ou não dá para saber (sem .git, sem remote). As duas APIs (stellantis-ei-api e
 * acampa-api-lumen) são Lumen com as mesmas pastas: só o remote separa uma da outra.
 */
export async function outroRepositorio(raiz: string, esperado: string): Promise<string | null> {
  let config: string;
  try {
    config = await fs.readFile(path.join(raiz, ".git", "config"), "utf8");
  } catch {
    return null;
  }
  const nomes = [...config.matchAll(/^\s*url\s*=\s*(.+)$/gm)].map((m) =>
    m[1].trim().replace(/\.git$/, "").split(/[/:\\]/).pop()!.toLowerCase()
  );
  if (!nomes.length || nomes.includes(esperado.toLowerCase())) return null;
  return nomes[0];
}
