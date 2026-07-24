"use client";

import dynamic from "next/dynamic";

// O editor usa <canvas>, window, FileReader e localStorage → não deve ser pré-renderizado.
// ssr:false só é permitido dentro de um Client Component (Next 16).
const DesignerEditor = dynamic(() => import("./components/designer-editor"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#e6e6e6] flex items-center justify-center text-[#80808F] text-sm">
      Carregando o Designer…
    </div>
  ),
});

export function DesignerClient() {
  return <DesignerEditor />;
}
