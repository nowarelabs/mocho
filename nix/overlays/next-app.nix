{ src }:
final: prev:
let
  inherit (prev) lib;
  nodejs = prev.nodejs_24;

  nextAppSrc = lib.fileset.toSource {
    root = /. + builtins.unsafeDiscardStringContext (src + "/services/next-app");
    fileset = /. + builtins.unsafeDiscardStringContext (src + "/services/next-app");
  };

  pnpmDeps = prev.fetchPnpmDeps {
    pname = "next-app";
    version = "0.1.0";
    src = nextAppSrc;
    fetcherVersion = 4;
    hash = "sha256-+Q9okjyJK1wYOl8YMUI7Px6gLUx//i/eIHJ5npQXKoo=";
  };

  next-app = prev.stdenv.mkDerivation {
    pname = "next-app";
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
      mkdir -p $out/libexec/next-app $out/bin
      cp -r . $out/libexec/next-app/
      chmod -R u+w $out/libexec/next-app
      chmod +x $out/libexec/next-app/bin/* 2>/dev/null || true
      makeWrapper $out/libexec/next-app/bin/next-app $out/bin/next-app \
        --prefix PATH : ${lib.makeBinPath [ nodejs ]} \
        --set PORT "3000"
      runHook postInstall
    '';

    meta = {
      description = "Next.js service";
      mainProgram = "next-app";
      platforms = lib.platforms.unix;
    };
  };
in
{
  inherit next-app;
}
