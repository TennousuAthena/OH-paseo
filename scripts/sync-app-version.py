#!/usr/bin/env python3
"""Sync HarmonyOS's public version with the checked-out Paseo app version."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent


def sync_version(root=ROOT):
    source = root / 'upstream/paseo/packages/app/package.json'
    version = json.loads(source.read_text())['version']
    if not isinstance(version, str) or not re.fullmatch(
        r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)'
        r'(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?', version
    ):
        raise ValueError(f'Unsupported upstream version: {version!r}')
    target = root / 'platform/harmonyos/AppScope/app.json5'
    text = target.read_text()
    # Preserve JSON5 formatting/comments and all unrelated application fields.
    names = re.findall(r'"versionName"\s*:\s*"([^"]*)"', text)
    codes = re.findall(r'"versionCode"\s*:\s*(\d+)', text)
    if len(names) != 1 or len(codes) != 1:
        raise ValueError('Expected exactly one versionName and versionCode')
    if names[0] != version:
        code = int(codes[0]) + 1
        if not 1 <= code <= 2147483647:
            raise ValueError('HarmonyOS versionCode is out of range')
        text = re.sub(r'("versionName"\s*:\s*)"[^"]*"',
                      lambda m: m[1] + json.dumps(version), text)
        text = re.sub(r'("versionCode"\s*:\s*)\d+',
                      lambda m: m[1] + str(code), text)
        target.write_text(text)
    return version


if __name__ == '__main__':
    print(sync_version())
