# Settlement Runbook

The **Settlement Flow** clears a batch of captured authorisations. It is owned by the
**Settlement Service** and is triggered by the `ClearingWindowClosed` integration event emitted
when a clearing window closes.

Steps, in order:

1. **Aggregate Captures** — gather the captured transactions for the window.
2. **Compute Net Position** — compute the net amount owed between the parties.
3. **Submit To Scheme** — submit the batch and publish the `SettlementSubmitted` integration
   event.
4. **Confirm Settlement** — on scheme acknowledgement, move the settlement batch from `open` to
   `settled` (the *Settlement Batch settled* transition, triggered by `SettlementConfirmed`).
5. **Reverse Submission** — the compensating step for *Submit To Scheme*: if the scheme rejects
   the batch, reverse the submission.

`ClearingWindowClosed` and `SettlementSubmitted` are both integration events. The *Settlement
Batch settled* state transition takes the **Settlement Batch** entity from the `open` state to the
`settled` state.
