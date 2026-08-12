// Operações de grupo (mutam page/group) — portadas de checklist_construtor.html
// (regenerateGroup/appendMissingFromQueue/reflowFromSelected/addNewGroup/importMigrationGroups).
// Retornam contagens/resultados; os toasts ficam a cargo dos componentes.

import { makeMarker, nextGenBaseMm, clamp01 } from "./geometry";
import { applyMirrorPlan, captureMirrorPlan } from "./mirror";
import { newGroup, newPage } from "./model";
import { parseMigrationGroups, parseQueueNames } from "./migration-parse";
import { DEFAULT_INC, GROUP_GAP_INCS, contTitleFor, fitCount, renumberSheets } from "./paging";
import type { DesignerGroup, DesignerPage } from "./types";

/** Recria as marcações do grupo a partir da fila. Retorna a quantidade gerada (0 = fila vazia). */
export function regenerateGroup(group: DesignerGroup, page: DesignerPage): number {
  const names = parseQueueNames(group.queue);
  if (names.length === 0) return 0;
  // Onde estavam as linhas de referência: elas não são campos da fila, então regerar as
  // apagaria e obrigaria a remarcá-las (e a reconferir o alinhamento) a cada "Gerar".
  const plan = captureMirrorPlan(group);
  group.markers = names.map((label, i) => makeMarker(group, page, label, group.yStart + i * group.increment));
  applyMirrorPlan(group, page, plan);
  delete group.markersManual; // layout regular de novo
  return names.length;
}

/** Adiciona só os nomes da fila que ainda não viraram marcação. Retorna quantos foram adicionados. */
export function appendMissingFromQueue(group: DesignerGroup, page: DesignerPage): number {
  const names = parseQueueNames(group.queue);
  const used = new Set(group.markers.map((m) => m.label));
  const missing = names.filter((n) => !used.has(n));
  if (missing.length === 0) return 0;
  const baseMm = nextGenBaseMm(group, page);
  missing.forEach((label, k) => group.markers.push(makeMarker(group, page, label, baseMm + k * group.increment)));
  return missing.length;
}

/** Reindexa (reempilha) do marcador selecionado para baixo com o incremento do grupo. */
export function reflowFromSelected(group: DesignerGroup, page: DesignerPage, selectedMarkerId: string | null): boolean {
  const idx = group.markers.findIndex((m) => m.id === selectedMarkerId);
  if (idx === -1) return false;
  const baseMm = group.markers[idx].fy * page.heightMm;
  for (let k = idx; k < group.markers.length; k++) {
    const mm_ = baseMm + (k - idx) * group.increment;
    group.markers[k].fy = clamp01(mm_ / page.heightMm);
  }
  // Reindexar é justamente pedir o espaçamento regular de volta.
  if (idx === 0) delete group.markersManual;
  return true;
}

export function inheritGroupConfig(g: DesignerGroup, src: DesignerGroup, docType: DesignerPage["docType"]): void {
  g.xFixed = src.xFixed;
  g.increment = src.increment;
  if (docType === "revisao") {
    g.colX1 = src.colX1;
    g.colX2 = src.colX2;
    g.colX3 = src.colX3;
    g.colW = src.colW;
    g.colH = src.colH;
    g.textX = src.textX;
    g.textW = src.textW;
    g.textH = src.textH;
    g.textYOffset = src.textYOffset;
    g.dadosVar = src.dadosVar;
  }
  if (docType === "posvenda") {
    if (src.posvendaOpts) g.posvendaOpts = src.posvendaOpts.map((o) => ({ valor: o.valor, label: o.label }));
    if (src.posvendaXMode) g.posvendaXMode = src.posvendaXMode;
    if (src.optX) g.optX = Object.assign({}, src.optX);
    if (src.optW !== undefined) g.optW = src.optW;
    if (src.optH !== undefined) g.optH = src.optH;
    if (src.yFine !== undefined) g.yFine = src.yFine;
  }
}

