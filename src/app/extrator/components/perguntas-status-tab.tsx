"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  RefreshCw,
  AlertCircle,
  EyeOff,
  Database,
} from "lucide-react";
import { showToast } from "@/components/ui/toast";
import type { PerguntaAssociada } from "@/lib/types";
import type { MigrationField } from "@/app/api/generate-fields/route";

interface WorkingGroup {
  id: string;
  baseLabel: string;
  questions: string[];
}

interface Props {
  groups: WorkingGroup[];
  fields: MigrationField[];
  checklistId: string;
}

const TIPOS = [
  "radio", "text", "select", "hidden", "datahora", "date", "number",
  "textarea", "email", "tel", "cpfxcnpj", "datahora_inicio_status", "datahora_fim_status",
];

const TAMANHOS = ["col-12", "col-8", "col-6", "col-4"];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function makeDefaults(
  campo: string,
  pergunta: string,
  statusIdx: number,
  ordem: number,
  grupo: string,
  titulo: string,
  ordemGrupo: number,
  idSuffix: string,
): PerguntaAssociada {
  return {
    id: idSuffix,
    campo,
    pergunta,
    statusIdx,
    tipo: "radio",
    opcoes: "Explicado;Não Explicado;N/A",
    valor: "1;2;3",
    obrigatorio: 1,
    defaultVal: "",
    query: "",
    ordem,
    tamanho: "col-12",
    selecione: "",
    classCor: "green;red",
    grupo,
    ordemGrupo,
    titulo,
    tamanhoGrupo: "col-12",
    boasvindas: 0,
    editavel: 1,
    foto: 1,
    video: 1,
    audio: 0,
    extra: null,
    utilizacao: "1;2;3;4;5;6;7;8",
    orcamentoDigital: 0,
    oportunidades: 0,
    tamanhoCampo: 250,
    perguntaObrigatorio: "",
    valorObrigatorio: "",
    esconderPerguntas: 0,
    esconderQuando: null,
    perguntaEsconderQuando: null,
    desativado: 0,
  };
}

function buildAssociation(groups: WorkingGroup[], fields: MigrationField[]): PerguntaAssociada[] {
  const result: PerguntaAssociada[] = [];
  const matchedIdx = new Set<number>();

  groups.forEach((group, gIdx) => {
    const grupo = slugify(group.baseLabel);
    const titulo = group.baseLabel;
    const ordemGrupo = gIdx + 1;

    group.questions.forEach((question, qIdx) => {
      let fi = fields.findIndex((f, i) => !matchedIdx.has(i) && f.pergunta === question);
      if (fi === -1) {
        const norm = question.trim().toLowerCase();
        fi = fields.findIndex((f, i) => !matchedIdx.has(i) && f.pergunta.trim().toLowerCase() === norm);
      }
      const campo = fi >= 0 ? fields[fi].campo : slugify(question);
      if (fi >= 0) matchedIdx.add(fi);
      result.push(makeDefaults(campo, question, gIdx, qIdx + 1, grupo, titulo, ordemGrupo, `g${gIdx}-q${qIdx}`));
    });
  });

  fields.forEach((field, i) => {
    if (!matchedIdx.has(i)) {
      result.push(makeDefaults(field.campo, field.pergunta, -1, 1, "", "", 0, `unmatched-${i}`));
    }
  });

  return result;
}

function buildDbRows(perguntas: PerguntaAssociada[], checklistId: string): string {
  const id = parseInt(checklistId || "217");
  const q = (val: string | number | null) => {
    if (val === null) return '"[NULL]"';
    return `"${String(val).replace(/"/g, '""')}"`;
  };
  const assigned = perguntas
    .filter((p) => p.statusIdx >= 0)
    .sort((a, b) => a.statusIdx !== b.statusIdx ? a.statusIdx - b.statusIdx : a.ordem - b.ordem);
  return assigned
    .map((p) =>
      [
        q(id), q(p.statusIdx + 1), q(p.campo), q(p.pergunta), q(p.tipo),
        q(p.opcoes), q(p.valor), q(p.obrigatorio), q(p.defaultVal), q(p.query),
        q(p.ordem), q(p.tamanho), q(p.selecione), q(p.classCor), q(p.grupo),
        q(p.ordemGrupo), q(p.titulo), q(p.tamanhoGrupo), q(p.boasvindas),
        q(p.editavel), q(p.foto), q(p.video), q(p.audio), q(p.extra),
        q(p.utilizacao), q(p.orcamentoDigital), q(p.oportunidades),
        q(p.tamanhoCampo), q(p.perguntaObrigatorio), q(p.valorObrigatorio),
        q(p.esconderPerguntas), q(p.esconderQuando), q(p.perguntaEsconderQuando),
        q(p.desativado),
      ].join("\t")
    )
    .join("\n");
}

