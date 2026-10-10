"""Recreate pinned candidate files in this isolated evaluation directory."""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
os.environ['HF_HOME'] = str(ROOT / 'cache')
from huggingface_hub import snapshot_download
SPECS = {
    'granite': ('ibm-granite/granite-embedding-311m-multilingual-r2', '44399559930365213510b1ee2eb15ded83374f0e', 623341952),
    'gte': ('Alibaba-NLP/gte-multilingual-reranker-base', '8215cf04918ba6f7b6a62bb44238ce2953d8831c', 611934706),
}

def curl(url: str, target: Path, expected: int | None = None):
    target.parent.mkdir(parents=True, exist_ok=True)
    if expected is None:
        if target.exists() and target.stat().st_size:
            return
        temp = target.with_name(target.name + '.part')
        for _ in range(8):
            result = subprocess.run(['curl', '-fLsS', '--connect-timeout', '15', '--max-time', '180',
                                     url, '-o', str(temp)], check=False)
            if result.returncode == 0 and temp.exists() and temp.stat().st_size:
                temp.replace(target)
                return
        raise RuntimeError(f'Incomplete download: {target}')
    for _ in range(8):
        size = target.stat().st_size if target.exists() else 0
        if expected is not None and size == expected:
            return
        command = ['curl', '-fLsS', '--connect-timeout', '15', '--max-time', '180']
        if size:
            command += ['-C', '-']
        command += [url, '-o', str(target)]
        subprocess.run(command, check=False)
    if not target.exists() or (expected is not None and target.stat().st_size != expected):
        raise RuntimeError(f'Incomplete download: {target}')

def model_files(label: str, repo: str, revision: str, weight_bytes: int):
    base = ROOT / 'models' / label
    metadata = base / 'api.json'
    curl(f'https://huggingface.co/api/models/{repo}/revision/{revision}', metadata)
    siblings = json.loads(metadata.read_text())['siblings']
    for item in siblings:
        name = item['rfilename']
        if name == 'model.safetensors' or name.endswith(('.json', '.txt', '.model')):
            curl(f'https://huggingface.co/{repo}/resolve/{revision}/{name}', base / name,
                 weight_bytes if name == 'model.safetensors' else None)
    return base

old_no_proxy = os.environ.get('NO_PROXY')
old_no_proxy_lower = os.environ.get('no_proxy')
os.environ['NO_PROXY'] = os.environ['no_proxy'] = '*'
try:
    snapshot_download('Qwen/Qwen3-Embedding-0.6B',
                      revision='97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3',
                      allow_patterns=['*.json', '*.safetensors', '*.txt', '*.model'],
                      max_workers=2)
finally:
    for key, old in [('NO_PROXY', old_no_proxy), ('no_proxy', old_no_proxy_lower)]:
        if old is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = old
for label, (repo, revision, size) in SPECS.items():
    model_files(label, repo, revision, size)

gte = ROOT / 'models/gte'
code_revision = '40ced75c3017eb27626c9d4ea981bde21a2662f4'
for name in ['configuration.py', 'modeling.py']:
    curl(f'https://huggingface.co/Alibaba-NLP/new-impl/resolve/{code_revision}/{name}', gte / name)
config_path = gte / 'config.json'
config = json.loads(config_path.read_text())
config['auto_map'] = {name: value.split('--')[-1] for name, value in config['auto_map'].items()}
config_path.write_text(json.dumps(config, indent=2) + '\n')
print('Candidate files ready under', ROOT)
