import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export interface ContextPanelSlotProps {
  /** Whether the slide-out is open (driven by `selectEntry`/`closePanel` in the store). */
  open: boolean;
  /** Called when the panel is dismissed (Esc, click-away, or the close button). */
  onClose: () => void;
  /** The detail content — injected by UI-3.6; a placeholder until then. */
  children?: ReactNode;
}

/**
 * The slide-out context-panel **slot** (UI-3.1). Radix `Dialog` gives focus trapping,
 * `Esc`-to-close, click-away dismissal and the correct ARIA for free (NFR a11y). It opens
 * when an entry is selected from anywhere (canvas, list, search) and closes via any of the
 * standard affordances; UI-3.6 injects the actual entry detail as `children`.
 */
export function ContextPanelSlot({ open, onClose, children }: ContextPanelSlotProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed inset-y-0 right-0 w-[28rem] max-w-full border-l border-border bg-background p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">Details</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close panel" className="rounded-md px-2 py-1 hover:bg-muted">
                ✕
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Detail and relationships for the selected inventory entry.
          </Dialog.Description>
          <div className="mt-4">
            {children ?? (
              <p className="text-sm text-muted-foreground">
                Select an entry to inspect its detail, relationships and evidence (UI-3.6).
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
