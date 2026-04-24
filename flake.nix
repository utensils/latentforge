{
  description = "LatentForge — interactive image dataset collection and curation tool for LoRA training";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    pyproject-nix = {
      url = "github:pyproject-nix/pyproject.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    uv2nix = {
      url = "github:pyproject-nix/uv2nix";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    pyproject-build-systems = {
      url = "github:pyproject-nix/build-system-pkgs";
      inputs.pyproject-nix.follows = "pyproject-nix";
      inputs.uv2nix.follows = "uv2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      pyproject-nix,
      uv2nix,
      pyproject-build-systems,
      treefmt-nix,
    }:
    let
      # Read project metadata from pyproject.toml
      pyproject = builtins.fromTOML (builtins.readFile ./pyproject.toml);
      pname = pyproject.project.name;
      version = pyproject.project.version;

      forAllSystems = nixpkgs.lib.genAttrs [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      # Load uv workspace from the flake source (avoids redundant store copy)
      workspace = uv2nix.lib.workspace.loadWorkspace { workspaceRoot = self; };

      # Create package overlay from workspace
      overlay = workspace.mkPyprojectOverlay {
        sourcePreference = "wheel";
      };

      mkPkgsFor =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfree = builtins.elem system [
            "x86_64-linux"
            "aarch64-linux"
          ];
        };

      # Build a python set + virtual env for a given system
      mkVenvFor =
        system:
        let
          pkgs = mkPkgsFor system;
          python = pkgs.python312;

          # Create base Python set from pyproject-nix
          pythonSet = (pkgs.callPackage pyproject-nix.build.packages { inherit python; }).overrideScope (
            nixpkgs.lib.composeManyExtensions [
              pyproject-build-systems.overlays.default
              overlay
            ]
          );
        in
        pythonSet.mkVirtualEnv "${pname}-env" workspace.deps.default;
    in
    {
      # ── Packages ────────────────────────────────────────────────────────
      packages = forAllSystems (system: {
        default = mkVenvFor system;
      });

      # ── Apps ─────────────────────────────────────────────────────────────
      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${mkVenvFor system}/bin/${pname}";
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
          isLinux = builtins.elem system [
            "x86_64-linux"
            "aarch64-linux"
          ];
          venv = mkVenvFor system;

          linuxGpuPkgs = nixpkgs.lib.optionals isLinux [
            pkgs.cudaPackages.cudatoolkit
            pkgs.cudaPackages.cudnn
          ];
        in
        {
          default = pkgs.mkShell {
            packages = [
              venv
              pkgs.uv
              pkgs.gallery-dl
              pkgs.ruff
              pkgs.pyright
              pkgs.nodejs_22
              pkgs.pnpm
            ]
            ++ linuxGpuPkgs;

            env = {
              PYTHONDONTWRITEBYTECODE = "1";
              UV_NO_SYNC = "1";
            }
            // nixpkgs.lib.optionalAttrs isLinux {
              LD_LIBRARY_PATH = nixpkgs.lib.makeLibraryPath [
                pkgs.cudaPackages.cudatoolkit
                pkgs.cudaPackages.cudnn
              ];
              CUDA_PATH = "${pkgs.cudaPackages.cudatoolkit}";
            }
            // nixpkgs.lib.optionalAttrs isDarwin {
              PYTORCH_ENABLE_MPS_FALLBACK = "1";
            };

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
                echo "    > 500KB (excellent): $(find "$dsroot" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) -size +500k | wc -l | tr -d ' ')"
                echo "    100-500KB (good):    $(find "$dsroot" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) -size +100k -not -size +500k | wc -l | tr -d ' ')"
                echo "    50-100KB (ok):       $(find "$dsroot" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) -size +50k -not -size +100k | wc -l | tr -d ' ')"
                echo "    10-50KB (small):     $(find "$dsroot" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) -size +10k -not -size +50k | wc -l | tr -d ' ')"
                bad=$(find "$dsroot" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) -size -10k)
                n=$(echo "$bad" | grep -c . 2>/dev/null || echo 0)
                echo "    < 10KB (suspect):    $n"
                if [ -n "$bad" ] && [ "$n" -gt 0 ]; then
                  echo ""
                  echo "  Suspect files:"
                  echo "$bad" | while read -r f; do
                    printf "    %6s  %s\n" "$(wc -c < "$f" | tr -d ' ')B" "$(basename "$f")"
                  done
                fi
                echo ""
              }

              docs-dev() {
                if [ ! -d docs/node_modules ]; then
                  (cd docs && pnpm install)
                fi
                python scripts/gen_tools_docs.py
                pnpm --dir docs dev
              }

              docs-build() {
                if [ ! -d docs/node_modules ]; then
                  (cd docs && pnpm install)
                fi
                python scripts/gen_tools_docs.py
                pnpm --dir docs build
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
            programs.nixfmt.enable = true;
            programs.ruff-format.enable = true;
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
            programs.nixfmt.enable = true;
            programs.ruff-format.enable = true;
          };
        in
        {
          formatting = treefmtEval.config.build.check self;
        }
      );
    };
}