/** Cria um novo grupo herdando a geometria do último e o empilha após ele. Retorna o grupo criado. */
export function addNewGroup(page: DesignerPage): DesignerGroup {
  const prev = page.groups[page.groups.length - 1];
  const g = newGroup("Grupo " + (page.groups.length + 1), page.docType);
  if (prev) {
    inheritGroupConfig(g, prev, page.docType);
    if (prev.markers.length) {
      const last = prev.markers[prev.markers.length - 1];
      g.yStart = +(last.fy * page.heightMm + prev.increment + 6).toFixed(2);
    } else {
      g.yStart = prev.yStart;
    }
  }
  page.groups.push(g);
  page.activeGroupId = g.id;
  return g;
}

/**
 * Importa campos com títulos em comentário → grupos empilhados.
 * Preserva grupos já posicionados; retorna os grupos criados (ou null se nada reconhecido).
 */
export function importMigrationGroups(
  page: DesignerPage,
  raw: string,
  generateMarkers: boolean
): DesignerGroup[] | null {
  const blocks = parseMigrationGroups(raw);
  if (!blocks.length) return null;
  const kept = page.groups.filter((g) => g.markers.length > 0); // preserva grupos já posicionados
  let anchor: DesignerGroup | null = kept.length ? kept[kept.length - 1] : page.groups[0] || null;
  const inc0 = anchor && anchor.increment ? anchor.increment : 6.13;
  let cursorY: number;
  if (anchor && anchor.markers && anchor.markers.length) {
    cursorY = anchor.markers[anchor.markers.length - 1].fy * page.heightMm + inc0 + 6;
  } else if (anchor) {
    cursorY = anchor.yStart;
  } else {
    cursorY = 60;
  }
  const created: DesignerGroup[] = [];
  blocks.forEach((block) => {
    const g = newGroup(block.title || "Grupo " + (kept.length + created.length + 1), page.docType);
    if (anchor) inheritGroupConfig(g, anchor, page.docType);
    const incG = g.increment || inc0;
    g.yStart = +cursorY.toFixed(2);
    g.queue = block.names.join("\n");
    if (generateMarkers) {
      g.markers = block.names.map((label, i) => makeMarker(g, page, label, g.yStart + i * incG));
    }
    cursorY = g.yStart + Math.max(0, block.names.length - 1) * incG + incG + 6;
    created.push(g);
    anchor = g;
  });
  page.groups = kept.concat(created);
  page.activeGroupId = created[0].id;
  return created;
}

// ─── Importação com quebra automática em folhas ───────────────────────────────
// A quebra é geométrica: acumula a altura dos grupos e vira a folha quando a
// próxima seção não caberia na área útil. Não há informação de página de origem
// vindo do Extrator (MigrationField não carrega esse dado), então o resultado é
// uma estimativa — o y inicial de cada folha ainda pode precisar de ajuste fino.

export interface PagedImportOptions {
  /** Y (mm) da 1ª marcação da 1ª folha. */
  yTop: number;
  /** Y (mm) da 1ª marcação nas folhas 2..N. Ausente = mesmo que yTop.
   *  Existe porque em geral só a 1ª folha tem o cabeçalho do documento; as
   *  seguintes começam mais alto e cabe mais conteúdo nelas. */
  yTopNext?: number;
  /** Y (mm) útil máximo — nenhuma marcação é posicionada além disso. */
  yLimit: number;
  /** Espaço (mm) entre o último item de um grupo e o 1º do seguinte.
   *  Ausente = GROUP_GAP_INCS × incremento. É o parâmetro que mais mexe na
   *  contagem de folhas quando o checklist tem muitas seções. */
  groupGapMm?: number;
  /** Nº de folhas esperado (ex.: imagens de referência do Extrator). Distribui os itens
   *  de forma equilibrada nessa quantidade em vez de encher cada folha até o limite.
   *  A altura útil continua sendo teto: se o alvo não couber, saem mais folhas. */
  targetSheets?: number;
  generateMarkers: boolean;
  /** true = descarta os grupos existentes nas folhas deste docType (importação limpa). */
  replaceExisting?: boolean;
  /** true = NUNCA parte um grupo. Grupo que não cabe vai inteiro para a folha seguinte;
   *  se não cabe nem numa folha vazia, entra inteiro e o estouro é reportado na UI.
   *  Partir é sempre decisão do usuário — o sistema não tem como saber onde o PDF corta. */
  neverSplit?: boolean;
}

