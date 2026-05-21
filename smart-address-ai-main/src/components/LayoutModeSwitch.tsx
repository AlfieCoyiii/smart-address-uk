import { ArrowLeftRight } from "lucide-react";
import {
  applyLayoutPatch,
  switchLayoutModeButtonLabel,
  switchLayoutModeTooltip,
  targetLayoutMode,
  type OutputLayoutConfig,
} from "@/lib/outputLayout";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type LayoutModeSwitchProps = {
  layout: OutputLayoutConfig;
  onChange: (layout: OutputLayoutConfig) => void;
};

export function LayoutModeSwitch({ layout, onChange }: LayoutModeSwitchProps) {
  const switchLabel = switchLayoutModeButtonLabel(layout);
  const switchTooltip = switchLayoutModeTooltip(layout);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(applyLayoutPatch(layout, { mode: targetLayoutMode(layout) }))}
          className="gap-1.5"
        >
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          {switchLabel}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[260px]">
        <p className="font-medium text-foreground">{switchLabel}</p>
        <p className="mt-1 text-muted-foreground">{switchTooltip}</p>
        <p className="mt-1.5 text-muted-foreground">You can switch after splitting — no need to re-parse.</p>
      </TooltipContent>
    </Tooltip>
  );
}
