import { cn } from "@/lib/utils";
import type { DisplayColumn } from "@/lib/outputLayout";

type AddressOutputTableProps = {
  columns: DisplayColumn[];
  getColumnLabel: (col: DisplayColumn) => string;
  /** When true, only the header row is shown (matches results table before any rows exist). */
  headerOnly?: boolean;
  /** Inside another card shell (e.g. collapsible output bar) — no outer border/radius. */
  embedded?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function AddressOutputTable({
  columns,
  getColumnLabel,
  headerOnly = false,
  embedded = false,
  className,
  children,
}: AddressOutputTableProps) {
  return (
    <div
      className={cn(
        embedded ? "overflow-hidden" : "rounded-xl border border-border bg-card overflow-hidden",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-10">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                >
                  {getColumnLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          {!headerOnly && children}
        </table>
      </div>
    </div>
  );
}
