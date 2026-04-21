"use client";

import { useCallback } from "react";
import { Images, X } from "lucide-react";
import { DropZone } from "@/components/ui/drop-zone";
import { showToast } from "@/components/ui/toast";
import { formatFileSize } from "@/lib/utils";
import type { UploadedImage } from "@/lib/types";

interface Props {
  images: UploadedImage[];
  onImagesChange: (imgs: UploadedImage[]) => void;
}

export function ImageUploadStep({ images, onImagesChange }: Props) {
  const addImages = useCallback(
    (files: FileList) => {
      const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
      const newImages: UploadedImage[] = [];

      Array.from(files).forEach((file) => {
        if (!validTypes.includes(file.type)) {
          showToast(`${file.name} não é PNG/JPG/WebP.`, "error");
          return;
        }
        if (file.size > 20 * 1024 * 1024) {
          showToast(`${file.name} muito grande (máx 20MB)`, "error");
          return;
        }

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

          if (newImages.length === Array.from(files).filter(
            (f) => validTypes.includes(f.type) && f.size <= 20 * 1024 * 1024
          ).length) {
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

  const totalSize = images.reduce((sum, img) => sum + img.size, 0);

  return (
    <div className="space-y-4">
      <DropZone
        onFileDrop={addImages}
        accept=".png,.jpg,.jpeg,.webp"
        multiple
        icon={<Images className="w-10 h-10" />}
        label="Arraste imagens aqui ou clique para selecionar"
        hint="PNG, JPG, WebP (máx 20MB cada, múltiplos arquivos)"
      />

      {images.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {images.map((img, idx) => (
              <div
                key={img.id}
                className="relative group bg-gray-800 rounded-lg overflow-hidden border border-gray-700"
              >
                <div className="absolute top-1 left-1 bg-violet-600 text-white text-xs px-1.5 py-0.5 rounded font-medium z-10">
                  {idx + 1}
                </div>
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute top-1 right-1 p-1 bg-red-600 hover:bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <X className="w-3 h-3" />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="w-full h-32 object-cover"
                />
                <div className="p-2">
                  <p className="text-xs text-gray-400 truncate">{img.name}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(img.size)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-4 text-xs text-gray-500">
            <span>{images.length} imagem(ns)</span>
            <span>{formatFileSize(totalSize)} total</span>
          </div>
        </>
      )}
    </div>
  );
}
