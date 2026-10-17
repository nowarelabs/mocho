// `app.js`, `ui.js` and `index.html` are workerd `text` modules (see
// workerd.capnp). `app.js` is the browser bundle produced by
// `pnpm build:client`; `ui.js` is the POS UI bundle produced by `pnpm build:ui`.
import appJs from "app.js";
import uiJs from "ui.js";
import indexHtml from "index.html";

interface Env {
  BACKEND_URL: string;
}

const NO_STORE = { "cache-control": "no-store" };

export default {
  fetch(request: Request, env: Env): Response {
    const url = new URL(request.url);

    if (url.pathname === "/app.js") {
      return new Response(appJs, {
        headers: { "content-type": "text/javascript; charset=utf-8", ...NO_STORE },
      });
    }

    if (url.pathname === "/ui.js") {
      return new Response(uiJs, {
        headers: { "content-type": "text/javascript; charset=utf-8", ...NO_STORE },
      });
    }

    if (url.pathname === "/config.json") {
      return Response.json({ backendUrl: env.BACKEND_URL }, { headers: NO_STORE });
    }

    if (url.pathname === "/") {
      return new Response(indexHtml, {
        headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
