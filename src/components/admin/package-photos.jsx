"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { packageName } from "@/components/admin/package-tracking";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Package photos are on Cloudinary, which can resize on the fly: ask for the size we show instead
// of downloading the full photo for a 32px thumbnail.
function sized(url, transform) {
  return url.includes("/image/upload/") ? url.replace("/image/upload/", `/image/upload/${transform}/`) : url;
}

// Tries the resized copy first. If Cloudinary refuses it (accounts with strict transformations
// only serve the original), falls back to the original, then to nothing.
function PhotoImage({ url, transform, onFail, alt, ...props }) {
  const [attempt, setAttempt] = useState(0);
  const sources = [sized(url, transform), url];
  return (
    // Cloudinary serves these; next/image would need the host configured.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt}
      src={sources[attempt]}
      onError={() => (attempt + 1 < sources.length && sources[attempt] !== sources[attempt + 1] ? setAttempt(attempt + 1) : onFail?.())}
    />
  );
}

function NoPhoto() {
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-md border border-dashed text-muted-foreground"
      title="No photo"
    >
      <ImageOff className="size-3.5" aria-hidden="true" />
      <span className="sr-only">No photo</span>
    </span>
  );
}

// The first photo as a small square in the list; clicking it shows every photo of the package.
export function PackagePhotoThumb({ pkg }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const photos = (pkg.photos ?? []).filter((photo) => photo?.url);

  if (!photos.length || broken) return <NoPhoto />;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${photos.length === 1 ? "photo" : `${photos.length} photos`} of ${pkg.tracking}`}
        className="relative size-8 shrink-0 overflow-hidden rounded-md border outline-none hover:ring-2 hover:ring-ring/40 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <PhotoImage
          url={photos[0].url}
          transform="c_fill,w_64,h_64,q_auto,f_auto"
          onFail={() => setBroken(true)}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          className="size-full object-cover"
        />
        {photos.length > 1 && (
          <span className="absolute right-0 bottom-0 rounded-tl bg-black/70 px-0.5 font-mono text-[9px] leading-tight text-white">
            {photos.length}
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">{pkg.tracking}</DialogTitle>
            <DialogDescription>{packageName(pkg) || "Package photos"}</DialogDescription>
          </DialogHeader>
          <div className={`grid flex-1 content-start gap-2 overflow-y-auto border-y p-4 ${photos.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {photos.map((photo, index) => (
              <a
                key={photo.url}
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border bg-muted"
                title="Open the full-size photo"
              >
                <PhotoImage
                  url={photo.url}
                  transform="c_limit,w_900,q_auto,f_auto"
                  alt={`Photo ${index + 1} of ${pkg.tracking}`}
                  loading="lazy"
                  className="max-h-[60vh] w-full object-contain"
                />
              </a>
            ))}
          </div>
          <DialogFooter className="flex-row justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
