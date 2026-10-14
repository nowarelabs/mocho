// `app.js` and `index.html` are workerd `text` modules (see workerd.capnp).
// `app.js` is the browser bundle produced by `pnpm build:client`.
import appJs from "app.js";
import indexHtml from "index.html";

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

    if (url.pathname === "/config.json") {
      return Response.json({ backendUrl: env.BACKEND_URL });
    }

    if (url.pathname === "/") {
      return new Response(indexHtml, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
