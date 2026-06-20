# Settlement Decisions (rulebook)

## Select Settlement Route

At the close of each clearing window a **ClearingWindowClosed** event triggers the **Select
Settlement Route** decision (automated; owner: Settlement Ops), which selects a `net` or `gross`
route.

It evaluates the rule *"Net settlement applies when scheme rules permit"* and consumes the **Scheme
Fee Table** to compute the position. It produces the **SettlementRouteSelected** event, and is
realised by the Settlement Service.
