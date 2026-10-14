// Migrations are imported as text. esbuild bundles them with the
// `--loader:.sql=text` flag (see package.json); this declaration lets
// TypeScript resolve the imports.
declare module "*.sql" {
  const content: string;
  export default content;
}
