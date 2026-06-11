import { Button } from "@/components/ui/button";
import { RiveAnimation } from "@/components/RiveAnimation";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const HeroSection = () => {
  return (
    <section className="relative w-full min-h-screen overflow-hidden">
      {/* Animation at ~78% size — centred in viewport */}
      <div className="absolute inset-0 z-[1] flex min-h-[100dvh] items-center justify-center">
        <div className="h-[78%] w-[78%] min-h-0">
          <RiveAnimation hero embedded height="100%" className="h-full w-full" />
        </div>
      </div>

      <div className="relative z-10 container mx-auto min-h-screen px-4 lg:px-8 pointer-events-none">
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

        {/* CTAs — bottom right */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="absolute bottom-8 lg:bottom-12 right-4 lg:right-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pointer-events-auto"
        >
          <Button variant="hero" size="lg" asChild>
            <a href="#demo" className="gap-2">
              Try it free
              <ArrowRight className="w-4 h-4" />
            </a>
          </Button>
          <Button variant="hero-outline" size="lg" asChild>
            <Link to="/pricing">View pricing</Link>
          </Button>
        </motion.div>

        {/* Trust indicators — bottom left */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          className="absolute bottom-8 lg:bottom-12 left-4 lg:left-8 pointer-events-auto"
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
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
      </div>
    </section>
  );
};

export default HeroSection;
