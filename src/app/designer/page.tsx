import type { Metadata } from "next";
import { DesignerClient } from "./designer-client";

export const metadata: Metadata = {
  title: "Designer de PDF — Checklist Tools",
  description: "Calibrador visual de marcações e gerador de código PHP/TCPDF para checklists.",
};

export default function DesignerPage() {
  return <DesignerClient />;
}
