import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";

const CONTACT_EMAIL = "help@smartadress.uk";

const Contact = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-32 pb-24">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto text-center"
          >
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Contact <span className="text-gradient-primary">us</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              If you have any questions about Smart Address UK — pricing, billing, technical setup, or anything else — we&apos;re happy to help.
            </p>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We aim to reply as soon as we can, and we will always respond within <span className="text-foreground font-medium">24 hours</span>.
            </p>
            <motion.a
              href={`mailto:${CONTACT_EMAIL}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-10 inline-flex items-center gap-3 rounded-xl border border-border bg-card px-8 py-5 text-left hover:border-primary/30 hover:bg-muted/30 transition-colors"
            >
              <Mail className="w-10 h-10 text-primary shrink-0" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Email</p>
                <p className="text-lg font-semibold text-foreground">{CONTACT_EMAIL}</p>
              </div>
            </motion.a>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Contact;
