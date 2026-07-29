"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Lightbox, type LightboxImage } from "@/components/ui/lightbox";

/**
 * Marks every image as an activatable control.
 *
 * These attributes are baked into the string rather than set on the nodes
 * afterwards because React re-applies `dangerouslySetInnerHTML` on re-render —
 * every node inside is replaced, and anything written to them imperatively is
 * lost the first time the component's state changes. Which, now that it owns a
 * lightbox, is the moment the lightbox opens.
 *
 * A regex is enough here: this content has already been through the sanitiser
 * on write, so it is an allow-listed subset of HTML, not arbitrary markup.
 */
function markImagesZoomable(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (tag, attributes: string) => {
    if (/\brole\s*=/i.test(attributes)) return tag;

    // The alt came out of a quoted attribute, so it is already escaped.
    const alt = /\balt\s*=\s*"([^"]*)"/i.exec(attributes)?.[1]?.trim();
    const label = alt ? `View ${alt} full size` : "View image full size";

    return `<img role="button" tabindex="0" aria-label="${label}"${attributes}>`;
  });
}

/**
 * Renders stored rich text. Content is sanitised server-side on write (see
 * src/lib/sanitize.ts), so what reaches here is already an allow-listed subset
 * of HTML — never render arbitrary user input through this component.
 *
 * Images are capped at a thumbnail height so a pasted screenshot doesn't push
 * the rest of a comment off the screen, which leaves them unreadable on their
 * own. Clicking one opens it full-size in the lightbox.
 */
export function RichText({
  html,
  className,
  /** Off for previews and other places a modal would be the wrong response. */
  zoomable = true,
}: {
  html: string | null | undefined;
  className?: string;
  zoomable?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<LightboxImage[]>([]);
  const [index, setIndex] = useState<number | null>(null);

  // Memoised down to a stable object, so opening the lightbox doesn't re-inject
  // the markup and tear down every image node behind it.
  const markup = useMemo(() => {
    const source = html ?? "";
    return { __html: zoomable ? markImagesZoomable(source) : source };
  }, [html, zoomable]);

  /** The images are re-read on open, so an edit can't leave a stale list. */
  const openFrom = (target: EventTarget | null): boolean => {
    const container = containerRef.current;
    if (!container || !zoomable) return false;

    const image = (target as HTMLElement | null)?.closest?.("img");
    if (!image || !container.contains(image)) return false;

    const all = [...container.querySelectorAll("img")];
    setImages(
      all.map((element) => ({
        src: element.currentSrc || element.src,
        alt: element.alt || undefined,
      }))
    );
    setIndex(all.indexOf(image as HTMLImageElement));
    return true;
  };

  if (!html?.trim()) return null;

  return (
    <>
      <div
        ref={containerRef}
        // Delegated rather than bound per image, so it survives the content
        // being replaced. The events are also stopped here: in the description
        // field this prose sits inside the button that opens the editor, and
        // clicking an image should zoom it rather than start an edit.
        onClick={(event) => {
          if (openFrom(event.target)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          if (openFrom(event.target)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        className={cn(
          "prose prose-sm dark:prose-invert max-w-none",
          "prose-img:rounded-lg prose-img:border prose-img:max-w-full prose-img:h-auto prose-img:max-h-72 prose-img:object-contain",
          zoomable &&
            "prose-img:cursor-zoom-in prose-img:transition-opacity hover:prose-img:opacity-90",
          "prose-a:text-primary prose-pre:bg-muted prose-pre:text-foreground",
          className
        )}
        dangerouslySetInnerHTML={markup}
      />

      {zoomable && (
        <Lightbox
          images={images}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setIndex(null)}
        />
      )}
    </>
  );
}
