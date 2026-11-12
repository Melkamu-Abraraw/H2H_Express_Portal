import Image from "next/image";

// The H2H delivery van, with a light-outline copy for dark mode.
export function VanImage({ className = "", preload = false }) {
  const shared = { width: 480, height: 255, preload, draggable: false };
  return (
    <span className={`relative block ${className}`} aria-hidden="true">
      <Image src="/images/van-light.png" alt="" className="h-auto w-full dark:hidden" {...shared} />
      <Image src="/images/van-dark.png" alt="" className="hidden h-auto w-full dark:block" {...shared} />
    </span>
  );
}

// The van driving along a scrolling road, carrying its package.
export function VanLoader({ label = "Loading", detail, size = "w-40 sm:w-44", preload = false }) {
  return (
    <div role="status" className="flex flex-col items-center gap-5">
      <div className={`van-drive-in ${size}`}>
        <VanImage className="van-bob" preload={preload} />
        <div className="van-road mx-auto mt-1 h-1 w-[130%] -translate-x-[11.5%] rounded-full opacity-40" />
      </div>
      <div className="text-center">
        <p className="text-lg font-semibold tracking-tight">{label}</p>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}
