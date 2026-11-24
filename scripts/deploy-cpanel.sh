#!/usr/bin/env bash
set -euo pipefail

repo=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
app_root=${CYI_PHASE0_APP_ROOT:-"$HOME/apps/cyi-radio-phase0"}
node_bin=${CYI_PHASE0_NODE_BIN:-"$HOME/nodevenv/apps/cyi-radio-phase0/22/bin"}

if [[ ! -d "$app_root" || ! -x "$node_bin/node" || ! -x "$node_bin/npm" ]]; then
  echo 'Create the private Phase 0 Node.js 22 app in cPanel before deploying.' >&2
  exit 1
fi

export PATH="$node_bin:$PATH"
node -e 'if (!/^22\./.test(process.versions.node)) throw new Error("Select Node.js 22 in cPanel")'
printf 'Using Node.js %s and npm %s\n' "$(node --version)" "$(npm --version)"

build_dir=$(mktemp -d "${app_root%/*}/.cyi-phase0-build.XXXXXX")
trap 'rm -rf -- "$build_dir"' EXIT
cp "$repo/package.json" "$repo/package-lock.json" "$repo/index.html" "$build_dir/"
cp -R "$repo/frontend" "$build_dir/"

cd "$build_dir"
# The Node selector can supply an npm prefix for the app's virtualenv.
build_npm=(npm --prefix "$build_dir" --global=false)
npm_prefix=$("${build_npm[@]}" prefix)
if [[ "$npm_prefix" != "$build_dir" ]]; then
  printf 'npm selected %s instead of the build directory %s\n' "$npm_prefix" "$build_dir" >&2
  exit 1
fi
printf 'Building with the lockfile at %s/package-lock.json\n' "$npm_prefix"
"${build_npm[@]}" ci --include=dev --no-audit --no-fund
"${build_npm[@]}" run build
"${build_npm[@]}" ci --omit=dev --no-audit --no-fund
"${build_npm[@]}" ls --omit=dev --depth=0

mkdir -p "$app_root/dist/assets"
cp -R "$repo/server" "$repo/migrations" "$app_root/"
mkdir -p "$app_root/scripts"
cp "$repo/scripts/db.cjs" "$app_root/scripts/"
cp "$repo/app.js" "$repo/package.json" "$repo/package-lock.json" "$app_root/"
cp -R "$build_dir/dist/assets/." "$app_root/dist/assets/"
cp "$build_dir/dist/index.html" "$app_root/dist/"

echo 'Files deployed. Use Run NPM Install and Restart in Setup Node.js App.'
