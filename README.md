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
`services/<name>/bin/<name>`. Checked-in payloads go under `vendor/<name>/`.
Every service also has an `services/<name>/api.http` file (HTTP or gRPC) that
can be executed with [httpyac](https://httpyac.github.io/).

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
nix develop        # enter the dev shell (all runtimes + foreman + zellij)
install            # pnpm install for every service with a package.json
mesh               # boot every service at once via foreman (Procfile)
```

Inside the shell each service can also be run on its own, e.g. `mocho`,
`node-app`, `go-app`. `direnv allow` can replace `nix develop` to load the shell
automatically on `cd`.

### Run without the dev shell

```bash
nix run .#mesh              # foreman boots every service
nix run .#mocho             # run a single service
nix build .#mocho           # build result/bin/mocho
```

Bare services (`mocho`, `node-app`, `go-app`, `rust-grpc`) build with no network
access. The JavaScript bundlers and Ruby/Elixir services need their lockfile
hashes filled in before `nix build` will fetch dependencies.

### Devshell commands

Run `menu` inside the shell to list every command.

| Command     | Purpose                                                |
| ----------- | ------------------------------------------------------ |
| `mesh`      | Boot every service with `foreman` (`Procfile`)         |
| `<service>` | Boot one service (e.g. `mocho`, `go-app`)              |
| `install`   | `pnpm install` for every service with a `package.json` |
| `devspace`  | Open the Zellij dev workspace (`layout.kdl`)           |
| `apitest`   | Run every `services/*/api.http` via httpyac            |
| `menu`      | Print the command menu                                 |

## Layout

| Path                         | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `flake.nix`                  | composes overlays, packages, apps, and the devshell |
| `nix/overlays/<service>.nix` | one build recipe per service                        |
| `Procfile`                   | foreman process table (`name: name`)                |
| `bin/orchestrator/`          | monorepo-only launcher (`mesh`)                     |
| `services/<name>/`           | service sources + its `bin/` launcher               |
| `vendor/<name>/`             | checked-in per-service payloads                     |
| `layout.kdl`                 | Zellij workspace layout used by `devspace`          |

## Notes

- `nix build` / `nix run` only see git-tracked files. `git add` new sources
  before building.
- Both services are Cap'n Web peers running on `workerd`. `pnpm build` bundles
  each service with `esbuild` (worker + browser client) into `build/`, and the
  `bin/<service>` launchers build on demand then `workerd serve workerd.capnp`.
- `pos-app`'s browser client connects to `pos-backend` over Cap'n Web WebSocket
  at `ws://127.0.0.1:50050/api`, set by the `BACKEND_URL` binding in
  `services/pos-app/workerd.capnp`.
- `pos-backend` serves the `say(message)` RPC at `/api`, handling HTTP batch and
  WebSocket with a single `newWorkersRpcResponse()` call.
