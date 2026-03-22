import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { motion } from "framer-motion";
import { Split, Cpu, Table, Download, Info } from "lucide-react";

const HowItWorks = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-32 pb-24">
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-center">
              How it <span className="text-gradient-primary">works</span>
            </h1>
            <p className="mt-4 text-lg text-muted-foreground text-center max-w-lg mx-auto">
              You send UK address lines. We return them split into structured columns — flat, building, street number, street name, town, postcode. No validation, no lookups: we structure the text you send so it’s ready for your systems.
            </p>

            <div className="mt-12 space-y-8">
              {[
                {
                  icon: Split,
                  title: "Send your data",
                  description: "Upload or paste UK address lines — one per line, up to 3,000 per request. Messy formatting, extra text, and odd punctuation are fine. We use pattern recognition to extract the parts that matter.",
                },
                {
                  icon: Cpu,
                  title: "We structure it",
                  description: "Each line is parsed into consistent columns. We don’t validate against any database or correct spelling; we only split and structure. That means we can handle descriptions and non-standard lines that validators often reject.",
                },
                {
                  icon: Table,
                  title: "Review and export",
                  description: "Results come back in a table. Toggle columns, copy to clipboard, or download as CSV. Drop the output straight into your CRM, spreadsheet, or migration pipeline.",
                },
                {
                  icon: Download,
                  title: "Use it downstream",
                  description: "Structured data is ready for mail merge, reporting, compliance, or any process that needs clean address fields. Try the demo above to see your own addresses split.",
                },
              ].map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex gap-6 items-start"
                >
                  <div className="shrink-0 w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <step.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-14 rounded-xl border border-border/50 bg-card/30 p-5 flex gap-3">
              <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground space-y-2">
                <p className="text-foreground/90 font-medium">Details that matter</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong className="text-foreground">No postcode, no split.</strong> We only split lines that contain a valid UK postcode; others are returned as-is.</li>
                  <li><strong className="text-foreground">You’re only charged for what we split.</strong> If we can’t structure an address, no token is used.</li>
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default HowItWorks;
