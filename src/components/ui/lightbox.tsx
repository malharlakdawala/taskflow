"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Full-screen image viewer.
 *
 * Pasted screenshots are the main thing people put in comments here, and a
 * screenshot of a table is unreadable at the 18rem the prose styles cap it to.
 * So the rendered image is a thumbnail and this is the real view: it opens at
 * fit-to-window, zooms on click, wheel or the toolbar, and pans by dragging
 * once there is something to pan.
 *
 * Built on Base UI's Dialog primitives rather than the styled Dialog because
 * this wants the whole viewport, not a centred card — but it still inherits
 * focus trapping, Escape-to-close and the scroll lock from them.
 */

export interface LightboxImage {
  src: string;
  alt?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;
/** Where a single click lands. Enough to read a screenshot, short of pixels. */
const CLICK_SCALE = 2.5;
const STEP = 1.5;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

type Offset = { x: number; y: number };
const ORIGIN: Offset = { x: 0, y: 0 };

export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  /** Null when closed — the index of the image being viewed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const isOpen = index !== null && index >= 0 && index < images.length;

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        {/* Deliberately no exit animation, and the popup below is never
            conditionally removed. Base UI holds the backdrop open until the
            popup's closing animation reports back — pull the popup out from
            under it, or leave it animating, and the backdrop can be left
            covering the page, swallowing every click. */}
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/90 duration-150 data-open:animate-in data-open:fade-in-0" />
        <Viewer
          // Remounting per image is what resets the zoom and pan — cheaper to
          // reason about than clearing four pieces of state by hand, and it
          // guarantees nothing is carried over from the previous picture.
          key={index ?? "closed"}
          image={isOpen ? images[index] : null}
          index={index ?? 0}
          count={images.length}
          onIndexChange={onIndexChange}
          onClose={onClose}
        />
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Viewer({
  image,
  index,
  count,
  onIndexChange,
  onClose,
}: {
  /** Null only for the frame between closing and the portal unmounting. */
  image: LightboxImage | null;
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Offset>(ORIGIN);
  const [isDragging, setIsDragging] = useState(false);

  // Transform state is read inside pointer and wheel handlers that must not be
  // rebound on every frame, so it is mirrored into refs and written through a
  // single setter. Reading state inside those handlers would either capture a
  // stale value or force the listeners to be re-registered constantly.
  const scaleRef = useRef(MIN_SCALE);
  const offsetRef = useRef<Offset>(ORIGIN);

  /** Keeps the image from being dragged entirely off the screen. */
  const constrain = useCallback((nextScale: number, next: Offset): Offset => {
    const element = imageRef.current;
    const viewport = viewportRef.current;
    if (!element || !viewport || nextScale <= MIN_SCALE) return ORIGIN;

    const maxX = Math.max(
      0,
      (element.offsetWidth * nextScale - viewport.clientWidth) / 2
    );
    const maxY = Math.max(
      0,
      (element.offsetHeight * nextScale - viewport.clientHeight) / 2
    );
    return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }, []);

  const apply = useCallback(
    (nextScale: number, next: Offset) => {
      const s = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const o = constrain(s, next);
      scaleRef.current = s;
      offsetRef.current = o;
      setScale(s);
      setOffset(o);
    },
    [constrain]
  );

  const reset = useCallback(() => apply(MIN_SCALE, ORIGIN), [apply]);

  /**
   * Zooms around a point, so whatever is under the cursor stays under it.
   * Zooming to the centre instead means the detail you aimed at slides away
   * exactly when you magnify it.
   */
  const zoomTo = useCallback(
    (nextScale: number, clientX?: number, clientY?: number) => {
      const viewport = viewportRef.current;
      const s = clamp(nextScale, MIN_SCALE, MAX_SCALE);

      if (!viewport || clientX === undefined || clientY === undefined) {
        apply(s, s <= MIN_SCALE ? ORIGIN : offsetRef.current);
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const centreX = rect.left + rect.width / 2;
      const centreY = rect.top + rect.height / 2;
      const previous = scaleRef.current;
      const { x, y } = offsetRef.current;

      // Where the cursor sits in the image's own space, before and after.
      const unitX = (clientX - centreX - x) / previous;
      const unitY = (clientY - centreY - y) / previous;

      apply(s, {
        x: clientX - centreX - unitX * s,
        y: clientY - centreY - unitY * s,
      });
    },
    [apply]
  );

  // React attaches wheel listeners passively, which forbids preventDefault, so
  // scrolling over the image would scroll the page behind it. Registered by
  // hand to opt out.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomTo(scaleRef.current * Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  /* Drag to pan. Pointer events cover mouse and touch with one path. */
  const drag = useRef<{ x: number; y: number; from: Offset; moved: boolean } | null>(
    null
  );

  /**
   * Releasing the mouse after a pan also fires a click on the image, which
   * would toggle the zoom straight back off. The pointer sequence ends before
   * the click arrives, so "that was a drag" has to be remembered rather than
   * re-derived.
   */
  const swallowNextClick = useRef(false);

  const onPointerDown = (event: React.PointerEvent) => {
    swallowNextClick.current = false;
    if (scaleRef.current <= MIN_SCALE || event.button !== 0) return;
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      from: offsetRef.current,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const active = drag.current;
    if (!active) return;

    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    // A few pixels of travel is a shaky click, not a drag — without the slack,
    // click-to-zoom would almost never fire on a trackpad.
    if (!active.moved && Math.hypot(dx, dy) < 4) return;

    active.moved = true;
    setIsDragging(true);
    apply(scaleRef.current, { x: active.from.x + dx, y: active.from.y + dy });
  };

  const endDrag = () => {
    if (drag.current?.moved) swallowNextClick.current = true;
    drag.current = null;
    setIsDragging(false);
  };

  const go = (delta: number) => {
    if (count < 2) return;
    onIndexChange((index + delta + count) % count);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        go(1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        go(-1);
        break;
      case "+":
      case "=":
        event.preventDefault();
        zoomTo(scaleRef.current * STEP);
        break;
      case "-":
        event.preventDefault();
        zoomTo(scaleRef.current / STEP);
        break;
      case "0":
        event.preventDefault();
        reset();
        break;
    }
  };

  const isZoomed = scale > MIN_SCALE;
  const caption = image?.alt?.trim();

  if (!image) return <DialogPrimitive.Popup className="fixed inset-0 z-50" />;

  return (
    <DialogPrimitive.Popup
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex flex-col outline-none duration-150 data-open:animate-in data-open:fade-in-0"
    >
      <DialogPrimitive.Title className="sr-only">
        {caption || "Image viewer"}
      </DialogPrimitive.Title>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0 truncate pl-1 text-xs text-white/70">
          {count > 1 && (
            <span className="tabular-nums">
              {index + 1} / {count}
              {caption ? " · " : ""}
            </span>
          )}
          {caption}
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          <ToolbarButton
            label="Zoom out"
            disabled={scale <= MIN_SCALE}
            onClick={() => zoomTo(scale / STEP)}
          >
            <Minus className="h-4 w-4" />
          </ToolbarButton>
          <span className="w-12 text-center text-xs tabular-nums text-white/70">
            {Math.round(scale * 100)}%
          </span>
          <ToolbarButton
            label="Zoom in"
            disabled={scale >= MAX_SCALE}
            onClick={() => zoomTo(scale * STEP)}
          >
            <Plus className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Reset zoom" disabled={!isZoomed} onClick={reset}>
            <RotateCcw className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Open original in a new tab" href={image.src}>
            <ExternalLink className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </ToolbarButton>
        </div>
      </div>

      <div
        ref={viewportRef}
        // Clicking the empty space around the image closes, the way every
        // other viewer behaves. The image itself stops the event.
        onClick={onClose}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-6"
      >
        {count > 1 && (
          <>
            <EdgeButton side="start" label="Previous image" onClick={() => go(-1)}>
              <ChevronLeft className="h-6 w-6" />
            </EdgeButton>
            <EdgeButton side="end" label="Next image" onClick={() => go(1)}>
              <ChevronRight className="h-6 w-6" />
            </EdgeButton>
          </>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          src={image.src}
          alt={image.alt ?? ""}
          draggable={false}
          onClick={(event) => {
            event.stopPropagation();
            if (swallowNextClick.current) {
              swallowNextClick.current = false;
              return;
            }
            zoomTo(
              scaleRef.current > MIN_SCALE ? MIN_SCALE : CLICK_SCALE,
              event.clientX,
              event.clientY
            );
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            // Animate the jump when zooming, but track the pointer exactly
            // while dragging.
            transition: isDragging ? "none" : "transform 150ms ease-out",
          }}
          className={cn(
            "max-h-full max-w-full touch-none select-none object-contain",
            isZoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
          )}
        />
      </div>
    </DialogPrimitive.Popup>
  );
}

function ToolbarButton({
  label,
  href,
  children,
  ...props
}: {
  label: string;
  /** Renders as a link instead of a button. */
  href?: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      className="text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-30"
      {...(href
        ? {
            // Base UI assumes a native <button> unless told otherwise, and
            // warns about the lost semantics if it isn't given one.
            nativeButton: false,
            render: <a href={href} target="_blank" rel="noopener noreferrer" />,
          }
        : {})}
      {...props}
    >
      {children}
    </Button>
  );
}

function EdgeButton({
  side,
  label,
  onClick,
  children,
}: {
  side: "start" | "end";
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/80",
        "transition-colors hover:bg-black/60 hover:text-white",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
        side === "start" ? "left-3" : "right-3"
      )}
    >
      {children}
    </button>
  );
}
