"""Downloads the background-removal networks into U2NET_HOME (image build).

isnet-general-use (REMBG_MODEL) gives the best edges; u2netp is the small one
app/imaging.py falls back to when the server has little memory free.
"""
import os
import urllib.request

BASE = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/"
home = os.environ.get("U2NET_HOME", "/opt/rembg-models")
os.makedirs(home, exist_ok=True)
for name in sorted({os.environ.get("REMBG_MODEL", "isnet-general-use"), "u2netp"}):
    path = os.path.join(home, name + ".onnx")
    if os.path.exists(path):
        continue
    urllib.request.urlretrieve(BASE + name + ".onnx", path + ".part")
    os.replace(path + ".part", path)
    print(name, os.path.getsize(path) // 1024 // 1024, "MB")
