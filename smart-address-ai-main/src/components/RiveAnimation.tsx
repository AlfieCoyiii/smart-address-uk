import { useEffect, useMemo } from "react";
import { useRive, Layout, Fit, Alignment } from "@rive-app/react-canvas";
import type { Rive as RiveInstance } from "@rive-app/canvas";
import { cn } from "@/lib/utils";

export const RIVE_ANIMATION_SRC = "/animations/smartaddress-approved.riv";

/** Main hero artboard (default "Artboard" in the file is empty). */
export const RIVE_ARTBOARD = "Animation";
export const RIVE_STATE_MACHINE = "State Machine 1";

export type RiveCrop = {
  scale?: number;
  offsetYPercent?: number;
};

type RiveAnimationProps = {
  className?: string;
  height?: number | string;
  crop?: RiveCrop;
  embedded?: boolean;
  /** Full-viewport hero: Cover fit + forced 2× render for crisp text. */
  hero?: boolean;
  fit?: Fit;
};

/** Minimum 2× buffer so address labels stay sharp on 1× monitors. */
export function heroPixelRatio(): number {
  if (typeof window === "undefined") return 2;
  return Math.min(Math.max(window.devicePixelRatio, 2), 3);
}

function applyHeroSharpness(rive: RiveInstance) {
  rive.resizeDrawingSurfaceToCanvas(heroPixelRatio());
}

export function RiveAnimation({
  className,
  height = 360,
  crop = { scale: 1, offsetYPercent: 0 },
  embedded = false,
  hero = false,
  fit,
}: RiveAnimationProps) {
  const scale = crop.scale ?? 1;
  const offsetY = crop.offsetYPercent ?? 0;
  const useCropTransform = !hero && (scale !== 1 || offsetY !== 0);
  const resolvedFit = fit ?? (hero ? Fit.Cover : Fit.Contain);

  const layout = useMemo(
    () =>
      new Layout({
        fit: resolvedFit,
        alignment: Alignment.Center,
      }),
    [resolvedFit],
  );

  const { RiveComponent, rive } = useRive(
    {
      src: RIVE_ANIMATION_SRC,
      artboard: RIVE_ARTBOARD,
      stateMachines: RIVE_STATE_MACHINE,
      autoplay: true,
      layout,
      onRiveReady: (instance) => {
        if (hero) {
          applyHeroSharpness(instance);
        } else {
          instance.resizeDrawingSurfaceToCanvas();
          instance.resizeToCanvas();
        }
      },
    },
    {
      shouldResizeCanvasToContainer: true,
      useDevicePixelRatio: true,
      useOffscreenRenderer: true,
    },
  );

  // Re-apply layout when fit changes (e.g. mobile Contain vs desktop Cover).
  useEffect(() => {
    if (!rive) return;
    rive.layout = layout;
    if (hero) {
      applyHeroSharpness(rive);
    } else {
      rive.resizeDrawingSurfaceToCanvas();
      rive.resizeToCanvas();
    }
  }, [rive, layout, hero]);

  // React hook sizes canvas at 1× on standard monitors — re-sharpen after each resize.
  useEffect(() => {
    if (!hero || !rive) return;

    const sharpen = () => requestAnimationFrame(() => applyHeroSharpness(rive));
    sharpen();

    const container = rive.canvas.parentElement;
    if (!container) return;

    const observer = new ResizeObserver(sharpen);
    observer.observe(container);
    return () => observer.disconnect();
  }, [hero, rive]);

  return (
    <div className={cn("w-full h-full", className)}>
      <div
        className={cn(
          "relative w-full h-full overflow-hidden",
          embedded ? "bg-transparent" : "rounded-xl border border-border/60 bg-[#1a1f2e]",
        )}
        style={{ height, minHeight: height }}
      >
        <div
          className="h-full w-full"
          style={
            useCropTransform
              ? {
                  transform: `translateY(${offsetY}%) scale(${scale})`,
                  transformOrigin: "center center",
                }
              : undefined
          }
        >
          <RiveComponent className="h-full w-full" />
        </div>
      </div>
      {import.meta.env.DEV && !embedded && (
        <p className="mt-2 text-center text-[10px] text-muted-foreground font-mono">
          {RIVE_ARTBOARD} · {RIVE_STATE_MACHINE}
        </p>
      )}
    </div>
  );
}
