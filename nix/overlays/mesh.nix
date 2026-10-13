{ src }:
final: prev:
let
  inherit (prev) lib;

  mesh = prev.stdenvNoCC.mkDerivation {
    pname = "mesh";
    version = "0.1.0";

    dontUnpack = true;

    nativeBuildInputs = [ prev.makeWrapper ];

    dontConfigure = true;
    dontBuild = true;

    installPhase = ''
      runHook preInstall
      mkdir -p $out/bin $out/share
      cp ${src + "/Procfile"} $out/share/Procfile
      makeWrapper ${prev.foreman}/bin/foreman $out/bin/mesh \
        --add-flags "start -f $out/share/Procfile" \
        --prefix PATH : ${
          lib.makeBinPath [
            final.dream
            final.node-app
            final.next-app
            final.react-app
            final.ruby-app
            final.rails-app
            final.go-app
            final.elixir-app
            final.rust-app
            final.rust-actix
            final.rust-grpc
            final.go-gin
            final.go-grpc
            final.ts-app
            final.ts-express
            final.ts-grpc
            final.ruby-grpc
            final.c-app
            final.c-microhttpd
            final.c-grpc
            final.cpp-app
            final.cpp-crow
            final.cpp-grpc
            final.java-app
            final.java-spring
            final.java-grpc
            final.csharp-app
            final.csharp-aspnet
            final.csharp-grpc
            final.scala-app
            final.scala-http4s
            final.scala-grpc
            final.php-app
            final.php-slim
            final.php-grpc
            final.zig-app
            final.kotlin-app
            final.kotlin-ktor
            final.kotlin-grpc
            final.python-app
            final.python-flask
            final.python-grpc
            final.r-app
            final.r-plumber
            final.clojure-app
            final.clojure-compojure
            final.clojure-grpc
            final.lisp-app
            final.lisp-hunchentoot
            final.lua-app
            final.lua-lapis
            final.haskell-app
            final.haskell-scotty
          ]
        }
      runHook postInstall
    '';

    meta = {
      description = "Polyglot monorepo mesh";
      mainProgram = "mesh";
      platforms = lib.platforms.unix;
    };
  };
in
{
  inherit mesh;
}
