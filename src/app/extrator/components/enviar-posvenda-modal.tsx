"use client";

import { useState } from "react";
import { Copy, Send, X } from "lucide-react";
import { showToast } from "@/components/ui/toast";
import { CampoRepositorio } from "@/components/ui/campo-repositorio";
import { montarPacoteDoExtrator } from "@/lib/designer/pacote-posvenda";
import { caminhoDoRepositorio, gravarNoRepositorio, instalarSkills, resumoSkills } from "@/lib/repositorio";
import type { UploadedImage } from "@/lib/types";

interface Props {
  campos: { campo: string; secao?: string }[];
  pdfFile: File | null;
  images: UploadedImage[];
  onClose: () => void;
}

function lerComoDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("não consegui ler a imagem"));
    r.readAsDataURL(f);
  });
}

/**
 * Pós-venda direto do extrator para o Claude Code: os campos (na ordem do formulário, com
 * "Etapa > SEÇÃO") viram o pos_venda.json, as folhas viram as artes, e a skill
 * `checklist-pos-venda` do acampa-checklist faz o resto. Sem passar pelo Designer.
 */
export function EnviarPosVendaModal({ campos, pdfFile, images, onClose }: Props) {
  const [repo, setRepo] = useState(() => caminhoDoRepositorio("acampaChecklist"));
  const [pasta, setPasta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [comando, setComando] = useState<string | null>(null);
  const [skills, setSkills] = useState("");

  const secoes = new Set(campos.map((c) => (c.secao ?? "").trim())).size;
  const etapas = new Set(campos.map((c) => (c.secao ?? "").split(" > ")[0]).filter(Boolean)).size;

  /** As imagens enviadas na etapa anterior valem mais que o render do PDF. */
  async function artes(): Promise<string[]> {
    if (images.length) return Promise.all(images.map((i) => lerComoDataUrl(i.file)));
    if (!pdfFile) return [];
    const fd = new FormData();
    fd.append("pdf", pdfFile);
    const r = await fetch("/api/renderizar-pdf", { method: "POST", body: fd }).then((x) => x.json());
    if (!r.ok) throw new Error(r.erro ?? "Não consegui renderizar o PDF.");
    return r.paginas as string[];
  }

  async function enviar() {
    const p = pasta.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!p) {
      showToast('Informe a pasta do checklist (ex.: "parvi_frota/v2").', "error");
      return;
    }
    setEnviando(true);
    try {
      const imagens = await artes();
      if (!imagens.length) {
        showToast("Sem folhas: envie o PDF ou as imagens nas etapas anteriores.", "error");
        return;
      }
      const arquivos = imagens.map((d, i) => ({
        arquivo: `checklist_modelos/folha_mod_1_${i + 1}.${/^data:image\/png/i.test(d) ? "png" : "jpg"}`,
        dataUrl: d,
      }));
      const pacote = montarPacoteDoExtrator(campos, p.split("/")[0], p, arquivos);
      const r = await gravarNoRepositorio("acampaChecklist", repo, [
        ...arquivos.map((a) => ({ caminho: `${p}/${a.arquivo}`, dataUrl: a.dataUrl })),
        { caminho: `${p}/pos_venda.json`, texto: JSON.stringify(pacote, null, 2) },
      ]);
      if (!r) return;
      // a skill do comando vai junto: dev que nunca a teve não recebe "comando desconhecido"
      setSkills(resumoSkills(await instalarSkills("acampaChecklist", repo)));
      setComando(`/checklist-pos-venda ${p}`);
      showToast(`${r.arquivos.length} arquivo(s) gravado(s) em ${r.raiz}.`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Não consegui gravar o pacote.", "error");
    } finally {
      setEnviando(false);
    }
  }

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
            Grava as folhas em <code className="font-mono">checklist_modelos/</code> e o{" "}
            <code className="font-mono">pos_venda.json</code> com {campos.length} campo(s) em {secoes} bloco(s) e{" "}
            {etapas} etapa(s), na ordem do formulário. A skill localiza cada bloco na arte, lê as opções na legenda e
            monta o imprimir.php.
          </p>
          <p className="text-[12px] text-[#80808F]">
            Artes: {images.length ? `as ${images.length} imagem(ns) enviada(s)` : "as páginas do PDF, a ~150 DPI"}.
          </p>

          <div className="space-y-1">
            <span className={rotulo}>acampa-checklist (onde está na sua máquina)</span>
            <CampoRepositorio chave="acampaChecklist" valor={repo} onChange={setRepo} />
          </div>
          <label className="block space-y-1">
            <span className={rotulo}>pasta do checklist</span>
            <input
              value={pasta}
              onChange={(e) => setPasta(e.target.value)}
              placeholder="ex.: parvi_frota/v2"
              className="w-full rounded-lg border border-[#d0d0d0] bg-white px-3 py-2 font-mono text-sm text-[#464E5F] focus:outline-none focus:ring-2 focus:ring-[#8950FC]/30"
            />
          </label>

          {comando && (
            <div className="space-y-1.5 rounded-lg border border-[#0BB783]/30 bg-[#0BB783]/5 px-3 py-2.5">
              {skills && (
                <p className="text-[11.5px] text-[#80808F]">
                  Skill no repositório: {skills}. Abra uma sessão nova do Claude Code para ela ser carregada.
                </p>
              )}
              <p className="text-[12px] text-[#464E5F]">Cole no Claude Code, com o acampa-checklist aberto:</p>
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
            disabled={enviando || campos.length === 0}
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
