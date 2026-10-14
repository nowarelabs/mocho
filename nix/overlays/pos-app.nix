{ src }:
final: prev:
let
  inherit (prev) lib;
  nodejs = prev.nodejs_24;

  appSrc = lib.fileset.toSource {
    root = /. + builtins.unsafeDiscardStringContext (src + "/services/pos-app");
    fileset = /. + builtins.unsafeDiscardStringContext (src + "/services/pos-app");
  };

  pnpmDeps = prev.fetchPnpmDeps {
    pname = "pos-app";
    version = "0.1.0";
    src = appSrc;
    fetcherVersion = 4;
    hash = "sha256-4eFUHi+dZYcVVZ/qNpJR5Ji/r9WMG0rQkxjvxZAStag=";
  };

  pos-app = prev.stdenv.mkDerivation {
    pname = "pos-app";
    version = "0.1.0";

    src = appSrc;

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
      mkdir -p $out/libexec/pos-app $out/bin
      cp -r . $out/libexec/pos-app/
      chmod -R u+w $out/libexec/pos-app
      chmod +x $out/libexec/pos-app/bin/* 2>/dev/null || true
      makeWrapper $out/libexec/pos-app/bin/pos-app $out/bin/pos-app \
        --prefix PATH : ${lib.makeBinPath [ nodejs final.workerd ]} \
        --set PORT "3000"
      runHook postInstall
    '';

    meta = {
      description = "Cap'n Web frontend running on workerd";
      mainProgram = "pos-app";
      platforms = lib.platforms.unix;
    };
  };
in
{
  inherit pos-app;
}
