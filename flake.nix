{
  description = "Mocho";

  inputs.devshell.url = "github:numtide/devshell";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  inputs.flake-compat = {
    url = "github:edolstra/flake-compat";
    flake = false;
  };

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.workerd.url = "github:Sylvance/workerd.nix";

  outputs = { self, flake-utils, devshell, nixpkgs, workerd, ... }:
    flake-utils.lib.eachSystem [ "aarch64-darwin" "x86_64-linux" "aarch64-linux" ] (system:
      let
        serviceNames = [
          "next-app"
          "ts-grpc"
        ];

        overlays = [
          devshell.overlays.default
          workerd.overlays.default
        ] ++ map (name: import (./nix/overlays + "/${name}.nix") { src = self; }) serviceNames ++ [
          (import ./nix/overlays/mesh.nix { src = self; })
        ];

        pkgs = import nixpkgs {
          inherit system overlays;
        };

        lib = pkgs.lib;

        mkApp = drv: flake-utils.lib.mkApp { inherit drv; };

        servicePackages = builtins.listToAttrs (map (name: {
          name = name;
          value = pkgs.${name};
        }) serviceNames);

        serviceApps = builtins.listToAttrs (map (name: {
          name = name;
          value = mkApp pkgs.${name};
        }) serviceNames);

        meshApp = flake-utils.lib.mkApp {
          drv = pkgs.mesh;
          exePath = "/bin/mesh";
        };
      in
      {
        packages = servicePackages // {
          default = pkgs.mesh;
          mesh = pkgs.mesh;
          workerd = pkgs.workerd;
          update-deps = pkgs.writeShellScriptBin "update-deps" ''
            export PATH="${pkgs.nix}/bin:/usr/bin:/bin:/usr/sbin:/sbin"
            exec bash ${./nix/update-deps.sh} "$@"
          '';
        };

        apps = serviceApps // {
          default = meshApp;
          mesh = meshApp;
          update-deps = flake-utils.lib.mkApp {
            drv = self.packages.${system}.update-deps;
            exePath = "/bin/update-deps";
          };
        };

        devShells.default = pkgs.devshell.mkShell {
          devshell.name = "mocho.dev";

          packages = [
            pkgs.nodejs_24
            pkgs.pnpm
            pkgs.typescript
            pkgs.typescript-language-server
            pkgs.protobuf
            pkgs.foreman
            pkgs.httpyac
            pkgs.zellij
            pkgs.stdenv.cc
            pkgs.gnumake
            pkgs.pkg-config
            pkgs.workerd
          ];

          commands = [
            {
              name = "mesh";
              category = "monorepo";
              help = "Run every service via foreman (dev)";
              command = "$PRJ_ROOT/bin/orchestrator/mesh \"$@\"";
            }
            {
              name = "install";
              category = "monorepo";
              help = "Install Node dependencies for every service with a package.json";
              command = ''
                for dir in "$PRJ_ROOT"/services/*/; do
                  if [ -f "$dir/package.json" ]; then
                    echo "==> pnpm install in $dir"
                    (cd "$dir" && pnpm install)
                  fi
                done
              '';
            }
            {
              name = "update-deps";
              category = "monorepo";
              help = "Regenerate dependency pins/FOD hashes for a service (or --all)";
              command = "bash $PRJ_ROOT/nix/update-deps.sh \"$@\"";
            }
            {
              name = "apitest";
              category = "monorepo";
              help = "Run every service's api.http via httpyac (needs services running)";
              command = ''
                rc=0
                for dir in "$PRJ_ROOT"/services/*/; do
                  name="$(basename "$dir")"
                  if [ -f "$dir/api.http" ]; then
                    echo "==> $name"
                    err="$(mktemp)"
                    if ! httpyac "$dir/api.http" --all "$@" 2>"$err"; then
                      rc=1
                      cat "$err" >&2
                    fi
                    rm -f "$err"
                  fi
                done
                test "$rc" -eq 0
              '';
            }
          ] ++ map (name: {
            name = name;
            category = "services";
            help = "Run the ${name} service";
            command = "$PRJ_ROOT/services/${name}/bin/${name} \"$@\"";
          }) serviceNames;

          env = [
            {
              name = "PATH";
              eval =
                lib.concatMapStringsSep ":" (name: "$PRJ_ROOT/services/${name}/bin") serviceNames
                + ":$PRJ_ROOT/bin/orchestrator:$PRJ_ROOT/node_modules/.bin:$PATH";
            }
          ];

          devshell.startup.setup-mocho.text = ''
            chmod +x ./services/*/bin/* ./bin/orchestrator/* 2>/dev/null || true

            echo ""
            echo "------------------------------------------------------------"
            echo " Mocho Monorepo Ready"
            echo " Start all:   mesh"
            echo " Start one:   <service>   (mocho, node-app, go-app, ...)"
            echo " Install:     install"
            echo " Workspace:   devspace"
            echo "------------------------------------------------------------"
          '';
        };
      }
    );
}
