import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextPanelSlot } from "../src/shell/ContextPanelSlot";

describe("ContextPanelSlot (criterion 4)", () => {
  it("renders the panel when open", () => {
    render(<ContextPanelSlot open onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(<ContextPanelSlot open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ContextPanelSlot open onClose={onClose} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ContextPanelSlot open onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close panel" }));

    expect(onClose).toHaveBeenCalled();
  });
});
