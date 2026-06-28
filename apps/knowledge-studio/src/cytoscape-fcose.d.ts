// `cytoscape-fcose` ships no type declarations. It's a Cytoscape layout-extension registration
// function passed to `cytoscape.use(...)`. A minimal shim keeps the import typed.
declare module "cytoscape-fcose" {
  const fcose: (cytoscape: unknown) => void;
  export default fcose;
}
