import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/react";
import { useEffectiveOrganization } from "@/hooks/useEffectiveOrganization";
import { parseAddress, type ParsedAddress } from "@/lib/addressParser";
import { parseAddressesApi, type UnsplitEntry } from "@/lib/addressApi";
import {
  findOverlongAddressLines,
  MAX_ADDRESS_LINE_CHARS,
} from "@/lib/addressLimits";
import {
  columnsForLayout,
  tableBodySegmentsForLayout,
  DEFAULT_OUTPUT_LAYOUT,
  enrichParsedAddress,
  labelForDisplayColumn,
  valueForDisplayColumn,
  type DisplayColumn,
  type OutputLayoutConfig,
} from "@/lib/outputLayout";
import { LayoutModeSwitch } from "@/components/LayoutModeSwitch";
import { OutputColumnsHeaderRow } from "@/components/EditableOutputColumns";
import { requestUsageRefresh } from "@/lib/usageEvents";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Copy, Download, Check, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const ANONYMOUS_MAX = 1;

const AddressDemo = () => {
  const { getToken, isSignedIn } = useAuth();
  const { organization, provisionError } = useEffectiveOrganization();
  const [input, setInput] = useState("");
  const [results, setResults] = useState<ParsedAddress[]>([]);
  const [unsplit, setUnsplit] = useState<UnsplitEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [outputLayout, setOutputLayout] = useState<OutputLayoutConfig>(DEFAULT_OUTPUT_LAYOUT);
  const [inputLineByResultIndex, setInputLineByResultIndex] = useState<Record<number, string>>({});
  const [splitWithoutPostcode, setSplitWithoutPostcode] = useState(false);

  const isAnonymous = !isSignedIn;
  const lines = useMemo(() => input.trim().split("\n").filter(Boolean), [input]);
  const effectiveLines = isAnonymous ? lines.slice(0, ANONYMOUS_MAX) : lines;
  const overLimitAnonymous = isAnonymous && lines.length > ANONYMOUS_MAX;

  const visibleColumns = useMemo(
    () => columnsForLayout(outputLayout),
    [outputLayout],
  );
  const bodySegments = useMemo(
    () => tableBodySegmentsForLayout(outputLayout),
    [outputLayout],
  );

  const overlongLines = useMemo(() => findOverlongAddressLines(lines), [lines]);

  const handleSplit = async () => {
    if (lines.length === 0) return;
    if (overlongLines.length > 0) {
      const preview = overlongLines
        .slice(0, 3)
        .map(({ line, length }) => `Line ${line} (${length} chars)`)
        .join(", ");
      const more = overlongLines.length > 3 ? ` and ${overlongLines.length - 3} more` : "";
      toast.error(
        `Each address must be ${MAX_ADDRESS_LINE_CHARS} characters or fewer. ${preview}${more}.`,
      );
      return;
    }
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
      const token = isSignedIn ? await getToken({ skipCache: true }) : null;
      if (isSignedIn && !token) {
        toast.error("Session token not available. Try signing out and back in.");
        setIsProcessing(false);
        return;
      }
      const addressesToSend =
        !token && lines.length > ANONYMOUS_MAX
          ? lines.slice(0, ANONYMOUS_MAX)
          : lines;

      const { results: apiResults, unsplit: apiUnsplit } = await parseAddressesApi(addressesToSend, {
        token: token ?? undefined,
        orgId: organization?.id ?? undefined,
        splitWithoutPostcode,
      });
      const lineMap: Record<number, string> = {};
      addressesToSend.forEach((addr, idx) => {
        lineMap[idx] = addr;
      });
      setInputLineByResultIndex(lineMap);
      setResults(apiResults.map((row, idx) => enrichParsedAddress(row, lineMap[idx])));
      setUnsplit(apiUnsplit);
      if (isSignedIn && organization?.id) {
        requestUsageRefresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parser unavailable. Start the backend with: cd address-splitter-main && uvicorn parse_api:app --port 8000");
      const fallbackLines =
        lines.length > ANONYMOUS_MAX ? lines.slice(0, ANONYMOUS_MAX) : lines;
      const fallbackResults = fallbackLines.map(parseAddress);
      const lineMap: Record<number, string> = {};
      fallbackLines.forEach((addr, idx) => {
        lineMap[idx] = addr;
      });
      setInputLineByResultIndex(lineMap);
      setResults(fallbackResults.map((row, idx) => enrichParsedAddress(row, lineMap[idx])));
      const fallbackUnsplit: UnsplitEntry[] = fallbackResults
        .map((r, i) => ({ line: i + 1, address: fallbackLines[i], row: r }))
        .filter(({ row }) => {
          if (splitWithoutPostcode) {
            return !row.town?.trim();
          }
          return !(row.postcodeStart || row.postcodeEnd);
        })
        .map(({ line, address }) => ({ line, address }));
      setUnsplit(fallbackUnsplit);
    } finally {
      setIsProcessing(false);
    }
  };

  const getRowValue = (row: ParsedAddress, col: DisplayColumn, rowIndex: number): string =>
    valueForDisplayColumn(row, col, outputLayout, inputLineByResultIndex[rowIndex]);

  const getColumnLabel = (col: DisplayColumn): string =>
    labelForDisplayColumn(col, outputLayout);

  const copyToClipboard = () => {
    const header = visibleColumns.map(c => getColumnLabel(c)).join("\t");
    const rows = results.map((r, i) =>
      visibleColumns.map((c) => getRowValue(r, c, i)).join("\t"),
    );
    navigator.clipboard.writeText([header, ...rows].join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCSV = () => {
    const header = visibleColumns.map(c => getColumnLabel(c)).join(",");
    const rows = results.map((r, i) =>
      visibleColumns.map((c) => `"${getRowValue(r, c, i).replace(/"/g, '""')}"`).join(","),
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
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
            Paste UK addresses (one per line). Get structured columns in seconds. No sign-up required to try one address.
          </p>
          <p className="mt-2 text-xs text-muted-foreground/90 max-w-lg mx-auto">
            We process and return — your data is never stored.
          </p>
          <p className="mt-2 text-xs text-muted-foreground/80 max-w-lg mx-auto sm:hidden">
            On a narrow window, scroll the results table horizontally to see all columns.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-5xl mx-auto"
        >
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
            <p className="mt-2 text-xs text-muted-foreground">
              Up to {MAX_ADDRESS_LINE_CHARS} characters per line.
            </p>
            {overlongLines.length > 0 && (
              <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                {overlongLines.length} line{overlongLines.length === 1 ? "" : "s"} exceed{" "}
                {MAX_ADDRESS_LINE_CHARS} characters — shorten before splitting.
              </p>
            )}
            <div className="mt-3 flex items-start gap-2">
              <Checkbox
                id="split-without-postcode"
                checked={splitWithoutPostcode}
                onCheckedChange={(checked) => setSplitWithoutPostcode(checked === true)}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="split-without-postcode"
                  className="text-sm font-normal leading-snug cursor-pointer"
                >
                  Split addresses without a postcode
                </Label>
                {splitWithoutPostcode && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                    Results may be less accurate for addresses that do not contain a UK postcode.
                  </p>
                )}
              </div>
            </div>
            {overLimitAnonymous && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                Sign in to split more than {ANONYMOUS_MAX} address at a time.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="hero"
                onClick={handleSplit}
                disabled={
                  effectiveLines.length === 0 || isProcessing || overlongLines.length > 0
                }
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

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              disabled={results.length === 0}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCSV}
              disabled={results.length === 0}
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <LayoutModeSwitch layout={outputLayout} onChange={setOutputLayout} />
              <span className="text-xs text-muted-foreground">
                {results.length > 0
                  ? `${results.length} results · ${visibleColumns.length} columns`
                  : "No results yet"}
              </span>
            </div>
          </div>

          <AnimatePresence>
            {unsplit.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
              >
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
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <OutputColumnsHeaderRow layout={outputLayout} onChange={setOutputLayout} />
                <tbody>
                  {results.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                      {bodySegments.map((segment, segIndex) => {
                        if (segment.kind === "join-spacer") {
                          return (
                            <td
                              key={`join-spacer-${segIndex}`}
                              className="w-10 px-1"
                              aria-hidden
                            />
                          );
                        }
                        const col = segment.col;
                        return (
                          <td
                            key={col}
                            className="px-4 py-2.5 text-foreground whitespace-nowrap font-mono text-xs"
                          >
                            {getRowValue(row, col, i) || (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default AddressDemo;
