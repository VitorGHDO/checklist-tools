"use client";

import { useCallback } from "react";
import { Upload, FileText, Images, X } from "lucide-react";
import { DropZone } from "@/components/ui/drop-zone";
import { showToast } from "@/components/ui/toast";
import { formatFileSize } from "@/lib/utils";
import type { UploadedImage } from "@/lib/types";

interface Props {
  pdfFile: File | null;
  onPdfChange: (file: File | null) => void;
  images: UploadedImage[];
  onImagesChange: (imgs: UploadedImage[]) => void;
}

export function FilesUploadStep({
  pdfFile,
  onPdfChange,
  images,
  onImagesChange,
}: Props) {
  const handlePdf = useCallback(
    (files: FileList) => {
      const f = files[0];
      if (!f) return;
      if (f.type !== "application/pdf") {
        showToast("Selecione um arquivo PDF válido.", "error");
        return;
      }
      if (f.size > 50 * 1024 * 1024) {
        showToast("Arquivo muito grande. Máximo: 50MB", "error");
        return;
      }
      onPdfChange(f);
    },
    [onPdfChange]
  );

  const addImages = useCallback(
    (files: FileList) => {
      const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
      const pending = Array.from(files).filter(
        (f) => validTypes.includes(f.type) && f.size <= 20 * 1024 * 1024
      );

      Array.from(files).forEach((f) => {
        if (!validTypes.includes(f.type)) {
          showToast(`${f.name} não é PNG/JPG/WebP.`, "error");
        } else if (f.size > 20 * 1024 * 1024) {
          showToast(`${f.name} muito grande (máx 20MB)`, "error");
        }
      });

      const newImages: UploadedImage[] = [];
      let loaded = 0;

      pending.forEach((file) => {
        const id =
          "img_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        const reader = new FileReader();
        reader.onload = (e) => {
          newImages.push({
            id,
            file,
            dataUrl: e.target?.result as string,
            name: file.name,
            size: file.size,
          });
          loaded++;
          if (loaded === pending.length) {
            onImagesChange([...images, ...newImages]);
          }
        };
        reader.readAsDataURL(file);
      });
    },
    [images, onImagesChange]
  );

  const removeImage = useCallback(
    (id: string) => {
      onImagesChange(images.filter((img) => img.id !== id));
    },
    [images, onImagesChange]
  );

  return (
    <div className="space-y-8">
      {/* PDF */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-[#464E5F] flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#ED3237]" />
          Arquivo PDF
        </h3>

        {!pdfFile ? (
          <DropZone
            onFileDrop={handlePdf}
            accept=".pdf"
            icon={<Upload className="w-10 h-10" />}
            label="Arraste o PDF aqui ou clique para selecionar"
            hint="Aceita .pdf (máx. 50MB)"
          />
        ) : (
          <div className="flex items-center gap-3 p-4 bg-[#F9F9F9] rounded-xl border border-[#e8e8e8]">
            <div className="p-2 bg-[#ED3237]/10 rounded-lg">
              <FileText className="w-5 h-5 text-[#ED3237]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium text-sm text-[#464E5F]">
                {pdfFile.name}
              </p>
              <p className="text-xs text-[#80808F]">
                {formatFileSize(pdfFile.size)}
              </p>
            </div>
            <button
              onClick={() => onPdfChange(null)}
              className="p-1.5 hover:bg-[#e8e8e8] rounded-lg transition-colors text-[#80808F] hover:text-[#464E5F]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-[#e8e8e8]" />

      {/* Images */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-[#464E5F] flex items-center gap-2">
          <Images className="w-4 h-4 text-[#173872]" />
          Imagens de Referência
          {images.length > 0 && (
            <span className="text-xs text-[#80808F]">({images.length})</span>
          )}
        </h3>

        <DropZone
          onFileDrop={addImages}
          accept=".png,.jpg,.jpeg,.webp"
          multiple
          icon={<Images className="w-10 h-10" />}
          label="Arraste imagens aqui ou clique para selecionar"
          hint="PNG, JPG, WebP (máx 20MB cada, múltiplos arquivos)"
        />

        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {images.map((img, idx) => (
              <div
                key={img.id}
                className="relative group bg-white rounded-lg overflow-hidden border border-[#e8e8e8]"
              >
                <div className="absolute top-1 left-1 bg-[#173872] text-white text-xs px-1.5 py-0.5 rounded font-medium z-10">
                  {idx + 1}
                </div>
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute top-1 right-1 p-1 bg-[#F64E60] hover:bg-[#ED3237] rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="w-full h-32 object-cover"
                />
                <div className="p-2">
                  <p className="text-xs text-[#80808F] truncate">{img.name}</p>
                  <p className="text-xs text-[#80808F]/70">
                    {formatFileSize(img.size)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
