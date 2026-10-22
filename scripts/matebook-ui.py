#!/usr/bin/env python3
"""Locate OH-Paseo native controls from a fresh UiTest layout before acting."""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile

HDC = os.environ.get('HDC_BIN', '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc')
TARGET = os.environ.get('HDC_TARGET', '192.168.2.120:37687')


def hdc(*args):
    return subprocess.run([HDC, '-t', TARGET, *args], check=True, capture_output=True, text=True).stdout


def ui(*args):
    return hdc('shell', shlex.join(['uitest', 'uiInput', *map(str, args)]))


def attributes(node):
    if isinstance(node, dict):
        if 'attributes' in node:
            yield node['attributes']
        for value in node.values():
            if isinstance(value, (dict, list)):
                yield from attributes(value)
    elif isinstance(node, list):
        for value in node:
            yield from attributes(value)


def layout():
    remote = '/data/local/tmp/ohpaseo-layout.json'
    hdc('shell', 'uitest', 'dumpLayout', '-b', 'moe.kiwi.ohpaseo', '-p', remote)
    with tempfile.TemporaryDirectory(prefix='ohpaseo-layout-') as folder:
        output = Path(folder) / 'layout.json'
        hdc('file', 'recv', remote, str(output))
        return list(attributes(json.loads(output.read_text())))


action = sys.argv[1] if len(sys.argv) > 1 else 'dump'
if action not in ('dump', 'assert-text', 'click-text', 'click-id', 'input-id'):
    raise SystemExit('Usage: matebook-ui.py [dump|assert-text TEXT|click-text TEXT|click-id ID|input-id ID VALUE]')
nodes = layout()
if action == 'assert-text':
    matches = [n.get('text', '') for n in nodes if sys.argv[2] in n.get('text', '') and n.get('visible') == 'true']
    if not matches:
        raise SystemExit(f'Visible text not found: {sys.argv[2]!r}')
    print(json.dumps(matches, ensure_ascii=False))
elif action == 'dump':
    print(json.dumps([{k: n.get(k) for k in ('type', 'id', 'text', 'bounds', 'enabled')}
                      for n in nodes if n.get('visible') == 'true' and
                      (n.get('type') in ('Button', 'TextInput') or n.get('id') == 'daemon-address')], ensure_ascii=False, indent=2))
else:
    key = 'text' if action == 'click-text' else 'id'
    matches = [n for n in nodes if n.get(key) == sys.argv[2] and n.get('visible') == 'true']
    if len(matches) != 1:
        raise SystemExit(f'Expected one visible {key}={sys.argv[2]!r}, got {len(matches)}')
    coords = list(map(int, re.findall(r'-?\d+', matches[0]['bounds'])))
    x, y = (coords[0] + coords[2]) // 2, (coords[1] + coords[3]) // 2
    print(ui('click', x, y).strip())
    if action == 'input-id':
        print(ui('keyEvent', 2072, 2017).strip())  # Ctrl+A
        print(ui('text', sys.argv[3]).strip())
