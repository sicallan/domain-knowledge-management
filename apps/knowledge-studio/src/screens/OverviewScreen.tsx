import { ConceptDiagram } from "../overview/ConceptDiagram";
import { conceptModel, relationshipModel } from "../overview/model";

/**
 * The Overview screen (enhancement): an orientation page for the platform's **conceptual model**.
 * It pairs a layered diagram of the four-layer domain model with a reference table of the inventory
 * concepts and one of the key relationship types — all sourced from `overview/model` so the page
 * stays in step with the graph's type encoding. Pure/static (no gateway calls).
 */
export function OverviewScreen() {
  const concepts = conceptModel();
  const relationships = relationshipModel();

  return (
    <section aria-labelledby="overview-heading" className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <h1 id="overview-heading" className="text-xl font-semibold">
          Overview
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          This platform structures source material into a living knowledge graph of typed inventory
          entries across four layers — strategic, pure domain, functional and technical. The
          conceptual model below shows those entry types and how they relate; explore the populated
          graph in the Knowledge Explorer.
        </p>
      </div>

      <ConceptDiagram />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Concepts</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Inventory concepts by layer</caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-2 pr-4 font-semibold">Concept</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Layer</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
                <th scope="col" className="py-2 font-semibold">What it is</th>
              </tr>
            </thead>
            <tbody>
              {concepts.map((concept) => (
                <tr key={concept.type} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-4 font-medium">{concept.type}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{concept.layer}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">{concept.status}</td>
                  <td className="py-2 text-muted-foreground">{concept.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Relationships</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Key relationship types</caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-2 pr-4 font-semibold">Relationship</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Category</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Connects</th>
                <th scope="col" className="py-2 font-semibold">What it means</th>
              </tr>
            </thead>
            <tbody>
              {relationships.map((rel) => (
                <tr key={rel.type} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-4 font-medium">{rel.type}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">{rel.category}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{rel.connects}</td>
                  <td className="py-2 text-muted-foreground">{rel.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
