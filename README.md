# Mocho

A polyglot monorepo: one service per language/runtime, each with its own Nix
overlay, plus a single orchestrator that boots them all on distinct ports.

## Requirements

- macOS on Apple silicon or Linux (`aarch64-darwin`, `aarch64-linux`, `x86_64-linux`)
- [Nix](https://nixos.org/download/) with flakes enabled
- [direnv](https://direnv.net/) (optional, for automatic shell loading)

## Services

| Service       | Runtime                 | Port  | Dev launcher  |
| ------------- | ----------------------- | ----- | ------------- |
| `pos-app`     | workerd (Cap'n Web app) | 3000  | `pos-app`     |
| `pos-backend` | workerd (Cap'n Web RPC) | 50050 | `pos-backend` |

Each service lives in `services/<name>/` and ships its own launcher at
`services/<name>/bin/<name>`, which the Nix overlay wraps into a binary with its
port baked in (`makeWrapper --set PORT ...`). Every service also has an
`services/<name>/api.http` file that can be executed with
[httpyac](https://httpyac.github.io/).

## API tests

Run one service (needs that service running, e.g. via `mesh`):

```bash
httpyac services/pos-app/api.http --all
```

Run every service's tests at once:

```bash
mesh &          # boot all services
apitest         # runs every services/<name>/api.http via httpyac
```

`pos-backend` exposes a Cap'n Web service (`say(message)`) at `/api` over both
HTTP batch and WebSocket. Its `api.http` posts the newline-delimited Cap'n Web
wire messages for a `say` call and asserts the echoed result; `pos-app`'s fetches
the HTML shell and the bundled Cap'n Web client. Each file asserts status,
`content-type`, and body contents, so a non-zero exit proves the API isn't
behaving as expected.

## Quick start

```bash
nix develop        # enter the dev shell (all runtimes + foreman)
install            # pnpm install for every service with a package.json
mesh               # boot every service at once via foreman (Procfile)
```

Inside the shell each service can also be run on its own from source, e.g.
`pos-app`, `pos-backend`. `direnv allow` can replace `nix develop` to load the
shell automatically on `cd`.

### Run without the dev shell

```bash
nix run .#mesh              # foreman boots every nix-built service binary
nix run .#pos-app           # run a single nix-built binary
nix build .#pos-app         # build result/bin/pos-app
```

### Devshell commands

Run `menu` inside the shell to list every command.

| Command     | Purpose                                                |
| ----------- | ------------------------------------------------------ |
| `mesh`      | Boot every nix-built service binary via `foreman`      |
| `<service>` | Boot one service from source (e.g. `pos-app`)          |
| `install`   | `pnpm install` for every service with a `package.json` |
| `apitest`   | Run every `services/*/api.http` via httpyac            |
| `menu`      | Print the command menu                                 |

## Layout

| Path                         | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `flake.nix`                  | composes overlays, packages, apps, and the devshell |
| `nix/overlays/<service>.nix` | one build recipe per service                        |
| `Procfile`                   | foreman process table (`name: name`)                |
| `services/<name>/`           | service sources + its `bin/` launcher               |

## Notes

- `nix build` / `nix run` only see git-tracked files. `git add` new sources
  before building.
- Both services are Cap'n Web peers running on `workerd`. `pnpm build` bundles
  each service with `esbuild` (worker + browser client) into `build/`, and the
  `bin/<service>` launchers build on demand then `workerd serve workerd.capnp`.
- `pos-app`'s browser client connects to `pos-backend` over Cap'n Web WebSocket
  at `ws://127.0.0.1:50050/api`. The URL comes from the `BACKEND_URL` binding in
  `services/pos-app/workerd.capnp`, exposed as data at `/config.json` (the client
  fetches it), so no value is injected into HTML.
- `pos-backend` serves the `say(message)` RPC at `/api`, handling HTTP batch and
  WebSocket with a single `newWorkersRpcResponse()` call.
- `mesh` runs the `mesh` derivation, which wraps `foreman` with the Nix-built
  `pos-app` / `pos-backend` binaries on `PATH`. The `Procfile` just names those
  binaries, and their ports are baked in by `makeWrapper`, so `foreman`'s own
  `PORT` injection cannot override them. The devshell's `<service>` commands
  still run the source launchers for live editing.
