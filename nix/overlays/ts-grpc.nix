{ src }:
final: prev:
let
  inherit (prev) lib;
  nodejs = prev.nodejs_24;

  tsGrpcSrc = lib.fileset.toSource {
    root = /. + builtins.unsafeDiscardStringContext (src + "/services/ts-grpc");
    fileset = /. + builtins.unsafeDiscardStringContext (src + "/services/ts-grpc");
  };

  pnpmDeps = prev.fetchPnpmDeps {
    pname = "ts-grpc";
    version = "0.1.0";
    src = tsGrpcSrc;
    fetcherVersion = 4;
    hash = "sha256-s/NVTd3LUQVERd/53EUJCHNjzKwgMiiKBIqvwM8RsOA=";
  };

  ts-grpc = prev.stdenv.mkDerivation {
    pname = "ts-grpc";
    version = "0.1.0";

    src = tsGrpcSrc;

    nativeBuildInputs = [ nodejs prev.pnpm prev.pnpmConfigHook prev.makeWrapper ];

    inherit pnpmDeps;

    dontBuild = true;

    installPhase = ''
      runHook preInstall
      mkdir -p $out/libexec/ts-grpc $out/bin
      cp -r . $out/libexec/ts-grpc/
      chmod -R u+w $out/libexec/ts-grpc
      chmod +x $out/libexec/ts-grpc/bin/* 2>/dev/null || true
      makeWrapper $out/libexec/ts-grpc/bin/ts-grpc $out/bin/ts-grpc \
        --prefix PATH : ${lib.makeBinPath [ nodejs ]} \
        --set PORT "50050"
      runHook postInstall
    '';

    meta = {
      description = "TypeScript gRPC service";
      mainProgram = "ts-grpc";
      platforms = lib.platforms.unix;
    };
  };
in
{
  inherit ts-grpc;
}
