import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type ParseSettingsMenuProps = {
  requireValidPostcode: boolean;
  onRequireValidPostcodeChange: (value: boolean) => void;
};

export function ParseSettingsMenu({
  requireValidPostcode,
  onRequireValidPostcodeChange,
}: ParseSettingsMenuProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label="Parser settings"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <p className="text-sm font-medium text-foreground">Parser settings</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          By default we split incomplete lines (no postcode or town). Turn on strict mode only if
          you need postcode-validated output.
        </p>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="require-valid-postcode" className="text-sm font-normal leading-snug">
              Require valid UK postcode
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Lines without a valid postcode are not split. Credits for those lines are refunded.
            </p>
          </div>
          <Switch
            id="require-valid-postcode"
            checked={requireValidPostcode}
            onCheckedChange={onRequireValidPostcodeChange}
            className="mt-0.5 shrink-0"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
