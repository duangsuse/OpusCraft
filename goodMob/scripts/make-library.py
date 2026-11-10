#!/usr/bin/env python3
"""Regenerate hacks/library.json: the models the start screen shows by default.

The start screen cannot list a directory on its own (a static server has no directory API), so the built-in library
is a manifest. Re-run this after adding or removing files in reference-ents/ or vox-demo/.

    python3 scripts/make-library.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODELS = []

for name in sorted(os.listdir(os.path.join(ROOT, 'reference-ents'))):
    path = os.path.join(ROOT, 'reference-ents', name)
    if os.path.isfile(path):
        MODELS.append({'name': name, 'kind': 'svox', 'file': f'reference-ents/{name}'})

for name in sorted(os.listdir(os.path.join(ROOT, 'vox-demo'))):
    if name.lower().endswith('.vox'):
        MODELS.append({'name': name[:-4], 'kind': 'vox', 'file': f'vox-demo/{name}'})

out = os.path.join(ROOT, 'hacks', 'library.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump({'models': MODELS}, f, indent=1)
    f.write('\n')
print(f'{len(MODELS)} models -> {os.path.relpath(out, ROOT)}')
