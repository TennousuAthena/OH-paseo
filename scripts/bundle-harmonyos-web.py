#!/usr/bin/env python3
"""Package the verified Paseo web export into the offline HarmonyOS client."""
from pathlib import Path
import os
import subprocess
import shutil

ROOT = Path(__file__).resolve().parent.parent
source = ROOT / 'runtime/verified-paseo/packages/app/dist'
target = ROOT / 'platform/harmonyos/entry/src/main/resources/rawfile/paseo'
if os.environ.get('OHPASEO_SKIP_WEB_BUILD') != '1':
    subprocess.run(['bash', str(ROOT / 'scripts/apply-paseo-web-patches.sh'), str(ROOT / 'runtime/verified-paseo')], check=True)
    subprocess.run(['npm', 'run', 'build:web', '--workspace=@getpaseo/app'],
                   cwd=ROOT / 'runtime/verified-paseo', check=True)
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
