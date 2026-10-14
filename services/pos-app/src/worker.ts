// `app.js` is a workerd `text` module: the browser bundle produced by
// `pnpm build:client` from client/app.js.
import appJs from "app.js";

interface Env {
  BACKEND_URL: string;
}

export default {
  fetch(request: Request, env: Env): Response {
    const url = new URL(request.url);

    if (url.pathname === "/app.js") {
      return new Response(appJs, {
        headers: { "content-type": "text/javascript; charset=utf-8" },
      });
    }

    if (url.pathname === "/") {
      return new Response(page(env.BACKEND_URL), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

function page(backendUrl: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>pos-app</title>
  </head>
  <body>
    <main>
      <h1>pos-app</h1>
      <p>Cap'n Web client to <code>pos-backend</code>.</p>
      <form id="echo">
        <input name="message" value="hello-pos-backend" />
        <button type="submit">Send</button>
      </form>
      <pre id="output"></pre>
    </main>
    <script>window.__BACKEND_URL__ = ${JSON.stringify(backendUrl)};</script>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;
}
