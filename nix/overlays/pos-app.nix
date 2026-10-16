{ src, vp }:
final: prev:
let
  inherit (prev) lib;
  nodejs = prev.nodejs_24;

  appSrc = lib.cleanSourceWith {
    src = /. + builtins.unsafeDiscardStringContext (src + "/services/pos-app");
    filter = path: _type: !(builtins.elem (baseNameOf path) [ "node_modules" "build" ".git" ]);
  };

  vpDeps = vp.lib.fetchVpDeps {
    pname = "pos-app";
    pkgs = prev;
    src = appSrc;
    hash = "sha256-4eFUHi+dZYcVVZ/qNpJR5Ji/r9WMG0rQkxjvxZAStag=";
  };

  pos-app = vp.lib.buildVpProject {
    pname = "pos-app";
    version = "0.1.0";
    pkgs = prev;
    src = appSrc;
    inherit vpDeps;
    node = nodejs;
    # vp build/pack cannot target workerd, so the worker bundle stays esbuild.
    buildScript = "vp run build";
    nativeBuildInputs = [
      prev.esbuild
      prev.makeWrapper
      final.workerd
    ];
    env = {
      meta = {
        description = "Cap'n Web frontend running on workerd";
        mainProgram = "pos-app";
        platforms = lib.platforms.unix;
      };
    };
    installPhase = ''
      runHook preInstall

      # The Vite+ home copied in by buildVpProject is build-only.
      rm -rf .vp-home

      mkdir -p $out/libexec/pos-app $out/bin
      cp -r . $out/libexec/pos-app/
      chmod -R u+w $out/libexec/pos-app
      chmod +x $out/libexec/pos-app/bin/* 2>/dev/null || true
      makeWrapper $out/libexec/pos-app/bin/pos-app $out/bin/pos-app \
        --prefix PATH : ${lib.makeBinPath [ nodejs final.workerd ]} \
        --set PORT "3000"
      runHook postInstall
    '';
  };
in
{
  inherit pos-app;
}
