{ src, vp }:
final: prev:
let
  inherit (prev) lib;
  nodejs = prev.nodejs_24;

  backendSrc = lib.cleanSourceWith {
    src = /. + builtins.unsafeDiscardStringContext (src + "/services/pos-backend");
    filter = path: _type: !(builtins.elem (baseNameOf path) [ "node_modules" "build" ".git" ]);
  };

  vpDeps = vp.lib.fetchVpDeps {
    pname = "pos-backend";
    pkgs = prev;
    src = backendSrc;
    hash = "sha256-JA7SMFGXuFzss+hdKWErk0bqkXBduT0Nwa32+DEj+jM=";
  };

  pos-backend = vp.lib.buildVpProject {
    pname = "pos-backend";
    version = "0.1.0";
    pkgs = prev;
    src = backendSrc;
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
        description = "Cap'n Web service running on workerd";
        mainProgram = "pos-backend";
        platforms = lib.platforms.unix;
      };
    };
    installPhase = ''
      runHook preInstall

      # The Vite+ home copied in by buildVpProject is build-only.
      rm -rf .vp-home

      mkdir -p $out/libexec/pos-backend $out/bin
      cp -r . $out/libexec/pos-backend/
      chmod -R u+w $out/libexec/pos-backend
      chmod +x $out/libexec/pos-backend/bin/* 2>/dev/null || true
      makeWrapper $out/libexec/pos-backend/bin/pos-backend $out/bin/pos-backend \
        --prefix PATH : ${lib.makeBinPath [ nodejs final.workerd ]} \
        --set PORT "50050"
      runHook postInstall
    '';
  };
in
{
  inherit pos-backend;
}
