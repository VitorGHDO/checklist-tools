// Parsing de nomes de campo / grupos a partir de texto de migration — portado de
// checklist_construtor.html. Puro.

export function parseQueueNames(raw: string): string[] {
  return String(raw || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => {
      let m = l.match(/integer\(\s*["']([^"']+)["']\s*\)/);
      if (m) return m[1];
      m = l.match(/^["']([^"']+)["']/);
      if (m) return m[1];
      return l.replace(/[",;]+$/, "").replace(/^["']|["']$/g, "");
    });
}

export function extractMigrationFieldName(line: string): string | null {
  const t = line.trim();
  let m = t.match(/->\s*\w+\s*\(\s*["']?([A-Za-z0-9_]+)/); // $table->integer('campo'
  if (m) return m[1];
  m = t.match(/^["']([A-Za-z0-9_]+)["']?[,;]*$/); // 'campo' | "campo"
  if (m) return m[1];
  m = t.match(/^([A-Za-z0-9_]+)[,;]*$/); // campo
  if (m) return m[1];
  return null;
}

export function extractMigrationTitle(t: string): string {
  // remove marcadores de comentário no início (// # /* *) e no fim (// */ #)
  let s = t.trim();
  s = s.replace(/^\s*(\/\/+|#+|\/\*+|\*+)\s*/, "");
  s = s.replace(/\s*(\/\/+|\*+\/|#+)\s*$/, "");
  return s.trim();
}

export interface MigrationBlock {
  title: string;
  names: string[];
}

export function parseMigrationGroups(raw: string): MigrationBlock[] {
  const lines = String(raw || "").split("\n");
  const groups: MigrationBlock[] = [];
  let current: MigrationBlock | null = null;
  lines.forEach((line) => {
    const t = line.trim();
    if (!t) return;
    const isComment = /^(\/\/|#|\/\*|\*)/.test(t);
    if (isComment) {
      const title = extractMigrationTitle(t);
      if (title === "") return; // comentário vazio: ignora
      current = { title, names: [] };
      groups.push(current);
    } else {
      const name = extractMigrationFieldName(t);
      if (!name) return;
      if (!current) {
        current = { title: "", names: [] };
        groups.push(current);
      }
      current.names.push(name);
    }
  });
  return groups.filter((g) => g.names.length > 0); // descarta títulos sem campos
}
