import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { axe } from "vitest-axe";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppProviders } from "../src/App";
import { mockServer } from "../src/mocks/server";
import { CoverageMapScreen } from "../src/screens/CoverageMapScreen";
import { AXE_OPTIONS } from "./helpers";

/**
 * The Vendor Coverage Map screen over MSW. The **real gateway seed carries no L2 vendor data**
 * (VendorProduct / VendorCapabilityMapping live only in the in-code coverage-gap demo), so the
 * default handler resolves capability **rows with no vendor columns** — exercised as the honest
 * "capabilities, no vendors mapped" state. The populated matrix (5 capabilities × Adyen/Stripe,
 * mirroring demo/payments-coverage-map.md) is served by an explicit handler override standing in
 * for a corpus that has vendor mappings; that handler honours the `vendor` argument, so focusing a
 * vendor proves the query re-issues (narrows) server-side rather than filtering client-side.
 */

const COVERAGE = {
  columns: [
    { id: "vp-adyen", name: "Adyen Platform", vendor: "Adyen" },
    { id: "vp-stripe", name: "Stripe Payments", vendor: "Stripe" },
  ],
  rows: [
    { id: "cap-authorisation", name: "Card Authorisation", kind: "BusinessCapability", status: "covered", gap: false, domain: "payments" },
    { id: "cap-fraud", name: "Fraud Detection", kind: "BusinessCapability", status: "partial", gap: false, domain: "payments" },
    { id: "cap-payouts", name: "Payouts", kind: "BusinessCapability", status: "covered", gap: false, domain: "payments" },
    { id: "cap-reporting", name: "Regulatory Reporting", kind: "BusinessCapability", status: "uncovered", gap: true, domain: "payments" },
    { id: "cap-settlement", name: "Settlement", kind: "BusinessCapability", status: "covered", gap: false, domain: "payments" },
  ],
  cells: [
    { rowId: "cap-authorisation", columnId: "vp-adyen", status: "covered", coveragePercentage: 100 },
    { rowId: "cap-authorisation", columnId: "vp-stripe", status: "covered", coveragePercentage: 100 },
    { rowId: "cap-fraud", columnId: "vp-adyen", status: "partial", coveragePercentage: 55, gaps: ["no behavioural scoring"] },
    { rowId: "cap-fraud", columnId: "vp-stripe", status: "uncovered" },
    { rowId: "cap-payouts", columnId: "vp-adyen", status: "uncovered" },
    { rowId: "cap-payouts", columnId: "vp-stripe", status: "covered", coveragePercentage: 90 },
    { rowId: "cap-reporting", columnId: "vp-adyen", status: "uncovered" },
    { rowId: "cap-reporting", columnId: "vp-stripe", status: "uncovered" },
    { rowId: "cap-settlement", columnId: "vp-adyen", status: "covered", coveragePercentage: 100 },
    { rowId: "cap-settlement", columnId: "vp-stripe", status: "partial", coveragePercentage: 70, gaps: ["no T+0 settlement"] },
  ],
  summary: { totalCapabilities: 5, covered: 3, partial: 1, uncovered: 1, coveragePercentage: 70 },
};

/** A variable-aware coverage handler: honours the `vendor` arg so a re-issue narrows the columns. */
function coverageHandler() {
  return http.post(/\/graphql$/, async ({ request }) => {
    const { variables } = (await request.json()) as {
      variables?: { vendor?: string | null };
    };
    const vendor = variables?.vendor ?? null;
    const columns = vendor ? COVERAGE.columns.filter((c) => c.vendor === vendor) : COVERAGE.columns;
    const columnIds = new Set(columns.map((c) => c.id));
    const cells = COVERAGE.cells.filter((cell) => columnIds.has(cell.columnId));
    return HttpResponse.json({ data: { coverageMap: { ...COVERAGE, columns, cells } } });
  });
}

