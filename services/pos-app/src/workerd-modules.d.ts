// `app.js` is not a real module: workerd injects it as a `text` module
// (see workerd.capnp), and esbuild leaves the import external. Declare it so
// TypeScript resolves the import; the runtime value is the bundled client JS.
declare module "app.js" {
  const content: string;
  export default content;
}
