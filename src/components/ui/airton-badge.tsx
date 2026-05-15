import Image from "next/image";

export function AirtonBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#80808F]">
      <Image
        src="/airton-light-head-aurora.png"
        alt="Airton"
        width={16}
        height={16}
        className="rounded-full"
      />
      Airton
    </span>
  );
}
