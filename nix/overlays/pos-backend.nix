{ src }:
final: prev:
let
  inherit (prev) lib;
  nodejs = prev.nodejs_24;

  tsGrpcSrc = lib.fileset.toSource {
    root = /. + builtins.unsafeDiscardStringContext (src + "/services/pos-backend");
    fileset = /. + builtins.unsafeDiscardStringContext (src + "/services/pos-backend");
  };

  pnpmDeps = prev.fetchPnpmDeps {
    pname = "pos-backend";
    version = "0.1.0";
    src = tsGrpcSrc;
    fetcherVersion = 4;
    hash = "sha256-s/NVTd3LUQVERd/53EUJCHNjzKwgMiiKBIqvwM8RsOA=";
  };

  pos-backend = prev.stdenv.mkDerivation {
    pname = "pos-backend";
    version = "0.1.0";

    src = tsGrpcSrc;

    nativeBuildInputs = [ nodejs prev.pnpm prev.pnpmConfigHook prev.makeWrapper ];

    inherit pnpmDeps;

    dontBuild = true;

    installPhase = ''
      runHook preInstall
      mkdir -p $out/libexec/pos-backend $out/bin
      cp -r . $out/libexec/pos-backend/
      chmod -R u+w $out/libexec/pos-backend
      chmod +x $out/libexec/pos-backend/bin/* 2>/dev/null || true
      makeWrapper $out/libexec/pos-backend/bin/pos-backend $out/bin/pos-backend \
        --prefix PATH : ${lib.makeBinPath [ nodejs ]} \
        --set PORT "50050"
      runHook postInstall
    '';

    meta = {
      description = "TypeScript gRPC service";
      mainProgram = "pos-backend";
      platforms = lib.platforms.unix;
    };
  };
in
{
  inherit pos-backend;
}