export interface PagedImportResult {
  created: DesignerGroup[];
  /** Folhas criadas por esta importação (a folha inicial não entra). */
  pagesCreated: DesignerPage[];
  /** Folhas cujos grupos foram descartados e que ficaram sem conteúdo. */
  pagesEmptied: DesignerPage[];
  /** Total de folhas ocupadas, incluindo a inicial. */
  pagesUsed: number;
  /** Quantos grupos precisaram ser partidos por não caberem em uma folha inteira. */
  splitCount: number;
}

/**
 * Converte os campos de um rascunho do Extrator no formato aceito pelo parser de
 * migration ("//SEÇÃO //" seguido dos nomes), preservando a ordem das seções.
 */
export function draftFieldsToMigrationRaw(fields: { campo: string; secao?: string }[]): string {
  const lines: string[] = [];
  let lastSecao: string | null = null;
  for (const f of fields) {
    const s = (f.secao || "").trim();
    if (s !== lastSecao) {
      if (s) lines.push(`//${s} //`);
      lastSecao = s;
    }
    lines.push(f.campo);
  }
  return lines.join("\n");
}

export interface PlannedGroup {
  title: string;
  names: string[];
  yStart: number;
}

export interface ImportPlan {
  /** Uma entrada por folha; a primeira é a folha atual, as seguintes são novas. */
  sheets: PlannedGroup[][];
  splitCount: number;
  totalGroups: number;
  /** Incremento (mm) herdado do grupo âncora e usado em todo o plano. */
  increment: number;
  /** Alvo pedido (se houve) — a UI compara com sheets.length para avisar divergência. */
  targetSheets?: number;
  /** Itens por folha que o alvo implica. 0 quando não há alvo. */
  itemsPerSheet: number;
}

/**
 * Calcula a distribuição em folhas SEM mutar nada — usado tanto pela prévia na UI
 * quanto por importMigrationGroupsPaged, para que os dois nunca divirjam.
 */
