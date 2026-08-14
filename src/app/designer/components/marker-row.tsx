"use client";

import { useState } from "react";
import { CornerLeftUp, CornerRightDown, X, Link2, AlertTriangle } from "lucide-react";
import {
  applyGroupAutomation,
  clamp01,
  pushMarkersBelow,
  syncGroupStartIfFirst,
} from "@/lib/designer/geometry";
import { insertMirrorRow, mirrorTargetIndex, removeMirrorRow, supportsMirror } from "@/lib/designer/mirror";
import { mascaraDoItem } from "@/lib/designer/manutencao";
import type {
  DesignerGroup,
  DesignerPage,
  EditorState,
  FormularioConfig,
  ManutencaoConfig,
  Marker,
} from "@/lib/designer/types";

interface Props {
  st: EditorState;
  page: DesignerPage;
  group: DesignerGroup;
  marker: Marker;
  index: number;
  rerender: () => void;
  /** Inserir/remover a linha de referência muda o Y das linhas abaixo — precisa do commit. */
  commit: () => void;
  /** manutenção: para o seletor de condição da linha. */
  manutencaoCfg?: ManutencaoConfig | null;
  /** formulário: colunas de resultado, para as teclas de resposta da linha. */
  formularioCfg?: FormularioConfig | null;
  /** Move deste item em diante para a folha seguinte, como "(cont.)". */
  onSplitHere?: () => void;
  /** false no 1º item: não faz sentido "partir" no começo do grupo. */
  canSplit?: boolean;
  /** Move só este item para o fim do grupo anterior. */
  onMoveToPrevGroup?: () => void;
  /** manutenção: abre a grade de revisões destacando este item. */
  onAbrirGrade?: () => void;
}

// Passos (mm) dos campos X/Y da linha. O antigo 0,01 do step nativo era fino demais:
// um clique na setinha não movia nada visível na folha. A calibração fina continua
// existindo, mas por modificador.
const PASSO_SETA = 0.1;
const PASSO_GROSSO = 1;
const PASSO_FINO = 0.01;

/** Deslocamento (mm) que a tecla pede, ou null quando não é seta de cima/baixo. */
function passoDaSeta(e: React.KeyboardEvent<HTMLInputElement>): number | null {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return null;
  const passo = e.shiftKey ? PASSO_GROSSO : e.altKey ? PASSO_FINO : PASSO_SETA;
  return e.key === "ArrowUp" ? passo : -passo;
}

function toggleColor(active: boolean, kind: "ok" | "no" | "na"): string {
  if (!active) return "bg-white text-[#b0b0bf] border-[#e0e0e0] hover:text-[#80808F]";
  if (kind === "ok") return "bg-[#0BB783] text-white border-[#0BB783]";
  if (kind === "no") return "bg-[#F64E60] text-white border-[#F64E60]";
  return "bg-[#22B9FF] text-white border-[#22B9FF]";
}

