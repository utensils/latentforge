{
  description = "LatentForge — interactive image dataset collection and curation tool for LoRA training";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      treefmt-nix,
    }:
    let
      # Read project metadata from package.json
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      pname = packageJson.name;
      version = packageJson.version;

      forAllSystems = nixpkgs.lib.genAttrs [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      mkPkgsFor =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfree = builtins.elem system [
            "x86_64-linux"
            "aarch64-linux"
          ];
        };
    in
    {
      # ── Packages ────────────────────────────────────────────────────────
      packages = forAllSystems (system: {
        default =
          let
            pkgs = mkPkgsFor system;
          in
          pkgs.buildNpmPackage {
            inherit pname version;
            src = self;
            npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

            nativeBuildInputs = [
              pkgs.makeWrapper
              pkgs.pkg-config
            ];

            buildInputs = [
              pkgs.vips
            ];

            npmBuildScript = "build";

            postInstall = ''
              wrapProgram $out/bin/latentforge \
                --prefix PATH : ${nixpkgs.lib.makeBinPath [ pkgs.gallery-dl ]}
            '';
          };
      });

      # ── Apps ─────────────────────────────────────────────────────────────
      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/${pname}";
        };
      });

      # ── DevShell ─────────────────────────────────────────────────────────
      devShells = forAllSystems (
        system:
        let
          pkgs = mkPkgsFor system;
          isDarwin = builtins.elem system [
            "x86_64-darwin"
            "aarch64-darwin"
          ];
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_22
              pkgs.gallery-dl
              pkgs.vips
              pkgs.pkg-config
              pkgs.prettier
            ];

            shellHook = ''
              # ── Helper functions ──
              count() {
                echo ""
                dsroot="datasets"
                if [ ! -d "$dsroot" ]; then
                  echo "  No datasets/ directory found."
                  return 0
                fi
                for ds in "$dsroot"/*/; do
                  dsname=$(basename "$ds")
                  echo "  ── $dsname ──"
                  dstotal=0
                  for catdir in "$ds"*/; do
                    [ -d "$catdir" ] || continue
                    cat=$(basename "$catdir")
                    n=$(find "$catdir" -maxdepth 1 -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) | wc -l | tr -d ' ')
                    [ "$n" -gt 0 ] && printf "    %-18s %s images\n" "$cat" "$n"
                    dstotal=$((dstotal + n))
                  done
                  printf "    %-18s %s images\n" "TOTAL" "$dstotal"
                  echo ""
                done
              }

              quality-check() {
                dsroot="datasets"
                echo ""
                echo "  Size distribution:"
                echo "     > 500KB (excellent): $(find "$dsroot" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) -size +500k | wc -l | tr -d ' ')"
                echo "     100-500KB (good):     $(find "$dsroot" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) -size +100k -not -size +500k | wc -l | tr -d ' ')"
                echo "     50-100KB (ok):        $(find "$dsroot" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) -size +50k -not -size +100k | wc -l | tr -d ' ')"
                echo "     10-50KB (small):      $(find "$dsroot" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) -size +10k -not -size +50k | wc -l | tr -d ' ')"
                bad=$(find "$dsroot" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) -size -10k)
                n=$(echo "$bad" | grep -c . 2>/dev/null || echo 0)
                echo "     < 10KB (suspect):     $n"
                if [ -n "$bad" ] && [ "$n" -gt 0 ]; then
                  echo ""
                  echo "  Suspect files:"
                  echo "$bad" | while read -r f; do
                    printf "     %6s   %s\n" "$(wc -c < "$f" | tr -d ' ')B" "$(basename "$f")"
                  done
                fi
                echo ""
              }
            '';
          };
        }
      );

      # ── Formatter (nix fmt) ──────────────────────────────────────────────
      formatter = forAllSystems (
        system:
        let
          pkgs = mkPkgsFor system;
          treefmtEval = treefmt-nix.lib.evalModule pkgs {
            projectRootFile = "flake.nix";
          };
        in
        treefmtEval.config.build.wrapper
      );

      # ── Checks ───────────────────────────────────────────────────────────
      checks = forAllSystems (
        system:
        let
          pkgs = mkPkgsFor system;
          treefmtEval = treefmt-nix.lib.evalModule pkgs {
            projectRootFile = "flake.nix";
          };
        in
        {
          formatting = treefmtEval.config.build.check self;
        }
      );
    };
}
