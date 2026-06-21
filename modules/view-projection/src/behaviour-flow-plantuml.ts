import type {
  BehaviourFlowDecision,
  BehaviourFlowEventRef,
  BehaviourFlowStep,
  BehaviourFlowView,
} from "./types";

/**
 * Behaviour Flow PlantUML renderer (feature 04, criterion 5 — the demonstrable
 * artefact). A **pure** function over the Part 1 {@link BehaviourFlowView}: it takes
 * the already-projected, sequence-ordered view and emits a PlantUML diagram — it does
 * **not** re-query the graph, so it inherits the projector's adapter parity for free
 * (the cross-adapter end-to-end test renders the same view from both adapters).
 *
 * The picture mirrors the demo exporter's visual language so the two stay consistent —
 * gold-hexagon Decisions (`#FFD54F`), bold-amber decision edges (`#F57F17`), blue step
 * boxes (`#C5CAE9`), yellow event ovals (`#FFE082`), purple state transitions
 * (`#B39DDB`), `left to right direction` — but it is driven entirely by the typed view
 * rather than a raw subgraph. **Decision-point steps are visually distinct**: a gold
 * hexagon carrying the Decision's name, axis `type` and outcome branches, with the
 * `invokes` edge and any outcome-producing edges drawn bold amber, so a compliance
 * officer can spot where regulation bites without reading the whole flow.
 */