export function MarkerRow({
  st,
  page,
  group,
  marker: m,
  index,
  rerender,
  commit,
  manutencaoCfg,
  formularioCfg,
  onSplitHere,
  canSplit,
  onMoveToPrevGroup,
  onAbrirGrade,
}: Props) {
  const selected = m.id === st.selectedMarkerId;
  const isRevisao = group.docType === "revisao";
  const isPosvenda = group.docType === "posvenda";
  const isManutencao = group.docType === "manutencao";
  const isFormulario = group.docType === "formulario";
  // Manutenção não tem X próprio: o X é o da revisão impressa.
  const showX =
    !isRevisao && !isManutencao && !isFormulario && !(isPosvenda && group.posvendaXMode === "diff");
  /** Mexer no Y deste item arrasta os de baixo junto (desligável na folha). */
  const empurra = page.pushBelow !== false && index < group.markers.length - 1;
  /** Quantas revisões imprimem este item, de quantas existem. */
  const revisoesDoItem = isManutencao ? mascaraDoItem(manutencaoCfg ?? null, m).length : 0;
  const totalRevisoes = manutencaoCfg?.colunas.length ?? 0;
  const revisoesCompletas = totalRevisoes > 0 && revisoesDoItem >= totalRevisoes;
  // Enquanto o campo está sob digitação, quem manda é o texto cru; fora disso o valor
  // vem do modelo. É o que deixa as linhas de baixo se atualizarem ao vivo quando o
  // item de cima é empurrado, sem atrapalhar quem está digitando.
  const [xRaw, setXRaw] = useState<string | null>(null);
  const [yRaw, setYRaw] = useState<string | null>(null);

  function select() {
    st.selectedGroupId = group.id;
    st.selectedMarkerId = m.id;
    rerender();
  }

  function aplicarX(mm: number) {
    m.fx = clamp01(mm / page.widthMm);
    syncGroupStartIfFirst(group, page, m);
    rerender();
  }

  function aplicarY(mm: number) {
    const antes = m.fy * page.heightMm;
    m.fy = clamp01(mm / page.heightMm);
    // O item que se ajusta no meio do grupo (um subtítulo, um par KM/Tempo) leva os de
    // baixo junto: o que muda é onde o bloco começa, não o espaço entre eles.
    if (empurra) pushMarkersBelow(group, page, index, mm - antes);
    syncGroupStartIfFirst(group, page, m);
    applyGroupAutomation(page);
    rerender();
  }

  function clearSelection() {
    if (st.selectedMarkerId !== m.id) return;
    st.selectedMarkerId = null;
    st.selectedGroupId = null;
  }

  function del() {
    // Linha de referência é posição extra: ao sair, o que está abaixo volta a subir.
    if (m.mirrorNext && removeMirrorRow(group, page, index)) {
      clearSelection();
      applyGroupAutomation(page);
      commit();
      return;
    }
    group.markers = group.markers.filter((x) => x.id !== m.id);
    clearSelection();
    rerender();
  }

  const opts = group.posvendaOpts || [];

  // Rótulo de referência (só roteiro): marcação extra na linha do rótulo, que imprime a
  // marcação do item seguinte.
  const canMirror = supportsMirror(group);
  const isMirror = canMirror && !!m.mirrorNext;
  const targetIdx = isMirror ? mirrorTargetIndex(group.markers, index) : -1;
  const targetLabel = targetIdx >= 0 ? group.markers[targetIdx].label : null;

  function addMirror() {
    const row = insertMirrorRow(group, page, index);
    if (!row) return;
    st.selectedGroupId = group.id;
    st.selectedMarkerId = row.id;
    // O rótulo ocupa uma linha da folha: com chainY ligado, os grupos seguintes descem
    // um incremento junto. Grupo arrastado à mão (yManual) fica onde está.
    applyGroupAutomation(page);
    commit();
  }

  function dropMirror() {
    if (!removeMirrorRow(group, page, index)) return;
    clearSelection();
    applyGroupAutomation(page);
    commit();
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) select();
      }}
      className={`flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-lg border ${
        selected ? "bg-[#173872]/5 border-[#173872]/30" : "border-transparent hover:bg-[#F9F9F9]"
      }`}
    >
      <span className="shrink-0 w-4 h-4 rounded-full bg-[#173872] text-white text-[10px] flex items-center justify-center font-mono">
        {index + 1}
      </span>

      {/* type toggle — escondido na linha de referência: ela não tem resposta própria,
          o preview desenha o tipo do item seguinte */}
      {!isMirror && (
      <div className="flex shrink-0 border border-[#e0e0e0] rounded overflow-hidden">
        {isFormulario && formularioCfg ? (
          // Uma tecla por coluna de resultado: o que muda é em qual delas a marcação cai.
          formularioCfg.colunas.map((col) => {
            const active = (m.type ?? formularioCfg.colunas[0]?.valor) === col.valor;
            return (
              <button
                key={col.id}
                onClick={() => {
                  m.type = col.valor;
                  select();
                }}
                title={`${col.label} — imprime em x ${col.x}`}
                className={`px-1.5 py-1 text-[9px] font-mono border-r last:border-r-0 border-[#e0e0e0] ${
                  active
                    ? "bg-[#173872] text-white border-[#173872]"
                    : "bg-white text-[#b0b0bf] hover:text-[#80808F]"
                }`}
              >
                {col.label}
              </button>
            );
          })
        ) : isManutencao ? (
          (
            [
              ["1", "✓", "OK — imprime ✓", "bg-[#0BB783] text-white border-[#0BB783]"],
              ["3", "✕", "Substituir — imprime X", "bg-[#F64E60] text-white border-[#F64E60]"],
              // O triângulo saiu do formulário (só há OK e Substituir); o botão só aparece
              // em item de plano antigo que ainda esteja marcado assim, para dar como trocar.
              ...(m.type === "2"
                ? ([["2", "▲", "triângulo (formato antigo)", "bg-[#FFB822] text-white border-[#FFB822]"]] as [
                    string,
                    string,
                    string,
                    string,
                  ][])
                : []),
            ] as [string, string, string, string][]
          ).map(([val, glyph, titulo, onClass]) => {
            const active = (m.type || "1") === val;
            return (
              <button
                key={val}
                onClick={() => {
                  m.type = val;
                  select();
                }}
                title={titulo}
                className={`px-1.5 py-1 text-[9px] font-mono border-r last:border-r-0 border-[#e0e0e0] ${
                  active ? onClass : "bg-white text-[#b0b0bf] hover:text-[#80808F]"
                }`}
              >
                {glyph}
              </button>
            );
          })
        ) : isRevisao ? (
          (
            [
              ["1", "✓", "ok"],
              ["2", "✗", "no"],
              ["0", "NA", "na"],
            ] as [string, string, "ok" | "no" | "na"][]
          ).map(([val, glyph, kind]) => {
            const active = m.tipo !== "texto" && (m.resposta || "1") === val;
            return (
              <button
                key={val}
                onClick={() => {
                  m.tipo = "opcoes";
                  m.resposta = val;
                  select();
                }}
                className={`px-1.5 py-1 text-[9px] font-mono border-r last:border-r-0 border-[#e0e0e0] ${toggleColor(active, kind)}`}
              >
                {glyph}
              </button>
            );
          })
        ) : isPosvenda ? (
          opts.map((o) => {
            const active = (m.type || opts[0]?.valor) === o.valor;
            const kind = o.valor === "1" ? "ok" : o.valor === "0" ? "na" : "no";
            return (
              <button
                key={o.valor}
                onClick={() => {
                  m.type = o.valor;
                  select();
                }}
                className={`px-1.5 py-1 text-[9px] font-mono border-r last:border-r-0 border-[#e0e0e0] ${toggleColor(active, kind)}`}
              >
                {o.label}
              </button>
            );
          })
        ) : (
          (
            [
              ["check", "✓", "ok"],
              ["x", "✗", "no"],
              ["na", "NA", "na"],
            ] as [string, string, "ok" | "no" | "na"][]
          ).map(([val, glyph, kind]) => {
            const active = (m.type || "check") === val;
            return (
              <button
                key={val}
                onClick={() => {
                  m.type = val;
                  select();
                }}
                className={`px-1.5 py-1 text-[9px] font-mono border-r last:border-r-0 border-[#e0e0e0] ${toggleColor(active, kind)}`}
              >
                {glyph}
              </button>
            );
          })
        )}
      </div>
      )}

      {canMirror && (
        <button
          onClick={isMirror ? dropMirror : addMirror}
          title={
            isMirror
              ? targetLabel
                ? `Linha de referência: imprime a marcação de "${targetLabel}". Clique para remover — os itens abaixo sobem um incremento.`
                : "Linha de referência sem item seguinte — nada a espelhar. Clique para remover."
              : `Inserir linha de referência acima (rótulo tipo "1. MÓDULO ADAS:"): cria uma marcação extra na linha ${index + 1} e empurra este item e os de baixo um incremento`
          }
          className={`shrink-0 p-1 rounded border transition-colors ${
            isMirror
              ? targetLabel
                ? "bg-[#8950FC] text-white border-[#8950FC]"
                : "bg-[#FFB822] text-white border-[#FFB822]"
              : "bg-white text-[#d5d5dd] border-[#e0e0e0] hover:text-[#8950FC] hover:border-[#8950FC]/40"
          }`}
        >
          <Link2 className="w-3 h-3" />
        </button>
      )}

      {isMirror ? (
        // Campo somente leitura: quem manda é o item seguinte. Editar aqui não teria
        // efeito no código gerado (resolveMarkerFields sempre usa o campo do alvo).
        <input
          value={targetLabel ?? m.label}
          readOnly
          onFocus={select}
          title="Campo do item seguinte — esta linha imprime a marcação dele. Para renomear, edite o item abaixo."
          className="flex-1 min-w-0 bg-[#8950FC]/5 border border-[#8950FC]/40 rounded px-1.5 py-1 text-xs font-mono text-[#8950FC] cursor-default focus:outline-none"
        />
      ) : (
        <input
          defaultValue={m.label}
          key={m.id}
          onFocus={select}
          onChange={(e) => {
            m.label = e.target.value;
          }}
          className="flex-1 min-w-0 bg-white border border-[#d0d0d0] rounded px-1.5 py-1 text-xs font-mono text-[#0BB783] focus:outline-none focus:ring-1 focus:ring-[#0BB783]/40"
          placeholder="nome_do_campo"
        />
      )}

      {isManutencao && manutencaoCfg && (
        // Quantas revisões imprimem este item. O detalhe (quais) é da grade — aqui só
        // cabe o resumo e o atalho para abri-la já nesta linha.
        <button
          onClick={() => {
            select();
            onAbrirGrade?.();
          }}
          title={
            revisoesDoItem === 0
              ? "Nenhuma revisão marcada — este item não será impresso. Clique para abrir a grade."
              : revisoesCompletas
              ? "Impresso em todas as revisões — clique para abrir a grade"
              : `Impresso em ${revisoesDoItem} de ${totalRevisoes} revisões — clique para abrir a grade`
          }
          className={`shrink-0 px-1.5 py-1 rounded border text-[10px] font-mono transition-colors ${
            revisoesDoItem === 0
              ? "border-[#F64E60]/40 bg-[#F64E60]/5 text-[#F64E60]"
              : revisoesCompletas
              ? "border-[#e0e0e0] bg-white text-[#80808F] hover:border-[#173872]/40 hover:text-[#173872]"
              : "border-[#173872]/40 bg-[#173872]/5 text-[#173872]"
          }`}
        >
          {`${revisoesDoItem}/${totalRevisoes}`}
        </button>
      )}

      {showX && (
        <input
          type="number"
          step={PASSO_SETA}
          value={xRaw ?? ((m.fx ?? 0) * page.widthMm).toFixed(2)}
          title={`x (mm) — seta ${PASSO_SETA}, Shift ${PASSO_GROSSO}, Alt ${PASSO_FINO}`}
          onChange={(e) => {
            setXRaw(e.target.value);
            const mm = parseFloat(e.target.value);
            if (isNaN(mm)) return;
            aplicarX(mm);
          }}
          onKeyDown={(e) => {
            const passo = passoDaSeta(e);
            if (passo === null) return;
            e.preventDefault();
            const mm = +((m.fx ?? 0) * page.widthMm + passo).toFixed(2);
            setXRaw(mm.toFixed(2));
            aplicarX(mm);
          }}
          onBlur={() => {
            setXRaw(null);
            commit();
          }}
          className="w-12 bg-white border border-[#d0d0d0] rounded px-1 py-1 text-[10px] font-mono text-right text-[#80808F] focus:outline-none"
        />
      )}
      <input
        type="number"
        step={PASSO_SETA}
        value={yRaw ?? (m.fy * page.heightMm).toFixed(2)}
        title={
          (empurra
            ? "y (mm) — os itens abaixo deste, no mesmo grupo, andam junto"
            : "y (mm) — move só este item") +
          `\nseta ${PASSO_SETA} mm · Shift ${PASSO_GROSSO} mm · Alt ${PASSO_FINO} mm`
        }
        onChange={(e) => {
          setYRaw(e.target.value);
          const mm = parseFloat(e.target.value);
          if (isNaN(mm)) return; // campo em branco no meio da digitação
          aplicarY(mm);
        }}
        onKeyDown={(e) => {
          const passo = passoDaSeta(e);
          if (passo === null) return;
          // Assume as setas: o step nativo é único, e aqui um toque precisa render 0,1 mm
          // sem tirar o ajuste de 0,01 de quem está caçando o alinhamento fino.
          e.preventDefault();
          const mm = +(m.fy * page.heightMm + passo).toFixed(2);
          setYRaw(mm.toFixed(2));
          aplicarY(mm);
        }}
        onBlur={() => {
          setYRaw(null);
          commit();
        }}
        className="w-12 bg-white border border-[#d0d0d0] rounded px-1 py-1 text-[10px] font-mono text-right text-[#80808F] focus:outline-none"
      />

      {onMoveToPrevGroup && (
        <button
          onClick={onMoveToPrevGroup}
          className="shrink-0 p-1 text-[#d5d5dd] hover:text-[#173872] transition-colors"
          title={`Mover só este item (${index + 1}) para o fim do grupo anterior`}
        >
          <CornerLeftUp className="w-3 h-3" />
        </button>
      )}

      {onSplitHere && canSplit && (
        <button
          onClick={onSplitHere}
          className="shrink-0 p-1 text-[#d5d5dd] hover:text-[#173872] transition-colors"
          title={`Mover deste item (${index + 1}) até o último para a folha seguinte, com o mesmo nome + (cont.)`}
        >
          <CornerRightDown className="w-3 h-3" />
        </button>
      )}

      <button onClick={del} className="shrink-0 p-1 text-[#b0b0bf] hover:text-[#F64E60] transition-colors" title="Remover">
        <X className="w-3 h-3" />
      </button>

      {isMirror && (
        <div className="w-full pl-6 -mt-0.5">
          {targetLabel ? (
            <span className="text-[10.5px] text-[#8950FC] flex items-center gap-1">
              ↳ imprime a marcação de
              <code className="font-mono bg-[#8950FC]/10 rounded px-1">{targetLabel}</code>
            </span>
          ) : (
            <span className="text-[10.5px] text-[#FFB822] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              sem item seguinte neste grupo — segue imprimindo o próprio campo
            </span>
          )}
        </div>
      )}
    </div>
  );
}
