import { Button } from "@/components/ui/button";
import { RiveAnimation } from "@/components/RiveAnimation";
import { useIsMobile } from "@/hooks/use-mobile";
import { Fit } from "@rive-app/react-canvas";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const HeroSection = () => {
  const isMobile = useIsMobile();

  return (
    <section className="relative w-full min-h-[100dvh] overflow-hidden lg:min-h-screen">
      {/* Desktop: ~78% centred. Mobile: full width band with Contain so nothing is cropped. */}
      <div
        className={cn(
          "absolute inset-0 z-[1] flex min-h-[100dvh] items-center justify-center",
          isMobile && "px-3 pt-36 pb-44",
        )}
      >
        <div
          className={cn(
            isMobile
              ? "h-full w-full max-h-[min(52dvh,420px)] max-w-full"
              : "h-[78%] w-[78%] min-h-0",
          )}
        >
          <RiveAnimation
            hero
            embedded
            height="100%"
            fit={isMobile ? Fit.Contain : Fit.Cover}
            className="h-full w-full"
          />
        </div>
      </div>

      <div className="relative z-10 container mx-auto min-h-[100dvh] px-4 lg:min-h-screen lg:px-8 pointer-events-none">
        {/* Headline — top left */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="absolute top-24 lg:top-28 left-4 lg:left-8 max-w-xl lg:max-w-2xl pointer-events-auto"
        >
          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold leading-[1.08] tracking-tight">
            Stop formatting UK addresses{" "}
            <span className="text-gradient-primary">manually.</span>
          </h1>
          <p className="mt-4 text-sm sm:text-base lg:text-lg text-muted-foreground leading-relaxed max-w-lg">
            Parse and split thousands of UK address lines into clean columns — flat, street, town, postcode.
          </p>
        </motion.div>

        {/* Trust indicators — above CTAs on mobile, bottom-left on desktop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          className="absolute bottom-[10.5rem] left-4 right-4 pointer-events-auto sm:bottom-8 sm:left-4 sm:right-auto lg:bottom-12 lg:left-8"
        >
          <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2 sm:text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Up to 10,000 per request
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Process & return only — we don’t store data
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              GDPR compliant
            </span>
          </div>
        </motion.div>

        {/* CTAs — bottom right (stacked full-width on small screens) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className={cn(
            "absolute flex flex-col gap-3 pointer-events-auto",
            "bottom-6 left-4 right-4 sm:bottom-8 sm:left-auto sm:right-4 sm:flex-row sm:items-center",
            "lg:bottom-12 lg:right-8",
          )}
        >
          <Button variant="hero" size="lg" asChild className="w-full sm:w-auto">
            <a href="#demo" className="gap-2">
              Try it free
              <ArrowRight className="w-4 h-4" />
            </a>
          </Button>
          <Button variant="hero-outline" size="lg" asChild className="w-full sm:w-auto">
            <Link to="/pricing">View pricing</Link>
          </Button>
        </motion.div>

      </div>
    </section>
  );
};

export default HeroSection;
