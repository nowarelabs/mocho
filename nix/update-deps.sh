#!/usr/bin/env bash
#
# update-deps <service|--all>
#
# Regenerate a service's dependency pins:
#   - lockfile/manifest-driven languages (ruby/gradle/dotnet): regenerate the
#     committed lockfile (no hash lives in the overlay, nothing to paste)
#   - fixed-output-derivation languages (pnpm/composer/clojure/maven/sbt/go):
#     regenerate the FOD and rewrite the pin hash in the overlay automatically
#
# Run from the repository root. Requires `nix` on PATH.
set -euo pipefail

ROOT="$PWD"
cd "$ROOT"
[ -f flake.nix ] || { echo "error: run update-deps from the repository root"; exit 1; }

FAKE='"sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="'

kind() {
  case "$1" in
    ruby-app|rails-app|ruby-grpc) echo ruby;;
    next-app|react-app|ts-express|ts-grpc) echo pnpm;;
    php-slim|php-grpc) echo composer;;
    clojure-app|clojure-compojure|clojure-grpc) echo clojure;;
    java-spring|java-grpc|scala-grpc) echo maven;;
    scala-http4s) echo sbt;;
    kotlin-ktor|kotlin-grpc) echo gradle;;
    csharp-app|csharp-aspnet|csharp-grpc) echo dotnet;;
    go-gin|go-grpc) echo go;;
    *) echo none;;
  esac
}

# Rebuild the FOD with a fake hash, capture the real one from the mismatch
# error, and rewrite it in the overlay in place.
recompute_hash() {
  local ovl="$1" svc="$2" old new out
  old=$(grep -oE '"sha256-[A-Za-z0-9+/=]+"' "$ovl" | head -1)
  [ -n "$old" ] || { echo "   [skip] no pin hash in $ovl"; return 0; }
  cp "$ovl" "$ovl.orig"
  sed -i '' "s#$old#$FAKE#g" "$ovl"
  out=$(nix build ".#$svc" --no-link 2>&1 || true)
  new=$(printf '%s\n' "$out" | grep -oE 'got:[[:space:]]*sha256-[A-Za-z0-9+/=]+' | sed -E 's/.* (sha256-[A-Za-z0-9+/=]+)/\1/' | tail -1)
  [ -n "$new" ] || new=$(printf '%s\n' "$out" | grep -oE 'sha256-[A-Za-z0-9+/=]{43,44}' | tail -1)
  if [ -z "$new" ]; then
    mv "$ovl.orig" "$ovl"
    echo "   [FAIL] could not capture new hash for $svc; last build lines:"
    printf '%s\n' "$out" | tail -15
    return 1
  fi
  sed -i '' "s#$FAKE#\"$new\"#g" "$ovl"
  rm -f "$ovl.orig"
  echo "   hash: $old -> \"$new\""
}

# Regenerate the committed lockfile (for languages that have one).
regen() {
  local svc="$1" k="$2"
  case "$k" in
    pnpm)
      nix shell nixpkgs#nodejs_24 nixpkgs#pnpm -c bash -c \
        "cd '$ROOT/services/$svc' && pnpm install --lockfile-only"
      ;;
    composer)
      local flags="composer update --no-interaction --no-progress --no-install"
      [ "$svc" = "php-grpc" ] && flags="$flags --ignore-platform-req=ext-grpc"
      nix shell nixpkgs#php83 nixpkgs#php83.packages.composer -c bash -c \
        "cd '$ROOT/services/$svc' && $flags"
      ;;
    go)
      nix shell nixpkgs#go -c bash -c \
        "cd '$ROOT/services/$svc' && go mod tidy && go mod download"
      ;;
    ruby)
      nix shell nixpkgs#ruby_3_3 nixpkgs#bundix -c bash -c \
        "cd '$ROOT/services/$svc' && bundle update && bundix -l"
      ;;
    gradle)
      nix build ".#$svc.mitmCache.updateScript" -o "/tmp/update-$svc" >/dev/null 2>&1
      "/tmp/update-$svc"
      ;;
    dotnet)
      nix build ".#$svc.fetch-deps" -o "/tmp/fetch-deps-$svc" >/dev/null 2>&1
      "/tmp/fetch-deps-$svc" "$ROOT/nix/overlays/$svc-deps.json"
      ;;
    clojure|maven|sbt)
      # manifests (deps.edn/pom.xml/build.sbt) are committed directly; the FOD
      # rebuild below re-resolves against them.
      ;;
  esac
}

update_one() {
  local svc="$1" k
  k=$(kind "$svc")
  if [ "$k" = none ]; then
    echo "== $svc: no dependency updater (deps derive from committed manifests or none)"
    return 0
  fi
  echo "== $svc ($k) =="
  regen "$svc" "$k"
  case "$k" in
    ruby|gradle|dotnet)
      echo "   lockfile-driven; no overlay hash to patch"
      ;;
    *)
      recompute_hash "nix/overlays/$svc.nix" "$svc"
      ;;
  esac
  echo "   rebuilding .#$svc to verify"
  nix build ".#$svc" --no-link >/dev/null 2>&1 || { echo "   [FAIL] .#$svc no longer builds"; return 1; }
  echo "   OK"
}

if [ "$1" = "--all" ]; then
  for svc in \
    ruby-app rails-app ruby-grpc \
    next-app react-app ts-express ts-grpc \
    php-slim php-grpc \
    clojure-app clojure-compojure clojure-grpc \
    java-spring java-grpc scala-grpc scala-http4s \
    kotlin-ktor kotlin-grpc \
    csharp-app csharp-aspnet csharp-grpc \
    go-gin go-grpc
  do
    update_one "$svc"
  done
else
  update_one "$1"
fi
echo
echo "done. Review changed files with: git status"