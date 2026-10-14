{ src }:
final: prev:
let
  inherit (prev) lib;
  nodejs = prev.nodejs_24;

  nextAppSrc = lib.fileset.toSource {
    root = /. + builtins.unsafeDiscardStringContext (src + "/services/pos-app");
    fileset = /. + builtins.unsafeDiscardStringContext (src + "/services/pos-app");
  };

  pnpmDeps = prev.fetchPnpmDeps {
    pname = "pos-app";
    version = "0.1.0";
    src = nextAppSrc;
    fetcherVersion = 4;
    hash = "sha256-J4U06zepu0Ik/UOY1H9ZA2idi9EZy8qegxmpURtpbmY=";
  };

  pos-app = prev.stdenv.mkDerivation {
    pname = "pos-app";
    version = "0.1.0";

    src = nextAppSrc;

    nativeBuildInputs = [ nodejs prev.pnpm prev.pnpmConfigHook prev.makeWrapper ];

    inherit pnpmDeps;

    NEXT_TELEMETRY_DISABLED = "1";

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
        --prefix PATH : ${lib.makeBinPath [ nodejs ]} \
        --set PORT "3000"
      runHook postInstall
    '';

    meta = {
      description = "Next.js service";
      mainProgram = "pos-app";
      platforms = lib.platforms.unix;
    };
  };
in
{
  inherit pos-app;
}
