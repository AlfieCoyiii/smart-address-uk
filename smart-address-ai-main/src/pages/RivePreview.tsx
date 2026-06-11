import { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { RiveAnimation } from "@/components/RiveAnimation";
import { Button } from "@/components/ui/button";

/**
 * Local preview for tuning Rive crop. Open http://localhost:8080/rive-preview
 * Remove this route before production if you prefer (or keep — harmless).
 */
const RivePreview = () => {
  const [scale, setScale] = useState(1.06);
  const [offsetY, setOffsetY] = useState(0);
  const [height, setHeight] = useState(380);
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 lg:px-8 pt-28 pb-16 max-w-3xl">
        <h1 className="text-2xl font-bold text-foreground">Rive animation preview</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          File: <code className="text-xs bg-muted px-1 py-0.5 rounded">public/animations/smartaddress-approved.riv</code>.
          Use the sliders to crop without re-exporting. When it looks right, tell us the numbers (or we copy defaults into the hero).
        </p>

        <p className="mt-4 text-xs text-muted-foreground">
          Still blank? Open{" "}
          <a href="/rive-debug.html" className="text-primary hover:underline font-medium">
            /rive-debug.html
          </a>{" "}
          (no React) or{" "}
          <a href="/rive-artboard-test.html?artboard=Animation" className="text-primary hover:underline font-medium">
            /rive-artboard-test.html
          </a>{" "}
          to test artboards.
        </p>

        <div className="mt-4">
          <RiveAnimation height={height} crop={{ scale, offsetYPercent: offsetY }} />
        </div>

        <div className="mt-8 space-y-6 rounded-xl border border-border bg-card p-6">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Crop zoom</span>
            <span className="text-muted-foreground ml-2 tabular-nums">{scale.toFixed(2)}×</span>
            <input
              type="range"
              min={1}
              max={1.25}
              step={0.01}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
            <span className="text-xs text-muted-foreground">Above 1.0 trims empty edges.</span>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">Vertical position</span>
            <span className="text-muted-foreground ml-2 tabular-nums">{offsetY}%</span>
            <input
              type="range"
              min={-15}
              max={15}
              step={0.5}
              value={offsetY}
              onChange={(e) => setOffsetY(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">Frame height</span>
            <span className="text-muted-foreground ml-2 tabular-nums">{height}px</span>
            <input
              type="range"
              min={240}
              max={520}
              step={10}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </label>

          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            To edit the source file visually, open{" "}
            <a
              href="https://rive.app/editor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              rive.app/editor
            </a>{" "}
            (free account) → Import → upload the <code>.riv</code> file.
          </p>
        </div>

        <div className="mt-8 flex gap-3">
          <Button variant="hero-outline" asChild>
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default RivePreview;