export function planPagedImport(
  page: DesignerPage,
  raw: string,
  opts: {
    yTop: number;
    yTopNext?: number;
    yLimit: number;
    groupGapMm?: number;
    targetSheets?: number;
    replaceExisting?: boolean;
    neverSplit?: boolean;
  }
): ImportPlan | null {
  const blocks = parseMigrationGroups(raw);
  if (!blocks.length) return null;

  // configSrc serve só para herdar a calibração (increment/xFixed/colunas); ele não
  // conta como conteúdo preservado, senão substituir ainda empurraria o cursor.
  const configSrc = page.groups[0] || null;
  const kept = opts.replaceExisting ? [] : page.groups.filter((g) => g.markers.length > 0);
  const anchor = kept.length ? kept[kept.length - 1] : null;
  const inc = (anchor && anchor.increment) || (configSrc && configSrc.increment) || DEFAULT_INC;
  const gap = opts.groupGapMm !== undefined ? opts.groupGapMm : GROUP_GAP_INCS * inc;
  const yTopNext = opts.yTopNext !== undefined ? opts.yTopNext : opts.yTop;

  // Continuando: o cursor retoma depois do conteúdo existente. Substituindo (ou folha
  // sem conteúdo): começa no topo útil.
  let cursorY: number;
  if (anchor && anchor.markers.length) {
    cursorY = anchor.markers[anchor.markers.length - 1].fy * page.heightMm + gap;
  } else if (anchor) {
    cursorY = anchor.yStart;
  } else {
    cursorY = opts.yTop;
  }

  const sheets: PlannedGroup[][] = [[]];
  let hasContent = kept.length > 0; // a folha inicial pode já ter grupos posicionados
  let cur = sheets[0];
  let splitCount = 0;
  let totalGroups = 0;

  // Alvo de folhas: distribui os itens em partes iguais em vez de encher cada folha.
  // A cota é recalculada a cada folha sobre o que ainda falta — com uma cota fixa
  // ceil(total/N) cada folha passava do alvo e o resultado saía com folhas a MENOS.
  const totalItems = blocks.reduce((a, b) => a + b.names.length, 0);
  const target = opts.targetSheets && opts.targetSheets > 0 ? opts.targetSheets : 0;
  const itemsPerSheet = target ? Math.ceil(totalItems / target) : 0;
  let itemsThisSheet = 0;
  let itemsAllocated = 0;
  let sheetIdx = 0;
  // Infinity na última folha do alvo: tudo o que resta vai nela (só a altura limita).
  const computeQuota = (): number => {
    const sheetsLeft = target - sheetIdx;
    if (target <= 0 || sheetsLeft <= 1) return Number.POSITIVE_INFINITY;
    return Math.ceil((totalItems - itemsAllocated) / sheetsLeft);
  };
  let quota = computeQuota();

  // Fila de blocos: um grupo partido devolve o resto para o início da fila.
  const queue = blocks.map((b) => ({ title: b.title, names: b.names.slice(), cont: 0 }));

  let guard = 0;
  while (queue.length) {
    if (++guard > 5000) break; // trava contra parâmetros de área útil inválidos
    const item = queue.shift()!;
    let fits = fitCount(cursorY, inc, opts.yLimit);

    // Não cabe no que resta da folha: vira a folha (só se a atual já tem conteúdo —
    // criar uma folha nova deixando a anterior vazia não faria sentido).
    // Quebra por alvo: esta folha já recebeu a cota que lhe cabia.
    const reachedQuota = itemsThisSheet >= quota;
    if ((fits < item.names.length || reachedQuota) && hasContent) {
      cur = [];
      sheets.push(cur);
      hasContent = false;
      itemsThisSheet = 0;
      sheetIdx++;
      quota = computeQuota();
      cursorY = yTopNext; // folhas 2..N podem começar mais alto que a 1ª
      fits = fitCount(cursorY, inc, opts.yLimit);
    }

    // Não cabe nem em uma folha inteira. Com neverSplit, o grupo entra inteiro e o
    // estouro é reportado — partir é decisão do usuário, nunca do sistema.
    let names = item.names;
    if (fits < names.length && !opts.neverSplit) {
      const take = Math.max(1, fits);
      names = item.names.slice(0, take);
      queue.unshift({ title: item.title, names: item.names.slice(take), cont: item.cont + 1 });
      splitCount++;
    }

    const base = item.title || "Grupo " + (kept.length + totalGroups + 1);
    const title = item.cont === 0 ? base : contTitleFor(base, item.cont);
    cur.push({ title, names, yStart: +cursorY.toFixed(2) });
    hasContent = true;
    totalGroups++;
    itemsThisSheet += names.length;
    itemsAllocated += names.length;
    cursorY = cursorY + Math.max(0, names.length - 1) * inc + gap;
  }

  return {
    sheets,
    splitCount,
    totalGroups,
    increment: inc,
    targetSheets: opts.targetSheets,
    itemsPerSheet,
  };
}

/**
 * Folha onde a importação deve começar. Substituindo: a folha atual. Adicionando: a
 * ÚLTIMA folha com conteúdo — começar na atual sobrescreveria as folhas seguintes e
 * perderia os grupos que estavam nelas.
 */
export function resolveImportStartPage(
  pages: DesignerPage[],
  page: DesignerPage,
  replaceExisting: boolean
): DesignerPage {
  if (replaceExisting) return page;
  const sheets = pages.filter((p) => p.kind === "checklist" && p.docType === page.docType);
  for (let i = sheets.length - 1; i >= 0; i--) {
    if (sheets[i].groups.some((g) => g.markers.length > 0)) return sheets[i];
  }
  return page;
}

/**
 * Cria a folha seguinte do mesmo docType herdando a calibração de `src`.
 * A imagem NÃO é herdada: cada folha do PDF tem o seu próprio JPG de fundo.
 */
