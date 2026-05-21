import { EditableOutputColumns } from "@/components/EditableOutputColumns";
import type { OutputLayoutConfig } from "@/lib/outputLayout";

type OutputLayoutPanelProps = {
  layout: OutputLayoutConfig;
  onChange: (layout: OutputLayoutConfig) => void;
};

/** Column header preview (combine/split controls). Layout mode switch lives beside Split. */
export function OutputLayoutPanel({ layout, onChange }: OutputLayoutPanelProps) {
  return (
    <div className="mt-4">
      <EditableOutputColumns layout={layout} onChange={onChange} embedded />
    </div>
  );
}

export default OutputLayoutPanel;
