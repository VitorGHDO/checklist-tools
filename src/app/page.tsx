import Link from "next/link";
import { FileText, PenTool, ArrowRight, Lock } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-[#e8e8e8] px-6 h-16 flex items-center"
        style={{ boxShadow: "0px 10px 30px 0px rgba(82,63,105,0.05)" }}
      >
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#173872] rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-lg font-bold text-[#173872]">Checklist Tools</h1>
          </div>
          <span className="text-xs text-[#80808F] bg-[#F9F9F9] px-2.5 py-1 rounded-full border border-[#e8e8e8]">
            Camp Tecnologia
          </span>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-3xl w-full text-center space-y-5 mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ED3237]/10 text-[#ED3237] text-xs font-medium border border-[#ED3237]/20">
            Ferramentas Internas
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-[#173872]">
            Checklist Tools
          </h2>
          <p className="text-base text-[#80808F] max-w-xl mx-auto">
            Extraia textos de PDFs, corrija com IA e monte checklists
            profissionais — tudo em um só lugar.
          </p>
        </div>

        {/* Tool Cards */}
        <div className="max-w-3xl w-full grid sm:grid-cols-2 gap-5">
          {/* Extrator */}
          <Link
            href="/extrator"
            className="group relative overflow-hidden rounded-xl border border-[#e8e8e8] bg-white p-6 transition-all hover:border-[#ED3237]/40 hover:shadow-md"
            style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.04)" }}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 rounded-lg bg-[#ED3237]/10 text-[#ED3237]">
                <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-base mb-1 text-[#464E5F]">
                  Extrator de PDF
                </h3>
                <p className="text-sm text-[#80808F]">
                  Extraia texto de PDFs e corrija com IA usando imagens de
                  referência.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2 py-0.5 rounded-full bg-[#173872]/10 text-[#173872] text-xs font-medium">
                pdf-parse
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#173872]/10 text-[#173872] text-xs font-medium">
                Gemini
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#173872]/10 text-[#173872] text-xs font-medium">
                OpenAI
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm text-[#ED3237] font-medium group-hover:gap-2 transition-all">
              Acessar <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Designer — Em breve */}
          <div
            className="relative overflow-hidden rounded-xl border border-[#e8e8e8] bg-[#F9F9F9] p-6 opacity-60 cursor-not-allowed"
            style={{ boxShadow: "0px 0px 20px 0px rgba(76,87,125,0.02)" }}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 rounded-lg bg-[#e8e8e8] text-[#80808F]">
                <PenTool className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-base mb-1 text-[#464E5F] flex items-center gap-2">
                  Designer de PDF
                  <span className="px-2 py-0.5 rounded-full bg-[#FFB822]/20 text-[#80808F] text-xs font-normal">
                    Em breve
                  </span>
                </h3>
                <p className="text-sm text-[#80808F]">
                  Monte checklists visuais com drag & drop e exporte em PDF.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2 py-0.5 rounded-full bg-[#e8e8e8] text-[#80808F] text-xs">
                Drag & Drop
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#e8e8e8] text-[#80808F] text-xs">
                Canvas
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#e8e8e8] text-[#80808F] text-xs">
                jsPDF
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-[#80808F]">
              <Lock className="w-3.5 h-3.5" />
              Fase 2
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#173872] px-6 py-4 text-center text-sm text-white/60">
        Checklist Tools &mdash; Ferramentas internas Camp Tecnologia
      </footer>
    </div>
  );
}