describe("CoverageMapScreen data mode", () => {
  beforeAll(() => mockServer.listen({ onUnhandledRequest: "bypass" }));
  afterEach(() => mockServer.resetHandlers());
  afterAll(() => mockServer.close());

  const renderScreen = () =>
    render(
      <AppProviders>
        <CoverageMapScreen />
      </AppProviders>,
    );

  const matrix = () => screen.getByRole("table", { name: /vendor coverage matrix/i });

  it("shows a loading affordance while fetching", () => {
    renderScreen();
    expect(screen.getByText(/Loading the coverage map/i)).toBeInTheDocument();
  });

  it("renders the populated matrix — capabilities × vendors, with a summary", async () => {
    mockServer.use(coverageHandler());
    renderScreen();

    await waitFor(() => expect(matrix()).toBeInTheDocument());
    // Vendor products are the columns.
    expect(within(matrix()).getByRole("columnheader", { name: /Adyen Platform/ })).toBeInTheDocument();
    expect(within(matrix()).getByRole("columnheader", { name: /Stripe Payments/ })).toBeInTheDocument();
    // Capabilities are the rows.
    expect(within(matrix()).getByRole("rowheader", { name: "Card Authorisation" })).toBeInTheDocument();
    expect(within(matrix()).getByRole("rowheader", { name: "Regulatory Reporting" })).toBeInTheDocument();
    // A graded cell surfaces its coverage percentage.
    expect(within(matrix()).getByText("55%")).toBeInTheDocument();
    // The weighted summary is shown.
    expect(screen.getByText(/70% overall coverage/i)).toBeInTheDocument();
    expect(screen.getByText(/3 covered/i)).toBeInTheDocument();
  });

  it("re-issues the query scoped to the chosen vendor", async () => {
    mockServer.use(coverageHandler());
    renderScreen();
    // The vendor filter is populated from the first unscoped load (an effect), so await it.
    const vendorFilter = await screen.findByRole("combobox", { name: /vendor/i });
    expect(within(matrix()).getByRole("columnheader", { name: /Adyen Platform/ })).toBeInTheDocument();

    await userEvent.selectOptions(vendorFilter, "Stripe");

    // The Adyen column leaves the matrix; Stripe remains (server-side narrowing, not client filter).
    await waitFor(() =>
      expect(within(matrix()).queryByRole("columnheader", { name: /Adyen Platform/ })).not.toBeInTheDocument(),
    );
    expect(within(matrix()).getByRole("columnheader", { name: /Stripe Payments/ })).toBeInTheDocument();
  });

  it("shows capabilities with a no-vendors note over a seed that has no L2 vendor data", async () => {
    // Default handler = the real gateway over the demo seed: BusinessCapability rows, zero vendor columns.
    renderScreen();
    await waitFor(() => expect(matrix()).toBeInTheDocument());
    expect(within(matrix()).getByRole("rowheader", { name: "Payments Processing" })).toBeInTheDocument();
    expect(screen.getByText(/no vendor products mapped/i)).toBeInTheDocument();
  });

  it("shows guidance when there is no coverage data at all", async () => {
    mockServer.use(
      http.post(/\/graphql$/, () =>
        HttpResponse.json({
          data: {
            coverageMap: {
              rows: [],
              columns: [],
              cells: [],
              summary: { totalCapabilities: 0, covered: 0, partial: 0, uncovered: 0, coveragePercentage: 0 },
            },
          },
        }),
      ),
    );
    renderScreen();
    await waitFor(() => expect(screen.getByText(/No coverage data yet/i)).toBeInTheDocument());
    expect(screen.getByText(/dkm process/)).toBeInTheDocument();
  });

  it("shows a non-fatal error state when the gateway errors", async () => {
    mockServer.use(http.post(/\/graphql$/, () => HttpResponse.json({ errors: [{ message: "boom" }] })));
    renderScreen();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/load the coverage map/i);
  });

  it("passes an axe accessibility baseline", async () => {
    mockServer.use(coverageHandler());
    const { container } = renderScreen();
    await waitFor(() => expect(matrix()).toBeInTheDocument());
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});
