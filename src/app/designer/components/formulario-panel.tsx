"use client";

import { useState } from "react";
import { Crosshair, Plus, X } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import {
  adicionarColuna,
  contarPorColuna,
  MAX_COLUNAS,
  MIN_COLUNAS,
  removerColuna,
  SIMBOLOS,
} from "@/lib/designer/formulario";
import type { CaptureMode, EditorState, FormularioConfig } from "@/lib/designer/types";

interface Props {
  st: EditorState;
  cfg: FormularioConfig;
  rerender: () => void;
  commit: () => void;
}

const num = "bg-white border border-[#d0d0d0] rounded px-2 py-1 text-xs font-mono";
const lbl = "text-[10px] uppercase tracking-wide text-[#80808F]";

export function FormularioPanel({ st, cfg, rerender, commit }: Props) {
  const [aba, setAba] = useState<"colunas" | "php">("colunas");
  const usos = contarPorColuna(st.pages, cfg);

  function capturarX(colunaId: string) {
    st.captureMode = { kind: "formularioColX", colunaId } as CaptureMode;
    commit();
    showToast("Clique na folha, na coluna desta resposta.", "info");
  }

  return (
    <div className="border border-[#e0e0e0] rounded-xl overflow-hidden">
      <div className="flex border-b border-[#e0e0e0] bg-[#F9F9F9]">
        {([
          ["colunas", `Colunas (${cfg.colunas.length})`],
          ["php", "PHP"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`flex-1 px-2 py-2 text-[11px] font-medium transition-colors ${
              aba === id
                ? "bg-white text-[#173872] border-b-2 border-[#173872]"
                : "text-[#80808F] hover:text-[#464E5F]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "colunas" && (
        <div className="p-3 space-y-3">
          <p className="text-[10px] text-[#80808F] leading-snug">
            As colunas de resultado já vêm impressas na folha. Cada item escolhe uma delas, e o X
            da coluna é onde a marcação cai — calibre um X por coluna e vale para o formulário todo.
          </p>

          <label className="flex items-center gap-2">
            <span className={lbl}>marcação</span>
            <select
              value={cfg.simbolo}
              onChange={(e) => {
                cfg.simbolo = e.target.value;
                commit();
              }}
              className={`${num} w-20`}
              title="Símbolo impresso na coluna escolhida"
            >
              {SIMBOLOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span className={`${lbl} ml-2`}>caixa</span>
            <input
              type="number"
              step="0.1"
              key={"cw" + st.geomTick}
              defaultValue={cfg.celulaW}
              onChange={(e) => {
                cfg.celulaW = parseFloat(e.target.value) || 8;
                rerender();
              }}
              onBlur={commit}
              className={`${num} w-14`}
              title="largura (mm) da célula da marcação"
            />
            <input
              type="number"
              step="0.1"
              key={"ch" + st.geomTick}
              defaultValue={cfg.celulaH}
              onChange={(e) => {
                cfg.celulaH = parseFloat(e.target.value) || 5;
                rerender();
              }}
              onBlur={commit}
              className={`${num} w-14`}
              title="altura (mm) da célula da marcação"
            />
          </label>

          <div className="space-y-1">
            {cfg.colunas.map((col) => (
              <div
                key={col.id}
                className="flex items-center gap-1 px-1.5 py-1 rounded-lg border border-transparent hover:bg-[#F9F9F9]"
              >
                <input
                  defaultValue={col.label}
                  key={col.id + "l" + st.geomTick}
                  onChange={(e) => {
                    col.label = e.target.value;
                    rerender();
                  }}
                  onBlur={commit}
                  className={`${num} w-16`}
                  title="rótulo impresso na folha (OK, NOK)"
                />
                <input
                  defaultValue={col.valor}
                  key={col.id + "v" + st.geomTick}
                  onChange={(e) => {
                    col.valor = e.target.value;
                    rerender();
                  }}
                  onBlur={commit}
                  className={`${num} w-12 text-center`}
                  title="valor gravado no formulário para esta coluna"
                />
                <input
                  type="number"
                  step="0.1"
                  defaultValue={col.x}
                  key={col.id + "x" + st.geomTick}
                  onChange={(e) => {
                    col.x = parseFloat(e.target.value) || 0;
                    rerender();
                  }}
                  onBlur={commit}
                  className={`${num} w-16 text-right`}
                  title="x (mm) da marcação nesta coluna"
                />
                <button
                  onClick={() => capturarX(col.id)}
                  className="shrink-0 px-1.5 py-1 rounded bg-[#F9F9F9] hover:bg-[#e8e8e8] border border-[#e0e0e0] text-[#464E5F]"
                  title="capturar clicando na folha"
                >
                  <Crosshair className="w-3 h-3" />
                </button>
                <span className="text-[10px] text-[#80808F] w-12 text-right">
                  {usos.get(col.id) ?? 0} itens
                </span>
                <button
                  onClick={() => {
                    const movidos = removerColuna(st.pages, cfg, col.id);
                    if (movidos < 0) {
                      showToast(`O formulário precisa de pelo menos ${MIN_COLUNAS} colunas.`, "error");
                      return;
                    }
                    commit();
                    showToast(
                      movidos > 0
                        ? `Coluna removida — ${movidos} item(ns) passaram para "${cfg.colunas[0].label}".`
                        : "Coluna removida.",
                      movidos > 0 ? "info" : "success",
                    );
                  }}
                  className="shrink-0 text-[#b0b0bf] hover:text-[#F64E60]"
                  title="Remover coluna"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {cfg.colunas.length < MAX_COLUNAS && (
            <button
              onClick={() => {
                adicionarColuna(cfg);
                commit();
              }}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border border-dashed border-[#d0d0d0] text-[#80808F] hover:border-[#173872]/40 hover:text-[#173872] text-[11px] transition-colors"
            >
              <Plus className="w-3 h-3" />
              coluna
            </button>
          )}
        </div>
      )}

      {aba === "php" && (
        <div className="p-3 space-y-2">
          <label className="block space-y-1">
            <span className={lbl}>arquivo</span>
            <select
              value={cfg.formatoArquivo}
              onChange={(e) => {
                cfg.formatoArquivo = e.target.value as "funcao" | "completo";
                commit();
              }}
              className={`${num} w-full`}
            >
              <option value="funcao">só as funções</option>
              <option value="completo">funções + declaração dos caminhos</option>
            </select>
          </label>
          {(
            [
              ["sufixoFuncao", "sufixo", "gerarDesenho<sufixo> / gerarImpressao<sufixo>"],
              ["varResposta", "objeto da resposta", "nome (sem $) do objeto dentro da função"],
              ["codFormulario", "codFormulario", "usado no WHERE da query"],
              ["fundoPath", "fundo ({n} = folha)", "caminho PHP do JPG de cada folha"],
            ] as const
          )
            .filter(([key]) => (cfg.formatoArquivo === "funcao" ? key !== "fundoPath" : true))
            .map(([key, label, hint]) => (
              <label key={key} className="block space-y-1">
                <span className={lbl}>{label}</span>
                <input
                  defaultValue={cfg[key]}
                  key={key + st.geomTick}
                  onChange={(e) => {
                    cfg[key] = e.target.value;
                    rerender();
                  }}
                  onBlur={commit}
                  title={hint}
                  className={`${num} w-full`}
                />
              </label>
            ))}
          <label className="flex items-start gap-2 text-[11px] text-[#464E5F] cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.buscarNomeFantasia}
              onChange={(e) => {
                cfg.buscarNomeFantasia = e.target.checked;
                commit();
              }}
              className="mt-0.5"
            />
            <span>
              buscar <code className="font-mono">nomeFantasia</code> da concessionária na função de
              impressão
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
