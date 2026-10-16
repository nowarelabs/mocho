# workerd configuration for pos-backend.
#
# Exposes the Cap'n Web echo service (src/worker.ts, bundled to build/worker.js
# by `vp run build`) over HTTP batch and WebSocket at /api.
#
# The socket address is only a default; the `pos-backend` launcher overrides it
# with --socket-addr so PORT is honoured.

using Workerd = import "/workerd/workerd.capnp";

const posBackend :Workerd.Config = (
  services = [ (name = "main", worker = .posBackendWorker) ],

  sockets = [
    ( name = "http", address = "*:50050", http = (), service = "main" )
  ]
);

const posBackendWorker :Workerd.Worker = (
  modules = [
    (name = "worker", esModule = embed "build/worker.js")
  ],
  compatibilityDate = "2026-01-20"
);
