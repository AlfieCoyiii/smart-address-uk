import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { motion } from "framer-motion";
import { Shield, Zap, Target } from "lucide-react";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-32 pb-24">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              About <span className="text-gradient-primary">Smart Address UK</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              Unstructured address data slows down operations, blocks automation, and frustrates every team that touches it. We built Smart Address UK to fix that — one API that turns messy UK address lines into clean, structured columns.
            </p>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We focus on parsing and splitting, not validation. That means we can handle the messy, non-standard lines — land descriptions, plot references, inconsistent punctuation — that validators often reject. So you get data that’s ready for your systems, without the manual cleanup.
            </p>

            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: Zap, title: "Speed", desc: "Process thousands of addresses in seconds. Batch up to 10,000 per request." },
                { icon: Target, title: "Accuracy", desc: "Pattern-based parsing built for UK formats. Handles real-world messiness." },
                { icon: Shield, title: "Trust", desc: "Your data is never stored. We process and return. GDPR compliant, enterprise-ready." },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <item.icon className="w-8 h-8 text-primary mb-4" />
                  <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default About;
