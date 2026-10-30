#!/usr/bin/env python3
"""Package the verified Paseo web export into the offline HarmonyOS client."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import shutil

ROOT = Path(__file__).resolve().parent.parent
snapshot = ROOT / 'runtime/verified-paseo'
source = snapshot / 'packages/app/dist'
target = ROOT / 'platform/harmonyos/entry/src/main/resources/rawfile/paseo'
metadata = {
    'version': json.loads((snapshot / 'packages/app/package.json').read_text())['version'],
    'commit': (snapshot / '.upstream-commit').read_text().strip(),
    'patchesSha256': hashlib.sha256(b''.join(
        patch.read_bytes() for patch in sorted((ROOT / 'web/patches').glob('*.patch'))
    )).hexdigest(),
}
stamp = source / 'ohpaseo-build.json'
if os.environ.get('OHPASEO_SKIP_WEB_BUILD') != '1':
    subprocess.run(['bash', str(ROOT / 'scripts/apply-paseo-web-patches.sh'), str(snapshot)], check=True)
    subprocess.run(['npm', 'run', 'build:web', '--workspace=@getpaseo/app'],
                   cwd=snapshot, check=True)
    stamp.write_text(json.dumps(metadata, indent=2) + '\n')
elif not stamp.is_file() or json.loads(stamp.read_text()) != metadata:
    raise SystemExit('Web export is stale or unverified; rebuild without OHPASEO_SKIP_WEB_BUILD=1')
if not (source / 'index.html').is_file():
    raise SystemExit('Build upstream first: npm run build:web --workspace=@getpaseo/app')
if target.exists():
    shutil.rmtree(target)
shutil.copytree(source, target, ignore=shutil.ignore_patterns('*.map', '*.br', '*.gz'))
index = target / 'index.html'
html = index.read_text()
if '<head>' not in html:
    raise SystemExit('Web export is missing its head element')
index.write_text(html.replace('<head>', '<head><script src="/__native/capabilities.js"></script>', 1))
print(f'Bundled Paseo web UI: {len(list(target.rglob("*")))} entries')
