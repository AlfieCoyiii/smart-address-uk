import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/react";
import { useEffectiveOrganization } from "@/hooks/useEffectiveOrganization";
import { parseAddress, COLUMN_LABELS, type ColumnKey, type ParsedAddress } from "@/lib/addressParser";
import { parseAddressesApi, type UnsplitEntry } from "@/lib/addressApi";
import { requestUsageRefresh } from "@/lib/usageEvents";
import { Button } from "@/components/ui/button";
import { Copy, Download, Check, Loader2, AlertCircle, Monitor } from "lucide-react";
import { toast } from "sonner";

const ANONYMOUS_MAX = 1;

const ALL_COLUMNS: ColumnKey[] = ["flatNumber", "buildingName", "streetNumber", "streetName", "town", "postcodeStart", "postcodeEnd"];

const AddressDemo = () => {
  const { getToken, isSignedIn } = useAuth();
  const { organization, provisionError } = useEffectiveOrganization();
  const [input, setInput] = useState("");
  const [results, setResults] = useState<ParsedAddress[]>([]);
  const [unsplit, setUnsplit] = useState<UnsplitEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeColumns, setActiveColumns] = useState<Set<ColumnKey>>(new Set(ALL_COLUMNS));
  const [combinePostcode, setCombinePostcode] = useState(false);

  const isAnonymous = !isSignedIn;
  const lines = useMemo(() => input.trim().split("\n").filter(Boolean), [input]);
  const effectiveLines = isAnonymous ? lines.slice(0, ANONYMOUS_MAX) : lines;
  const overLimitAnonymous = isAnonymous && lines.length > ANONYMOUS_MAX;

  const visibleColumns = useMemo(() => {
    let cols = ALL_COLUMNS.filter(c => activeColumns.has(c));
    if (combinePostcode) {
      cols = cols.filter(c => c !== "postcodeStart" && c !== "postcodeEnd");
      if (activeColumns.has("postcodeStart") || activeColumns.has("postcodeEnd")) {
        cols.push("postcodeStart" as ColumnKey); // we'll render combined
      }
    }
    return cols;
  }, [activeColumns, combinePostcode]);

  const handleSplit = async () => {
    if (lines.length === 0) return;
    if (isSignedIn && !organization?.id) {
      toast.error(
        provisionError
          ? "Workspace setup failed. Refresh the page or sign out and back in."
          : "Your workspace is still loading — try again in a moment.",
      );
      return;
    }
    setIsProcessing(true);
    setUnsplit([]);
    try {
      // Fresh token so backend can verify (skipCache in case of stale/empty)
      const token = isSignedIn ? await getToken({ skipCache: true }) : null;
      if (isSignedIn && !token) {
        toast.error("Session token not available. Try signing out and back in.");
        setIsProcessing(false);
        return;
      }
      // When no token, only send first address so backend and UI never see more than 1
      const addressesToSend =
        !token && lines.length > ANONYMOUS_MAX
          ? lines.slice(0, ANONYMOUS_MAX)
          : lines;

      const { results: apiResults, unsplit: apiUnsplit } = await parseAddressesApi(addressesToSend, {
        token: token ?? undefined,
        orgId: organization?.id ?? undefined,
      });
      setResults(apiResults);
      setUnsplit(apiUnsplit);
      if (isSignedIn && organization?.id) {
        requestUsageRefresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parser unavailable. Start the backend with: cd address-splitter-main && uvicorn parse_api:app --port 8000");
      const fallbackLines =
        lines.length > ANONYMOUS_MAX ? lines.slice(0, ANONYMOUS_MAX) : lines;
      const fallbackResults = fallbackLines.map(parseAddress);
      setResults(fallbackResults);
      const fallbackUnsplit: UnsplitEntry[] = fallbackResults
        .map((r, i) => ({ line: i + 1, address: fallbackLines[i], row: r }))
        .filter(({ row }) => !(row.postcodeStart || row.postcodeEnd))
        .map(({ line, address }) => ({ line, address }));
      setUnsplit(fallbackUnsplit);
    } finally {
      setIsProcessing(false);
    }
  };

  const getRowValue = (row: ParsedAddress, col: ColumnKey): string => {
    if (combinePostcode && col === "postcodeStart") {
      return [row.postcodeStart, row.postcodeEnd].filter(Boolean).join(" ");
    }
    return row[col];
  };

  const getColumnLabel = (col: ColumnKey): string => {
    if (combinePostcode && col === "postcodeStart") return "Postcode";
    return COLUMN_LABELS[col];
  };

  const toggleColumn = (col: ColumnKey) => {
    setActiveColumns(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const copyToClipboard = () => {
    const header = visibleColumns.map(c => getColumnLabel(c)).join("\t");
    const rows = results.map(r => visibleColumns.map(c => getRowValue(r, c)).join("\t"));
    navigator.clipboard.writeText([header, ...rows].join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCSV = () => {
    const header = visibleColumns.map(c => getColumnLabel(c)).join(",");
    const rows = results.map(r =>
      visibleColumns.map(c => `"${getRowValue(r, c)}"`).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smartaddressuk-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section id="demo" className="relative py-16 lg:py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            See it in <span className="text-gradient-primary">action</span>
          </h2>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto md:hidden">
            The live address parser is optimised for larger screens. Please use a{" "}
            <strong className="text-foreground">desktop or tablet</strong> to paste addresses and
            split them. You can still use this site on your phone for{" "}
            <strong className="text-foreground">sign in, pricing, billing, and team settings</strong>
            .
          </p>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto hidden md:block">
            Paste UK addresses (one per line). Get structured columns in seconds. No sign-up required to try one address.
          </p>
          <p className="mt-2 text-xs text-muted-foreground/90 max-w-lg mx-auto hidden md:block">
            We process and return — your data is never stored.
          </p>
        </motion.div>

        {/* Mobile / small screens: parser unavailable — rest of site still works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-lg mx-auto md:hidden"
        >
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/5">
              <Monitor className="h-7 w-7 text-primary" aria-hidden />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Please use a desktop for the parser</h3>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              The address demo needs a wider layout for pasting lines and viewing the results table.
              Open this page on a computer when you want to try splitting addresses.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-5xl mx-auto hidden md:block"
        >
          {/* Input area */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-3">
              <label className="text-sm font-medium text-foreground">Paste your addresses</label>
            </div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={"Flat 3, Ashton House, 14 Baker Street, London, W1U 3BU\n27 High Street, Manchester, M4 1HQ\nSuite 12 Regency Court 45 King's Road Brighton BN1 2FA"}
              className="w-full h-40 bg-background border border-border rounded-lg p-4 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
            />
            {overLimitAnonymous && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                Sign in to split more than {ANONYMOUS_MAX} address at a time.
              </p>
            )}
            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="hero"
                onClick={handleSplit}
                disabled={effectiveLines.length === 0 || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Split Addresses"
                )}
              </Button>
              <span className="text-xs text-muted-foreground">
                {input.trim()
                  ? `${effectiveLines.length}${overLimitAnonymous ? ` of ${lines.length} (max ${ANONYMOUS_MAX} when not signed in)` : ` address${effectiveLines.length === 1 ? "" : "s"}`}`
                  : "One address per line"}
              </span>
            </div>
          </div>

          {/* Results */}
          <AnimatePresence>
            {results.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4 }}
                className="mt-6"
              >
                {/* Column controls */}
                <div className="rounded-xl border border-border bg-card p-4 mb-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Columns:</span>
                    {ALL_COLUMNS.map(col => (
                      <label key={col} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeColumns.has(col)}
                          onChange={() => toggleColumn(col)}
                          className="rounded border-border text-primary focus:ring-primary/50"
                        />
                        <span className="text-foreground">{COLUMN_LABELS[col]}</span>
                      </label>
                    ))}
                    <div className="ml-auto flex items-center gap-1.5">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={combinePostcode}
                          onChange={() => setCombinePostcode(!combinePostcode)}
                          className="rounded border-border text-primary focus:ring-primary/50"
                        />
                        <span className="text-foreground">Combine Postcode</span>
                      </label>
                    </div>
                  </div>
                </div>

                {unsplit.length > 0 && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {unsplit.length} address{unsplit.length === 1 ? "" : "es"} could not be split — your credits have been returned
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground font-mono max-h-40 overflow-y-auto">
                          {unsplit.map(({ line, address }) => (
                            <li key={line}>
                              <span className="text-amber-600 dark:text-amber-400 font-medium">Line {line}:</span>{" "}
                              <span className="break-all">{address}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions bar */}
                <div className="flex items-center gap-3 mb-4">
                  <Button variant="outline" size="sm" onClick={copyToClipboard}>
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy to Clipboard"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadCSV}>
                    <Download className="w-3.5 h-3.5" />
                    Download CSV
                  </Button>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {results.length} results · {visibleColumns.length} columns
                  </span>
                </div>

                {/* Results table */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-10">#</th>
                          {visibleColumns.map(col => (
                            <th key={col} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                              {getColumnLabel(col)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((row, i) => (
                          <motion.tr
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                          >
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                            {visibleColumns.map(col => (
                              <td key={col} className="px-4 py-2.5 text-foreground whitespace-nowrap font-mono text-xs">
                                {getRowValue(row, col) || <span className="text-muted-foreground/30">—</span>}
                              </td>
                            ))}
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
};

export default AddressDemo;
