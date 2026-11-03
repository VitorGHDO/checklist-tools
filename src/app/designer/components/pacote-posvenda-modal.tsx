"use client";

import { useState } from "react";
import { Copy, Send, X } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { CampoRepositorio } from "@/components/ui/campo-repositorio";
import { avisosDoPacote, folhasDoPosVenda, montarPacotePosVenda } from "@/lib/designer/pacote-posvenda";
import { montarPacoteEI } from "@/lib/designer/pacote-ei";
import {
  caminhoDoRepositorio,
  gravarNoRepositorio,
  instalarSkills,
  REPOSITORIOS,
  resumoSkills,
  type ArquivoParaGravar,
} from "@/lib/repositorio";
import type { DesignerDocType, DesignerPage } from "@/lib/designer/types";

interface Props {
  pages: DesignerPage[];
  docType: DesignerDocType;
  onClose: () => void;
}

/** Barras normalizadas, sem barra nas pontas. */
const limpar = (s: string) => s.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

/**
 * Envia o checklist para o Claude Code: grava as artes e um pacote JSON na pasta do
 * checklist e mostra o comando da skill para colar no repositório.
 *   - pós-venda → acampa-checklist, pos_venda.json, skill `checklist-pos-venda` (monta tudo);
 *   - roteiro/revisão → stellantis-ei-checklist, designer.json na pasta da versão, skill
 *     `checklist-designer` (encaixa as posições já mapeadas no imprimir.php).
 */
