#!/usr/bin/env bash
set -euo pipefail

repo=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
app_root=${CYI_APP_ROOT:-"$HOME/apps/cyi-radio"}
node_bin=${CYI_NODE_BIN:-"$HOME/nodevenv/apps/cyi-radio/22/bin"}

if [[ ! -d "$app_root" || ! -x "$node_bin/node" || ! -x "$node_bin/npm" ]]; then
  echo 'Create the private CYI Radio Node.js 22 app in cPanel before deploying.' >&2
  exit 1
fi

export PATH="$node_bin:$PATH"
node -e 'if (!/^22\./.test(process.versions.node)) throw new Error("Select Node.js 22 in cPanel")'
printf 'Using Node.js %s and npm %s\n' "$(node --version)" "$(npm --version)"

frontend="$repo/deploy/frontend"
if [[ ! -s "$frontend/index.html" || ! -d "$frontend/assets" ]]; then
  echo 'Frontend build missing. Run npm run build:deploy before committing the release.' >&2
  exit 1
fi

check_dir=$(mktemp -d "${app_root%/*}/.cyi-radio-deps.XXXXXX")
trap 'rm -rf -- "$check_dir"' EXIT
cp "$repo/package.json" "$repo/package-lock.json" "$check_dir/"

cd "$check_dir"
# The Node selector can supply an npm prefix for the app's virtualenv.
check_npm=(npm --prefix "$check_dir" --global=false)
npm_prefix=$("${check_npm[@]}" prefix)
if [[ "$npm_prefix" != "$check_dir" ]]; then
  printf 'npm selected %s instead of the dependency check directory %s\n' "$npm_prefix" "$check_dir" >&2
  exit 1
fi
printf 'Checking production dependencies with %s/package-lock.json\n' "$npm_prefix"
"${check_npm[@]}" ci --omit=dev --no-audit --no-fund
"${check_npm[@]}" ls --omit=dev --depth=0

echo 'Copying prebuilt frontend assets into the application directory.'
mkdir -p "$app_root/dist/assets"
cp -R "$repo/server" "$repo/migrations" "$app_root/"
mkdir -p "$app_root/scripts"
cp "$repo/scripts/db.cjs" "$app_root/scripts/"
cp "$repo/app.js" "$repo/package.json" "$repo/package-lock.json" "$app_root/"
cp -R "$frontend/assets/." "$app_root/dist/assets/"
cp "$frontend/index.html" "$app_root/dist/"

echo 'Files deployed. Use Run NPM Install and Restart in Setup Node.js App.'
