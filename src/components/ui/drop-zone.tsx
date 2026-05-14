"use client";

import { useCallback, useState, DragEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFileDrop: (files: FileList) => void;
  accept?: string;
  multiple?: boolean;
  icon: ReactNode;
  label: string;
  hint?: string;
  className?: string;
  disabled?: boolean;
}

export function DropZone({
  onFileDrop,
  accept,
  multiple = false,
  icon,
  label,
  hint,
  className,
  disabled,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!disabled && e.dataTransfer.files.length) {
        onFileDrop(e.dataTransfer.files);
      }
    },
    [disabled, onFileDrop]
  );

  const handleClick = useCallback(() => {
    if (disabled) return;
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    input.multiple = multiple;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files?.length) onFileDrop(files);
    };
    input.click();
  }, [accept, disabled, multiple, onFileDrop]);

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200",
        isDragging
          ? "border-[#173872] bg-[#173872]/5"
          : "border-[#d0d0d0] hover:border-[#173872]/50 bg-[#F9F9F9]",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <div className="text-4xl mb-3 text-[#80808F]">{icon}</div>
      <p className="text-[#464E5F] font-medium">{label}</p>
      {hint && <p className="text-[#80808F]/70 text-sm mt-1">{hint}</p>}
    </div>
  );
}
