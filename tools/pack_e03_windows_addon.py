"""Package a separately approved E03 development add-on for the pinned private Windows ZIP."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
from zipfile import ZipFile, ZIP_DEFLATED

BASE = '466af71d4424a18c617edc6c348f5ad07687c5021a79f2d6561db1260ddff795'
PINS = {'model.json': '73bcc66edef98c8d29ac6cfc5af1c7c7cf4585b2acdf7fb75b6296371a98a014',
        'checkpoint.safetensors': '95abbe0a8c77b36d9f319648a6f49490d77600c42479b18d14500cfcaac6f822'}
START = r'''@echo off
setlocal
set "ENGINE=%~dp0..\engine-win64"
if not exist "%ENGINE%\runtime\bundle.json" (echo Extract the approved base ZIP first. & exit /b 2)
if not defined LOCALAPPDATA exit /b 2
set "SCRATCH=%LOCALAPPDATA%\Qolda\scratch"
if not exist "%SCRATCH%" mkdir "%SCRATCH%"
if not exist "%SCRATCH%\." exit /b 2
echo When the server reports READY at 127.0.0.1:8870, launch windows\Qolda.exe --attach-port 8870.
echo If the port is occupied do not attach to the old server as proof of this add-on.
"%ENGINE%\python\python.exe" -B -m backend.api --port 8870 --bundle "%ENGINE%\runtime\bundle.json" --artifacts "%ENGINE%\runtime" --pose-model "%ENGINE%\runtime\end2end.onnx" --ffprobe "%ENGINE%\runtime\ffprobe.exe" --private-scratch "%SCRATCH%" --extra-model-root "%~dp0models"
exit /b %ERRORLEVEL%
'''


def private_dir(path):
    path = path.resolve(strict=True)
    if not path.is_dir() or any((p / '.git').exists() for p in (path, *path.parents)):
        raise ValueError('Use private directories outside Git')
    return path


def pack(run, output):
    run = private_dir(run)
    private_dir(output.parent)
    files = {}
    for name in [*PINS, 'promotion.json']:
        path = run / name
        if path.is_symlink() or path.resolve(strict=True).parent != run:
            raise ValueError('Invalid private model path')
        data = path.read_bytes()
        if name in PINS and hashlib.sha256(data).hexdigest() != PINS[name]:
            raise ValueError('Unapproved bytes for ' + name)
        files['e03-addon/models/E03/run/' + name] = data
    policy = json.loads(files['e03-addon/models/E03/run/promotion.json'])
    expected = {'schema':'qolda-extra-promotion-v1', 'exercise':'E03', 'owner_id':'anton-a1',
                'decision':'approved', 'checkpoint':'checkpoint.safetensors', 'sha256':PINS['checkpoint.safetensors'],
                'low_confidence_below':0.70, 'file_platforms':{'web':True, 'windows':True}}
    if policy != expected or any(v is not True for v in policy['file_platforms'].values()):
        raise ValueError('Owner approval for both file platforms is required; never promote during packing')
    files['e03-addon/start-e02-e03.cmd'] = START.replace('\n','\r\n').encode('ascii')
    files['e03-addon/BASE-SHA256.txt'] = (BASE+'  Qolda-Windows-Shared-WIP-7b88e3a.zip\r\n').encode('ascii')
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        path = Path(tmp) / 'addon.zip'
        with ZipFile(path, 'x', compression=ZIP_DEFLATED) as z:
            for key, data in files.items():
                z.writestr(key, data)
        with ZipFile(path) as z:
            if z.namelist() != list(files) or any(z.read(k) != v for k,v in files.items()):
                raise ValueError('Archive readback mismatch')
        # Exclusive creation prevents accidental replacement of another delivery.
        import os
        os.link(path, output)
    print(json.dumps({'file':output.name,'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'members':len(files),'base_sha256':BASE}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--approved-run', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    pack(args.approved_run, args.out)
