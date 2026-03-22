import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";

const DATA_SOURCES = [
  {
    name: "OpenStreetMap",
    text: "© OpenStreetMap contributors, available under the Open Database Licence (ODbL)",
    url: "https://www.openstreetmap.org/copyright",
  },
  {
    name: "OS Open Names",
    text: "OS Open Names data © Crown copyright and database right 2025. Contains public sector information licensed under the Open Government Licence v3.0.",
    url: "https://www.ordnancesurvey.co.uk/products/open-names",
  },
  {
    name: "OpenAddresses",
    text: "Additional address data from OpenAddresses contributors.",
    url: "https://openaddresses.io/",
  },
];

const DataSources = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-32 pb-24">
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Data sources & attribution
            </h1>
            <p className="mt-4 text-muted-foreground">
              This service uses address and geographic data from the following open data sources.
            </p>

            <div className="mt-10 rounded-xl border border-border/50 bg-card/30 p-5">
              <h2 className="text-base font-semibold text-foreground mb-2">
                We do not store your address data
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Addresses you paste or send to our API are processed in memory and the structured result is returned to you. We do not save, log, or retain the address content you submit. The only data we persist is aggregate usage (e.g. how many addresses your team has processed in a billing period) for limits and billing — never the addresses themselves.
              </p>
            </div>

            <h2 className="text-lg font-semibold text-foreground mt-12 mb-4">
              Open data attribution
            </h2>
            <ul className="space-y-6">
              {DATA_SOURCES.map((source, i) => (
                <li
                  key={source.name}
                  className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card/30 p-4"
                >
                  <span className="text-sm font-semibold text-foreground">
                    {source.name}
                  </span>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {source.text}
                  </p>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-1"
                    >
                      <span>More information</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default DataSources;