export function newSiblingChecklistPage(pages: DesignerPage[], src: DesignerPage): DesignerPage {
  const count = pages.filter((p) => p.kind === "checklist" && p.docType === src.docType).length;
  const p = newPage("Folha " + (count + 1), "checklist", src.docType);
  p.widthMm = src.widthMm;
  p.heightMm = src.heightMm;
  p.offsetX = src.offsetX;
  p.offsetY = src.offsetY;
  p.cellW = src.cellW;
  p.cellH = src.cellH;
  p.markScale = src.markScale;
  p.typeOffsets = { ...src.typeOffsets };
  p.syncCols = src.syncCols;
  p.pushCols = src.pushCols;
  p.chainY = src.chainY;
  p.groups = []; // descarta o "Grupo 1" placeholder de newPage
  p.activeGroupId = null;
  pages.push(p);
  return p;
}

/**
 * Como importMigrationGroups, mas distribui os grupos em várias folhas quando a
 * área útil de uma não é suficiente. Muta `pages` (acrescenta folhas) e as folhas
 * envolvidas. Retorna null se nada foi reconhecido no texto.
 */
export function importMigrationGroupsPaged(
  pages: DesignerPage[],
  page: DesignerPage,
  raw: string,
  opts: PagedImportOptions
): PagedImportResult | null {
  // Adicionando, a importação começa na última folha com conteúdo (não na folha atual),
  // senão as folhas seguintes seriam sobrescritas e seus grupos perdidos.
  const base = resolveImportStartPage(pages, page, !!opts.replaceExisting);
  const plan = planPagedImport(base, raw, opts); // puro: calcula antes de qualquer limpeza
  if (!plan) return null;

  const configSrc = base.groups[0] || page.groups[0] || null; // capturado antes de limpar
  const kept = opts.replaceExisting ? [] : base.groups.filter((g) => g.markers.length > 0);
  let anchor: DesignerGroup | null = kept.length ? kept[kept.length - 1] : configSrc;

  // Substituindo: esvazia os grupos de TODAS as folhas deste docType — sem isso cada
  // reimportação soma aos grupos anteriores e o número de folhas cresce a cada teste.
  const pagesEmptied: DesignerPage[] = [];
  if (opts.replaceExisting) {
    pages
      .filter((p) => p.kind === "checklist" && p.docType === base.docType)
      .forEach((p) => {
        if (p.groups.length) pagesEmptied.push(p);
        p.groups = [];
        p.activeGroupId = null;
      });
  }

  const created: DesignerGroup[] = [];
  const pagesCreated: DesignerPage[] = [];

  // Reaproveita as folhas que já existem a partir da folha atual e cria apenas as que
  // faltarem — criar sempre faria a contagem de folhas crescer a cada reimportação.
  const sheets = pages.filter((p) => p.kind === "checklist" && p.docType === base.docType);
  const startIdx = Math.max(0, sheets.indexOf(base));

  plan.sheets.forEach((planned, sheetIdx) => {
    let target = sheets[startIdx + sheetIdx];
    if (!target) {
      target = newSiblingChecklistPage(pages, sheets[sheets.length - 1]);
      sheets.push(target);
      pagesCreated.push(target);
    }
    const groups: DesignerGroup[] = sheetIdx === 0 ? kept.slice() : [];
    planned.forEach((pg) => {
      const g = newGroup(pg.title, target!.docType);
      if (anchor) inheritGroupConfig(g, anchor, target!.docType);
      const inc = g.increment || plan.increment;
      g.yStart = pg.yStart;
      g.queue = pg.names.join("\n");
      if (opts.generateMarkers) {
        g.markers = pg.names.map((label, i) => makeMarker(g, target!, label, g.yStart + i * inc));
      }
      groups.push(g);
      created.push(g);
      anchor = g;
    });
    target.groups = groups;
    target.activeGroupId = groups.length ? groups[0].id : null;
  });

  if (created.length) base.activeGroupId = created[0].id;
  renumberSheets(pages, base.docType);
  return {
    created,
    pagesCreated,
    // folhas que foram esvaziadas e não voltaram a receber grupos
    pagesEmptied: pagesEmptied.filter((p) => p.groups.length === 0),
    pagesUsed: plan.sheets.length,
    splitCount: plan.splitCount,
  };
}