export function PacotePosVendaModal({ pages, docType, onClose }: Props) {
  const posVenda = docType === "posvenda";
  const chave = posVenda ? "acampaChecklist" : "eiChecklist";
  const [repo, setRepo] = useState(() => caminhoDoRepositorio(chave));
  const [pasta, setPasta] = useState("");
  const [versao, setVersao] = useState("v1");
  const [prefixo, setPrefixo] = useState("folha_mod_1");
  const [enviando, setEnviando] = useState(false);
  const [comando, setComando] = useState<string | null>(null);
  const [skills, setSkills] = useState("");

  const folhas = posVenda
    ? folhasDoPosVenda(pages)
    : pages.filter((p) => p.kind === "checklist" && p.docType === docType);
  const semImagem = folhas.filter((p) => !p.imageSrc).map((p) => p.name);
  const grupos = folhas.reduce((a, p) => a + p.groups.length, 0);
  const mapeados = folhas.reduce((a, p) => a + p.groups.filter((g) => g.markersManual).length, 0);

  async function enviar() {
    const p = limpar(pasta);
    const v = limpar(versao);
    const pre = prefixo.trim() || "folha_mod_1";
    if (!p) {
      showToast(posVenda ? 'Informe a pasta (ex.: "parvi_frota/v2").' : 'Informe a pasta do checklist (ex.: "stellantis/ram/roteiro_entrega_tecnica_1500").', "error");
      return;
    }
    if (!posVenda && !/^[A-Za-z0-9_-]+$/.test(v)) {
      showToast('Informe a versão (ex.: "v3").', "error");
      return;
    }
    setEnviando(true);
    try {
      let arquivos: ArquivoParaGravar[];
      let cmd: string;
      if (posVenda) {
        const pacote = montarPacotePosVenda(pages, p.split("/")[0], p);
        arquivos = [
          ...pacote.folhas.map((f, i) => ({ caminho: `${p}/${f.arquivo}`, dataUrl: folhas[i].imageSrc! })),
          { caminho: `${p}/pos_venda.json`, texto: JSON.stringify(pacote, null, 2) },
        ];
        cmd = `/checklist-pos-venda ${p}`;
      } else {
        // artes ficam em <checklist>/checklist_modelos, compartilhadas entre as versões
        const pacote = montarPacoteEI(pages, docType, p, v, pre);
        arquivos = [
          ...pacote.folhas.map((f, i) => ({ caminho: `${p}/${f.arquivo}`, dataUrl: folhas[i].imageSrc! })),
          { caminho: `${p}/${v}/designer.json`, texto: JSON.stringify(pacote, null, 2) },
        ];
        cmd = `/checklist-designer ${p}/${v}`;
      }
      const r = await gravarNoRepositorio(chave, repo, arquivos);
      if (!r) return;
      // a skill do comando vai junto: dev que nunca a teve não recebe "comando desconhecido"
      setSkills(resumoSkills(await instalarSkills(chave, repo)));
      setComando(cmd);
      showToast(`${r.arquivos.length} arquivo(s) gravado(s) em ${r.raiz}.`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Não consegui gravar o pacote.", "error");
    } finally {
      setEnviando(false);
    }
  }

  const input =
    "w-full bg-white border border-[#d0d0d0] rounded-lg px-3 py-2 text-sm font-mono text-[#464E5F] focus:outline-none focus:ring-2 focus:ring-[#8950FC]/30";
  const rotulo = "text-[11px] font-medium uppercase tracking-wide text-[#80808F]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#e8e8e8] px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#464E5F]">
            <Send className="h-4 w-4 text-[#8950FC]" />
            Enviar para o Claude Code
          </h2>
          <button onClick={onClose} className="text-[#80808F] hover:text-[#464E5F]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm">
          <p className="text-[12px] leading-relaxed text-[#80808F]">
            {posVenda ? (
              <>
                Grava as artes e o <code className="font-mono">pos_venda.json</code> ({folhas.length} folha(s), {grupos}{" "}
                grupo(s), {mapeados} já mapeado(s)) na pasta do checklist. A skill monta o imprimir.php partindo do
                pacote, sem redescobrir campos.
              </>
            ) : (
              <>
                Grava as artes em <code className="font-mono">checklist_modelos/</code> e o{" "}
                <code className="font-mono">designer.json</code> ({folhas.length} folha(s), {grupos} grupo(s),{" "}
                {mapeados} mapeado(s)) na pasta da versão. A skill copia o imprimir.php da versão anterior e troca só as
                marcações pelas posições do Designer — sem medir a arte de novo.
              </>
            )}
          </p>
          {semImagem.length > 0 && (
            <p className="rounded-lg border border-[#F64E60]/30 bg-[#F64E60]/5 px-3 py-2 text-[12px] text-[#F64E60]">
              Sem imagem: {semImagem.join(", ")}. Carregue a arte de todas as folhas antes de enviar.
            </p>
          )}
          {posVenda &&
            avisosDoPacote(montarPacotePosVenda(pages, "", "")).map((a) => (
              <p key={a} className="rounded-lg border border-[#FFB822]/40 bg-[#FFB822]/10 px-3 py-2 text-[12px] text-[#9a6c00]">
                {a}
              </p>
            ))}
          {!posVenda && mapeados < grupos && (
            <p className="rounded-lg border border-[#FFB822]/40 bg-[#FFB822]/10 px-3 py-2 text-[12px] text-[#9a6c00]">
              {grupos - mapeados} grupo(s) ainda com Y pelo passo regular. Rode o mapear tudo antes — a skill confia
              nas posições do pacote.
            </p>
          )}

          <div className="space-y-1">
            <span className={rotulo}>{REPOSITORIOS[chave].rotulo} (onde está na sua máquina)</span>
            <CampoRepositorio chave={chave} valor={repo} onChange={setRepo} />
          </div>
          <label className="block space-y-1">
            <span className={rotulo}>{posVenda ? "pasta do checklist" : "pasta do checklist (sem a versão)"}</span>
            <input
              value={pasta}
              onChange={(e) => setPasta(e.target.value)}
              placeholder={posVenda ? "ex.: parvi_frota/v2" : "ex.: stellantis/ram/roteiro_entrega_tecnica_1500"}
              className={input}
            />
          </label>
          {!posVenda && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className={rotulo}>versão</span>
                <input value={versao} onChange={(e) => setVersao(e.target.value)} placeholder="v3" className={input} />
              </label>
              <label className="block space-y-1">
                <span className={rotulo}>prefixo das artes</span>
                <input value={prefixo} onChange={(e) => setPrefixo(e.target.value)} className={input} />
              </label>
            </div>
          )}

          {comando && (
            <div className="space-y-1.5 rounded-lg border border-[#0BB783]/30 bg-[#0BB783]/5 px-3 py-2.5">
              {skills && (
                <p className="text-[11.5px] text-[#80808F]">
                  Skill no repositório: {skills}. Abra uma sessão nova do Claude Code para ela ser carregada.
                </p>
              )}
              <p className="text-[12px] text-[#464E5F]">Cole no Claude Code, com o {REPOSITORIOS[chave].rotulo} aberto:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-white px-2 py-1.5 font-mono text-[12.5px] text-[#464E5F]">{comando}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(comando);
                    showToast("Comando copiado!", "success");
                  }}
                  className="flex items-center gap-1 rounded-lg bg-[#0BB783] px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#09a274]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  copiar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e8e8e8] px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-[#e0e0e0] px-3 py-1.5 text-sm text-[#80808F] hover:bg-[#F9F9F9]">
            Fechar
          </button>
          <button
            onClick={() => void enviar()}
            disabled={enviando || semImagem.length > 0 || folhas.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-[#8950FC] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#7337e8] disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {enviando ? "gravando…" : comando ? "gravar de novo" : "gravar pacote"}
          </button>
        </div>
      </div>
    </div>
  );
}