function buildSqlInsert(p: PerguntaAssociada, checklistId: string): string {
  const id = parseInt(checklistId || "217");
  const statusNum = p.statusIdx >= 0 ? p.statusIdx + 1 : 0;
  const esc = (s: string) => s.replace(/'/g, "''");
  const cols: string[] = [];
  const vals: string[] = [];
  const push = (col: string, val: string) => { cols.push(col); vals.push(val); };

  push("checklist", String(id));
  push("status", String(statusNum));
  push("campo", `'${esc(p.campo)}'`);
  push("pergunta", `'${esc(p.pergunta)}'`);
  push("tipo", `'${esc(p.tipo)}'`);
  if (p.opcoes !== null) push("opcoes", `'${esc(p.opcoes)}'`);
  if (p.valor !== null) push("valor", `'${esc(p.valor)}'`);
  push("obrigatorio", `'${p.obrigatorio}'`);
  if (p.defaultVal !== null) push("`default`", `'${esc(p.defaultVal)}'`);
  push("query", `'${esc(p.query)}'`);
  push("ordem", String(p.ordem));
  push("tamanho", `'${p.tamanho}'`);
  push("selecione", `'${esc(p.selecione)}'`);
  push("class", `'${esc(p.classCor)}'`);
  push("grupo", `'${esc(p.grupo)}'`);
  push("ordemGrupo", String(p.ordemGrupo));
  push("titulo", `'${esc(p.titulo)}'`);
  push("tamanhoGrupo", `'${p.tamanhoGrupo}'`);
  push("boasvindas", String(p.boasvindas));
  push("editavel", String(p.editavel));
  push("foto", String(p.foto));
  push("video", String(p.video));
  push("audio", String(p.audio));
  if (p.extra !== null) push("extra", p.extra);
  push("utilizacao", `'${p.utilizacao}'`);
  push("orcamentoDigital", String(p.orcamentoDigital));
  push("oportunidades", String(p.oportunidades));
  push("tamanhoCampo", String(p.tamanhoCampo));
  if (p.perguntaObrigatorio !== null) push("perguntaObrigatorio", `'${esc(p.perguntaObrigatorio)}'`);
  if (p.valorObrigatorio !== null) push("valorObrigatorio", `'${esc(p.valorObrigatorio)}'`);
  push("esconderPerguntas", String(p.esconderPerguntas));
  if (p.esconderQuando !== null) push("esconderQuando", `'${p.esconderQuando}'`);
  if (p.perguntaEsconderQuando !== null) push("perguntaEsconderQuando", `'${esc(p.perguntaEsconderQuando)}'`);
  push("desativado", String(p.desativado));

  return `INSERT INTO checklist_perguntas (${cols.join(",")})\n    VALUES (${vals.join(",")});`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface PerguntaCardProps {
  pergunta: PerguntaAssociada;
  allGroups: WorkingGroup[];
  posInGroup: number;
  totalInGroup: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<PerguntaAssociada>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChangeStatus: (statusIdx: number) => void;
}

function PerguntaCard({
  pergunta: p,
  allGroups,
  posInGroup,
  totalInGroup,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onChangeStatus,
}: PerguntaCardProps) {
  const isCompacto = p.esconderQuando === 2;
  const hasOpcoes = ["radio", "select"].includes(p.tipo);

  return (
    <div className="px-4 py-3 space-y-2 hover:bg-[#FAFAFA] transition-colors">
      {/* Row 1: reorder + campo + compacto toggle + expand */}
      <div className="flex items-center gap-2">
        <div className="flex flex-col flex-shrink-0">
          <button
            onClick={onMoveUp}
            disabled={posInGroup === 0}
            className="p-0.5 text-[#b0b0bf] hover:text-[#464E5F] disabled:opacity-20 transition-colors"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={posInGroup >= totalInGroup - 1}
            className="p-0.5 text-[#b0b0bf] hover:text-[#464E5F] disabled:opacity-20 transition-colors"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
        <span className="text-xs text-[#b0b0bf] font-mono w-4 text-right flex-shrink-0">{p.ordem}</span>
        <input
          type="text"
          value={p.campo}
          onChange={(e) => onUpdate({ campo: e.target.value })}
          className="flex-1 min-w-0 bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs font-mono text-[#0BB783] focus:outline-none focus:ring-1 focus:ring-[#0BB783]/40 transition-colors"
          placeholder="nome_do_campo"
        />
        <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0 select-none">
          <input
            type="checkbox"
            checked={isCompacto}
            onChange={(e) => onUpdate({ esconderQuando: e.target.checked ? 2 : null })}
            className="rounded border-[#d0d0d0] accent-[#FFB822]"
          />
          <span className="text-xs text-[#80808F]">Compacto</span>
          {isCompacto && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-[#FFB822]/15 text-[#FFB822] rounded text-xs font-semibold">
              <EyeOff className="w-3 h-3" />
            </span>
          )}
        </label>
        <button
          onClick={onToggleExpand}
          className="flex-shrink-0 p-1 rounded hover:bg-[#e8e8e8] text-[#80808F] transition-colors"
          title={isExpanded ? "Recolher" : "Expandir opções"}
        >
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Row 2: pergunta text */}
      <p className="text-xs text-[#80808F] pl-10 leading-relaxed line-clamp-2">{p.pergunta}</p>

      {/* Expanded editing panel */}
      {isExpanded && (
        <div className="pl-10 pt-2 space-y-3 border-t border-[#f0f0f0] mt-2">
          {/* tamanho */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#80808F] w-20 flex-shrink-0">tamanho</label>
            <div className="flex gap-1 flex-wrap">
              {TAMANHOS.map((t) => (
                <button
                  key={t}
                  onClick={() => onUpdate({ tamanho: t })}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                    p.tamanho === t
                      ? "bg-[#8950FC] text-white border-[#8950FC]"
                      : "bg-white text-[#80808F] border-[#d0d0d0] hover:border-[#8950FC]/50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* tipo */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#80808F] w-20 flex-shrink-0">tipo</label>
            <select
              value={p.tipo}
              onChange={(e) => {
                const tipo = e.target.value;
                const patch: Partial<PerguntaAssociada> = { tipo };
                if (tipo === "radio") {
                  patch.opcoes = "Explicado;Não Explicado;N/A";
                  patch.valor = "1;2;3";
                  patch.classCor = "green;red";
                } else if (["text", "textarea", "hidden", "email", "tel", "cpfxcnpj", "datahora", "date", "number"].includes(tipo)) {
                  patch.opcoes = null;
                  patch.valor = null;
                  patch.classCor = "";
                }
                onUpdate(patch);
              }}
              className="bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs text-[#464E5F] focus:outline-none focus:ring-1 focus:ring-[#8950FC]/40"
            >
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* opcoes / valor */}
          {hasOpcoes && (
            <>
              <div className="flex items-center gap-3">
                <label className="text-xs text-[#80808F] w-20 flex-shrink-0">opcoes</label>
                <input
                  type="text"
                  value={p.opcoes ?? ""}
                  onChange={(e) => onUpdate({ opcoes: e.target.value || null })}
                  className="flex-1 bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs font-mono text-[#464E5F] focus:outline-none focus:ring-1 focus:ring-[#8950FC]/40"
                  placeholder="Sim;Não;N/A"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-[#80808F] w-20 flex-shrink-0">valor</label>
                <input
                  type="text"
                  value={p.valor ?? ""}
                  onChange={(e) => onUpdate({ valor: e.target.value || null })}
                  className="flex-1 bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs font-mono text-[#464E5F] focus:outline-none focus:ring-1 focus:ring-[#8950FC]/40"
                  placeholder="1;2;3"
                />
              </div>
            </>
          )}

          {/* toggles — pill buttons */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#80808F] w-20 flex-shrink-0">flags</label>
            <div className="flex gap-1.5">
              <button
                onClick={() => onUpdate({ obrigatorio: p.obrigatorio === 1 ? 0 : 1 })}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  p.obrigatorio === 1
                    ? "bg-[#ED3237]/10 text-[#ED3237] border-[#ED3237]/40"
                    : "bg-white text-[#b0b0bf] border-[#e0e0e0] hover:text-[#80808F] hover:border-[#c0c0c0]"
                }`}
              >
                Obrigatório
              </button>
              <button
                onClick={() => onUpdate({ foto: p.foto === 1 ? 0 : 1 })}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  p.foto === 1
                    ? "bg-[#22B9FF]/10 text-[#22B9FF] border-[#22B9FF]/40"
                    : "bg-white text-[#b0b0bf] border-[#e0e0e0] hover:text-[#80808F] hover:border-[#c0c0c0]"
                }`}
              >
                Foto
              </button>
              <button
                onClick={() => onUpdate({ video: p.video === 1 ? 0 : 1 })}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  p.video === 1
                    ? "bg-[#22B9FF]/10 text-[#22B9FF] border-[#22B9FF]/40"
                    : "bg-white text-[#b0b0bf] border-[#e0e0e0] hover:text-[#80808F] hover:border-[#c0c0c0]"
                }`}
              >
                Vídeo
              </button>
            </div>
          </div>

          {/* status reassignment */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#80808F] w-20 flex-shrink-0">mover para</label>
            <select
              value={p.statusIdx}
              onChange={(e) => onChangeStatus(Number(e.target.value))}
              className="bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs text-[#464E5F] focus:outline-none focus:ring-1 focus:ring-[#8950FC]/40"
            >
              <option value={-1}>— Não associada —</option>
              {allGroups.map((g, i) => (
                <option key={i} value={i}>{i + 1}. {g.baseLabel}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

interface GroupSectionProps {
  group: WorkingGroup;
  statusIdx: number;
  perguntas: PerguntaAssociada[];
  allGroups: WorkingGroup[];
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onUpdate: (id: string, patch: Partial<PerguntaAssociada>) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onChangeStatus: (id: string, newIdx: number) => void;
  onUpdateGroupField: (statusIdx: number, field: "grupo" | "titulo" | "ordemGrupo", value: string | number) => void;
  firstGrupo: string;
  firstTitulo: string;
  firstOrdemGrupo: number;
}

function GroupSection({
  group,
  statusIdx,
  perguntas,
  allGroups,
  expandedIds,
  onToggleExpand,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onChangeStatus,
  onUpdateGroupField,
  firstGrupo,
  firstTitulo,
  firstOrdemGrupo,
}: GroupSectionProps) {
  const [collapsed, setCollapsed] = useState(true);
  const compactoCount = perguntas.filter((p) => p.esconderQuando === 2).length;

  return (
    <div className="border border-[#e0e0e0] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-[#8950FC]/5 border-b border-[#e0e0e0] px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-0.5 text-[#8950FC] transition-transform"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "" : "rotate-180"}`} />
          </button>
          <span className="w-6 h-6 rounded-full bg-[#8950FC] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
            {statusIdx + 1}
          </span>
          <span className="text-sm font-semibold text-[#464E5F] flex-1 truncate">{group.baseLabel}</span>
          <span className="text-xs text-[#80808F] flex-shrink-0">{perguntas.length} pergunta{perguntas.length !== 1 ? "s" : ""}</span>
          {compactoCount > 0 && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-[#FFB822]/15 text-[#FFB822] rounded text-xs font-semibold flex-shrink-0">
              <EyeOff className="w-3 h-3" />
              {compactoCount}
            </span>
          )}
        </div>
        {/* Group metadata inputs */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-8">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[#80808F] whitespace-nowrap">grupo:</label>
            <input
              type="text"
              value={firstGrupo}
              onChange={(e) => onUpdateGroupField(statusIdx, "grupo", e.target.value)}
              className="w-36 bg-white border border-[#d0d0d0] rounded px-2 py-0.5 text-xs font-mono text-[#464E5F] focus:outline-none focus:ring-1 focus:ring-[#8950FC]/40"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[#80808F] whitespace-nowrap">titulo:</label>
            <input
              type="text"
              value={firstTitulo}
              onChange={(e) => onUpdateGroupField(statusIdx, "titulo", e.target.value)}
              className="w-56 bg-white border border-[#d0d0d0] rounded px-2 py-0.5 text-xs text-[#464E5F] focus:outline-none focus:ring-1 focus:ring-[#8950FC]/40"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[#80808F] whitespace-nowrap">ordemGrupo:</label>
            <input
              type="number"
              value={firstOrdemGrupo}
              onChange={(e) => onUpdateGroupField(statusIdx, "ordemGrupo", Number(e.target.value))}
              className="w-14 bg-white border border-[#d0d0d0] rounded px-2 py-0.5 text-xs text-center text-[#464E5F] focus:outline-none focus:ring-1 focus:ring-[#8950FC]/40"
            />
          </div>
        </div>
      </div>

      {/* Question cards */}
      {!collapsed && (
        <div className="divide-y divide-[#f0f0f0]">
          {perguntas.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[#80808F]">
              Nenhuma pergunta neste status
            </div>
          ) : (
            perguntas.map((p, idx) => (
              <PerguntaCard
                key={p.id}
                pergunta={p}
                allGroups={allGroups}
                posInGroup={idx}
                totalInGroup={perguntas.length}
                isExpanded={expandedIds.has(p.id)}
                onToggleExpand={() => onToggleExpand(p.id)}
                onUpdate={(patch) => onUpdate(p.id, patch)}
                onMoveUp={() => onMoveUp(p.id)}
                onMoveDown={() => onMoveDown(p.id)}
                onChangeStatus={(idx2) => onChangeStatus(p.id, idx2)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PerguntasStatusTab({ groups, fields, checklistId }: Props) {
  const [perguntas, setPerguntas] = useState<PerguntaAssociada[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showDb, setShowDb] = useState(false);
  const [dbOutput, setDbOutput] = useState("");
  const [showSql, setShowSql] = useState(false);
  const [sqlOutput, setSqlOutput] = useState("");

  useEffect(() => {
    if (groups.length === 0 || fields.length === 0) return;

    if (!initialized) {
      setPerguntas(buildAssociation(groups, fields));
      setInitialized(true);
      return;
    }

    // Sync incremental changes to migrationFields after initialization
    setPerguntas((prev) => {
      const fieldPerguntas = new Set(fields.map((f) => f.pergunta));
      const existingPerguntas = new Set(prev.map((p) => p.pergunta));

      // Remove entries whose pergunta text no longer exists in fields
      let next = prev.filter((p) => fieldPerguntas.has(p.pergunta));

      // Add new fields not yet present in perguntas (as unassigned)
      fields.forEach((f, i) => {
        if (!existingPerguntas.has(f.pergunta)) {
          next = [
            ...next,
            makeDefaults(f.campo, f.pergunta, -1, next.length + 1, "", "", 0, `synced-${i}-${Date.now()}`),
          ];
        }
      });

      // Sync campo name edits (pergunta text is the stable key)
      next = next.map((p) => {
        const match = fields.find((f) => f.pergunta === p.pergunta);
        return match && match.campo !== p.campo ? { ...p, campo: match.campo } : p;
      });

      return next;
    });
  }, [fields, initialized, groups]);

  const resetAssociation = useCallback(() => {
    setPerguntas(buildAssociation(groups, fields));
    setShowDb(false);
    setDbOutput("");
    setShowSql(false);
    setSqlOutput("");
    showToast("Associação reiniciada!", "success");
  }, [groups, fields]);

  function update(id: string, patch: Partial<PerguntaAssociada>) {
    setPerguntas((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function moveUp(id: string) {
    setPerguntas((prev) => {
      const p = prev.find((x) => x.id === id);
      if (!p) return prev;
      const items = prev.filter((x) => x.statusIdx === p.statusIdx).sort((a, b) => a.ordem - b.ordem);
      const idx = items.findIndex((x) => x.id === id);
      if (idx === 0) return prev;
      const above = items[idx - 1];
      return prev.map((x) => {
        if (x.id === id) return { ...x, ordem: above.ordem };
        if (x.id === above.id) return { ...x, ordem: p.ordem };
        return x;
      });
    });
  }

  function moveDown(id: string) {
    setPerguntas((prev) => {
      const p = prev.find((x) => x.id === id);
      if (!p) return prev;
      const items = prev.filter((x) => x.statusIdx === p.statusIdx).sort((a, b) => a.ordem - b.ordem);
      const idx = items.findIndex((x) => x.id === id);
      if (idx >= items.length - 1) return prev;
      const below = items[idx + 1];
      return prev.map((x) => {
        if (x.id === id) return { ...x, ordem: below.ordem };
        if (x.id === below.id) return { ...x, ordem: p.ordem };
        return x;
      });
    });
  }

  function changeStatus(id: string, newStatusIdx: number) {
    setPerguntas((prev) => {
      const group = newStatusIdx >= 0 ? groups[newStatusIdx] : null;
      const grupo = group ? slugify(group.baseLabel) : "";
      const titulo = group ? group.baseLabel : "";
      const ordemGrupo = newStatusIdx >= 0 ? newStatusIdx + 1 : 0;
      const targetItems = prev.filter((x) => x.statusIdx === newStatusIdx);
      const maxOrd = targetItems.length > 0 ? Math.max(...targetItems.map((x) => x.ordem)) : 0;
      return prev.map((x) =>
        x.id === id
          ? { ...x, statusIdx: newStatusIdx, ordem: maxOrd + 1, grupo, titulo, ordemGrupo }
          : x
      );
    });
  }

  function updateGroupField(
    statusIdx: number,
    field: "grupo" | "titulo" | "ordemGrupo",
    value: string | number
  ) {
    setPerguntas((prev) =>
      prev.map((x) => (x.statusIdx === statusIdx ? { ...x, [field]: value } : x))
    );
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function generateSql() {
    const now = new Date();
    const ts =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0");

    const lines: string[] = [`-- Auto-generated SQL script #${ts}`];
    const assigned = perguntas.filter((p) => p.statusIdx >= 0);
    const byStatus = new Map<number, PerguntaAssociada[]>();
    assigned.forEach((p) => {
      if (!byStatus.has(p.statusIdx)) byStatus.set(p.statusIdx, []);
      byStatus.get(p.statusIdx)!.push(p);
    });

    [...byStatus.keys()].sort((a, b) => a - b).forEach((sIdx) => {
      const items = byStatus.get(sIdx)!.sort((a, b) => a.ordem - b.ordem);
      const label = groups[sIdx]?.baseLabel || `Status ${sIdx + 1}`;
      lines.push(`-- STATUS ${sIdx + 1} — ${label}`);
      items.forEach((p) => lines.push(buildSqlInsert(p, checklistId)));
      lines.push("");
    });

    const sql = lines.join("\n");
    setSqlOutput(sql);
    setShowSql(true);
  }

  const unassigned = perguntas.filter((p) => p.statusIdx === -1);
  const compactoTotal = perguntas.filter((p) => p.esconderQuando === 2).length;

  if (!initialized) {
    return (
      <div className="flex items-center justify-center py-12 text-[#80808F] text-sm">
        Aguardando campos e seções gerados...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 bg-[#8950FC]/10 text-[#8950FC] rounded-full text-xs font-medium">
            {perguntas.length} perguntas
          </span>
          <span className="px-2.5 py-1 bg-[#22B9FF]/10 text-[#22B9FF] rounded-full text-xs font-medium">
            {groups.length} status
          </span>
          {compactoTotal > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-[#FFB822]/10 text-[#FFB822] rounded-full text-xs font-medium">
              <EyeOff className="w-3 h-3" />
              {compactoTotal} compacto
            </span>
          )}
          {unassigned.length > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-[#F64E60]/10 text-[#F64E60] rounded-full text-xs font-medium">
              <AlertCircle className="w-3 h-3" />
              {unassigned.length} não associada{unassigned.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetAssociation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Resetar
          </button>
          <button
            onClick={() => {
              setDbOutput(buildDbRows(perguntas, checklistId));
              setShowDb(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22B9FF]/10 hover:bg-[#22B9FF]/20 text-[#22B9FF] text-sm font-medium transition-colors border border-[#22B9FF]/30"
          >
            <Copy className="w-3.5 h-3.5" />
            Formato DB
          </button>
          <button
            onClick={generateSql}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8950FC]/10 hover:bg-[#8950FC]/20 text-[#8950FC] text-sm font-medium transition-colors border border-[#8950FC]/30"
          >
            <Database className="w-3.5 h-3.5" />
            Gerar SQL
          </button>
        </div>
      </div>

      {/* Status groups */}
      {groups.map((group, gIdx) => {
        const groupPerguntas = perguntas
          .filter((p) => p.statusIdx === gIdx)
          .sort((a, b) => a.ordem - b.ordem);
        const first = groupPerguntas[0];
        return (
          <GroupSection
            key={group.id}
            group={group}
            statusIdx={gIdx}
            perguntas={groupPerguntas}
            allGroups={groups}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            onUpdate={update}
            onMoveUp={moveUp}
            onMoveDown={moveDown}
            onChangeStatus={changeStatus}
            onUpdateGroupField={updateGroupField}
            firstGrupo={first?.grupo ?? slugify(group.baseLabel)}
            firstTitulo={first?.titulo ?? group.baseLabel}
            firstOrdemGrupo={first?.ordemGrupo ?? gIdx + 1}
          />
        );
      })}

      {/* Unassigned */}
      {unassigned.length > 0 && (
        <div className="border border-[#F64E60]/30 rounded-xl overflow-hidden">
          <div className="bg-[#F64E60]/5 border-b border-[#F64E60]/20 px-4 py-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#F64E60]" />
            <span className="text-sm font-semibold text-[#F64E60]">
              Não Associadas ({unassigned.length})
            </span>
          </div>
          <div className="divide-y divide-[#f0f0f0]">
            {unassigned.map((p, idx) => (
              <PerguntaCard
                key={p.id}
                pergunta={p}
                allGroups={groups}
                posInGroup={idx}
                totalInGroup={unassigned.length}
                isExpanded={expandedIds.has(p.id)}
                onToggleExpand={() => toggleExpand(p.id)}
                onUpdate={(patch) => update(p.id, patch)}
                onMoveUp={() => moveUp(p.id)}
                onMoveDown={() => moveDown(p.id)}
                onChangeStatus={(i) => changeStatus(p.id, i)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Formato DB output */}
      {showDb && dbOutput && (
        <div className="space-y-2 pt-3 border-t border-[#e8e8e8]">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#22B9FF]">
              Formato DB (checklist_perguntas)
            </h4>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(dbOutput);
                  showToast("Formato DB copiado!", "success");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22B9FF]/10 hover:bg-[#22B9FF]/20 text-[#22B9FF] text-sm transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </button>
              <button
                onClick={() => setShowDb(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#80808F] text-sm transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
          <pre className="bg-[#F9F9F9] border border-[#e0e0e0] rounded-lg p-3 text-xs text-[#464E5F] overflow-x-auto whitespace-pre max-h-96">
            {dbOutput}
          </pre>
        </div>
      )}

      {/* SQL output */}
      {showSql && sqlOutput && (
        <div className="space-y-2 pt-3 border-t border-[#e8e8e8]">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#8950FC] flex items-center gap-2">
              <Database className="w-4 h-4" />
              SQL INSERT (checklist_perguntas)
            </h4>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(sqlOutput);
                  showToast("SQL copiado!", "success");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#8950FC]/10 hover:bg-[#8950FC]/20 text-[#8950FC] text-sm transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([sqlOutput], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `checklist_perguntas_${checklistId}.sql`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F] text-sm transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar .sql
              </button>
            </div>
          </div>
          <pre className="bg-[#F9F9F9] border border-[#e0e0e0] rounded-lg p-3 text-xs text-[#464E5F] overflow-x-auto whitespace-pre max-h-96">
            {sqlOutput}
          </pre>
        </div>
      )}
    </div>
  );
}
