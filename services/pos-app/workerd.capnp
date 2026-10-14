# workerd configuration for pos-app.
#
# Serves the HTML shell and the bundled Cap'n Web browser client. The client
# talks to pos-backend over Cap'n Web (WebSocket) using the BACKEND_URL binding.
#
# The socket address is only a default; the `pos-app` launcher overrides it with
# --socket-addr so PORT is honoured.

using Workerd = import "/workerd/workerd.capnp";

const posApp :Workerd.Config = (
  services = [ (name = "main", worker = .posAppWorker) ],

  sockets = [
    ( name = "http", address = "*:3000", http = (), service = "main" )
  ]
);

const posAppWorker :Workerd.Worker = (
  modules = [
    (name = "worker", esModule = embed "build/worker.js"),
    (name = "app.js", text = embed "build/app.js"),
    (name = "index.html", text = embed "src/index.html")
  ],
  compatibilityDate = "2026-01-20",
  bindings = [
    (name = "BACKEND_URL", text = "ws://127.0.0.1:50050/api")
  ]
);
