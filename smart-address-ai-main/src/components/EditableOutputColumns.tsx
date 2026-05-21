import { Link2, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyLayoutPatch,
  headerSegmentsForLayout,
  labelForDisplayColumn,
  type ColumnJoinId,
  type OutputLayoutConfig,
} from "@/lib/outputLayout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type EditableOutputColumnsProps = {
  layout: OutputLayoutConfig;
  onChange: (layout: OutputLayoutConfig) => void;
  embedded?: boolean;
  className?: string;
};

const JOIN_LABELS: Record<ColumnJoinId, { merge: string; split: string }> = {
  "flat-building": {
    merge: "Combine flat and building into one column",
    split: "Split flat into its own column",
  },
  postcode: {
    merge: "Combine outward and inward into one postcode column",
    split: "Split postcode into outward and inward columns",
  },
};

function ColumnJoinControl({
  joinId,
  merged,
  onToggle,
}: {
  joinId: ColumnJoinId;
  merged: boolean;
  onToggle: () => void;
}) {
  const labels = JOIN_LABELS[joinId];
  const label = merged ? labels.split : labels.merge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
            merged
              ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
          aria-label={label}
        >
          {merged ? <Unlink className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[220px]">
        <p>{label}</p>
        <p className="mt-1 text-muted-foreground">Updates the table instantly — no need to re-split.</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function OutputColumnsHeaderRow({
  layout,
  onChange,
}: {
  layout: OutputLayoutConfig;
  onChange: (layout: OutputLayoutConfig) => void;
}) {
  const segments = headerSegmentsForLayout(layout);

  const toggleJoin = (joinId: ColumnJoinId, merged: boolean) => {
    if (joinId === "flat-building") {
      onChange(applyLayoutPatch(layout, { combineFlatWithBuilding: !merged }));
    } else {
      onChange(applyLayoutPatch(layout, { combinePostcode: !merged }));
    }
  };

  return (
    <thead>
      <tr className="border-b border-border bg-muted/30">
        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-10">
          #
        </th>
        {segments.map((segment, index) => {
          if (segment.kind === "join") {
            return (
              <th
                key={`join-${segment.id}-${index}`}
                className="w-10 px-1 py-2 align-middle"
              >
                <ColumnJoinControl
                  joinId={segment.id}
                  merged={segment.merged}
                  onToggle={() => toggleJoin(segment.id, segment.merged)}
                />
              </th>
            );
          }

          const col = segment.col;
          return (
            <th
              key={col}
              className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap"
            >
              {labelForDisplayColumn(col, layout)}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function EditableOutputColumns({
  layout,
  onChange,
  embedded = false,
  className,
}: EditableOutputColumnsProps) {
  return (
    <div
      className={cn(
        embedded
          ? "overflow-hidden rounded-t-xl border border-border bg-card"
          : "rounded-xl border border-border bg-card overflow-hidden",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <OutputColumnsHeaderRow layout={layout} onChange={onChange} />
        </table>
      </div>
    </div>
  );
}
