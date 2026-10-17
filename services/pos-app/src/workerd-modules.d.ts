// These are not real modules: workerd injects them as `text` modules (see
// workerd.capnp) and esbuild leaves the imports external. Declare them so
// TypeScript resolves the imports; the runtime values are the bundled client JS,
// the bundled POS UI and the HTML shell.
declare module "app.js" {
  const content: string;
  export default content;
}

declare module "ui.js" {
  const content: string;
  export default content;
}

declare module "index.html" {
  const content: string;
  export default content;
}
