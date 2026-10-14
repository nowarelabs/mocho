{ src }:
final: prev:
let
  inherit (prev) lib;
  nodejs = prev.nodejs_24;

  backendSrc = lib.fileset.toSource {
    root = /. + builtins.unsafeDiscardStringContext (src + "/services/pos-backend");
    fileset = /. + builtins.unsafeDiscardStringContext (src + "/services/pos-backend");
  };

  pnpmDeps = prev.fetchPnpmDeps {
    pname = "pos-backend";
    version = "0.1.0";
    src = backendSrc;
    fetcherVersion = 4;
    hash = "sha256-JA7SMFGXuFzss+hdKWErk0bqkXBduT0Nwa32+DEj+jM=";
  };

  pos-backend = prev.stdenv.mkDerivation {
    pname = "pos-backend";
    version = "0.1.0";

    src = backendSrc;

    nativeBuildInputs = [
      nodejs
      prev.pnpm
      prev.pnpmConfigHook
      prev.makeWrapper
      final.esbuild
    ];

    inherit pnpmDeps;

    buildPhase = ''
      runHook preBuild
      pnpm build
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out/libexec/pos-backend $out/bin
      cp -r . $out/libexec/pos-backend/
      chmod -R u+w $out/libexec/pos-backend
      chmod +x $out/libexec/pos-backend/bin/* 2>/dev/null || true
      makeWrapper $out/libexec/pos-backend/bin/pos-backend $out/bin/pos-backend \
        --prefix PATH : ${lib.makeBinPath [ nodejs final.workerd ]} \
        --set PORT "50050"
      runHook postInstall
    '';

    meta = {
      description = "Cap'n Web service running on workerd";
      mainProgram = "pos-backend";
      platforms = lib.platforms.unix;
    };
  };
in
{
  inherit pos-backend;
}