export function renderBehaviourFlowPlantUml(view: BehaviourFlowView): string {
  const { flow } = view;
  const title = flow.name.length > 0 ? flow.name : flow.id;

  const header: string[] = [
    "@startuml behaviour-flow",
    `title ${title} — Behaviour Flow`,
    "skinparam shadowing false",
    "skinparam defaultFontName Helvetica",
    "left to right direction",
    "legend right",
    `  Flow: <b>${escapeLabel(title)}</b>  (${flow.id})`,
    `  ${triggerLine(flow.trigger, flow.owningService)}`,
    "  Decision points are gold hexagons (where regulation bites); bold amber arrows are outcomes.",
    "  Blue = steps · yellow = events · purple = state transitions.",
    "endlegend",
  ];

  // Declarations — each kind in its own block, in a stable order.
  const stepDecls = view.steps.map(
    (step) => `rectangle "${stepLabel(step)}" as ${stepAlias(step.id)} <<Step>> #C5CAE9`,
  );

  const events = collectEvents(view);
  const eventDecls = [...events.entries()].map(
    ([eventId, name]) => `usecase "${escapeLabel(name)}" as ${eventAlias(eventId)} <<Event>> #FFE082`,
  );

  const transitionDecls: string[] = [];
  for (const step of view.steps) {
    step.transitions.forEach((transition, index) => {
      transitionDecls.push(
        `rectangle "${transitionLabel(transition.fromState, transition.toState, transition.guardCondition)}" as ${transitionAlias(step.id, index)} <<StateTransition>> #B39DDB`,
      );
    });
  }

  const decisionDecls = view.steps
    .filter((step): step is BehaviourFlowStep & { decision: BehaviourFlowDecision } => step.decision !== undefined)
    .map((step) => `hexagon "${decisionLabel(step.decision)}" as ${decisionAlias(step.decision.id)} <<Decision>> #FFD54F`);

  // The flow's ordered step sequence — dashed grey "then" arrows.
  const sequenceEdges: string[] = [];
  for (let i = 0; i < view.steps.length - 1; i += 1) {
    const from = view.steps[i];
    const to = view.steps[i + 1];
    if (from && to) {
      sequenceEdges.push(`${stepAlias(from.id)} -[#90A4AE,dashed]-> ${stepAlias(to.id)} : then`);
    }
  }

  // Per-step wiring — events, transitions, the decision point and saga compensation.
  const wiringEdges: string[] = [];
  for (const step of view.steps) {
    for (const event of step.consumes) {
      wiringEdges.push(`${eventAlias(event.eventId)} -[#5C6BC0]-> ${stepAlias(step.id)} : consumes`);
    }
    for (const event of step.emits) {
      wiringEdges.push(`${stepAlias(step.id)} -[#5C6BC0]-> ${eventAlias(event.eventId)} : emits`);
    }
    step.transitions.forEach((_, index) => {
      wiringEdges.push(`${stepAlias(step.id)} -[#7E57C2]-> ${transitionAlias(step.id, index)} : transitionsTo`);
    });
    if (step.decision) {
      wiringEdges.push(`${stepAlias(step.id)} -[#F57F17,bold]-> ${decisionAlias(step.decision.id)} : invokes`);
      for (const outcome of step.decision.outcomes) {
        if (outcome.producesEventId) {
          wiringEdges.push(
            `${decisionAlias(step.decision.id)} -[#F57F17,bold]-> ${eventAlias(outcome.producesEventId)} : ${outcome.label}`,
          );
        }
      }
    }
    if (step.compensates) {
      wiringEdges.push(`${stepAlias(step.id)} -[#5C6BC0,dashed]-> ${stepAlias(step.compensates)} : compensates`);
    }
  }

  const blocks = [
    header,
    stepDecls,
    eventDecls,
    transitionDecls,
    decisionDecls,
    sequenceEdges,
    wiringEdges,
  ].filter((block) => block.length > 0);

  return `${blocks.map((block) => block.join("\n")).join("\n\n")}\n@enduml`;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** PlantUML's in-label line break: a literal backslash-n, kept on one declaration line. */
const NL = "\\n";

/**
 * Unique events referenced by the view, in first-encounter order (steps in sequence;
 * `consumes` before `emits`), then any event a decision outcome produces but no step
 * touches — so every alias the edges reference is declared. Keyed by eventId so an
 * event shared by several steps is declared once.
 */
function collectEvents(view: BehaviourFlowView): Map<string, string> {
  const events = new Map<string, string>();
  const remember = (ref: BehaviourFlowEventRef): void => {
    if (!events.has(ref.eventId)) events.set(ref.eventId, ref.name);
  };
  for (const step of view.steps) {
    step.consumes.forEach(remember);
    step.emits.forEach(remember);
  }
  for (const step of view.steps) {
    if (!step.decision) continue;
    for (const outcome of step.decision.outcomes) {
      if (outcome.producesEventId && !events.has(outcome.producesEventId)) {
        // No step surfaced a name for it — fall back to the id as the label.
        events.set(outcome.producesEventId, outcome.producesEventId);
      }
    }
  }
  return events;
}

function stepLabel(step: BehaviourFlowStep): string {
  const detail = [`#${step.sequence}`, `«${step.actionType}»`];
  if (step.serviceOrComponent) detail.push(`@${step.serviceOrComponent}`);
  return escapeLabel(`${step.id}${NL}${detail.join(" ")}`);
}

function transitionLabel(fromState: string, toState: string, guardCondition?: string): string {
  const head = `${fromState} → ${toState}`;
  return escapeLabel(guardCondition ? `${head}${NL}[${guardCondition}]` : head);
}

function decisionLabel(decision: BehaviourFlowDecision): string {
  const outcomes = decision.outcomes.map((outcome) => outcome.label).join(" / ");
  const detail = outcomes.length > 0 ? `«${decision.type}»  ${outcomes}` : `«${decision.type}»`;
  return escapeLabel(`${decision.name}${NL}${detail}`);
}

/** The legend's trigger/owner line: owner is appended only when the flow declares one. */
function triggerLine(trigger: string, owningService?: string): string {
  const triggerText = trigger.length > 0 ? trigger : "—";
  return owningService ? `Trigger: ${triggerText} · Owner: ${owningService}` : `Trigger: ${triggerText}`;
}

function stepAlias(id: string): string {
  return `s_${sanitize(id)}`;
}

function eventAlias(id: string): string {
  return `e_${sanitize(id)}`;
}

function decisionAlias(id: string): string {
  return `d_${sanitize(id)}`;
}

function transitionAlias(stepId: string, index: number): string {
  return `t_${sanitize(stepId)}_${index}`;
}

function sanitize(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

/** PlantUML labels are double-quoted; keep in-label newlines as `\n` and neutralise quotes. */
function escapeLabel(text: string): string {
  return text.replace(/"/g, "'");
}
