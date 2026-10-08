"""
Extrai da Universal Animation Library (Quaternius, CC0) só o que o jogo usa e grava um JSON leve:
  public/anims/ual_humanoid.json

- Esqueleto de origem: só o corpo (sem dedos), com a pose de descanso de cada osso.
- Animações escolhidas em CLIPS (arquivo SEM root motion = no lugar), rotações + translação do quadril.
- Do arquivo COM root motion só sai o deslocamento por ciclo (distância que o personagem anda):
  é o que deixa o jogo casar a velocidade dos pés com o deslocamento real (sem "patinar").

O retargeting para o esqueleto de cada personagem é feito no jogo (render/units/model/anim/retarget.ts),
então personagens novos com o esqueleto padrão usam as mesmas animações sem rodar este script de novo.

Uso:  python scripts/build_anim_library.py
"""
import json
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Universal Animation Library[Standard]" / "Unreal-Godot"
OUT = ROOT / "public" / "anims" / "ual_humanoid.json"

# animações usadas (nome na biblioteca)
CLIPS = [
    "Idle_Loop",
    "Sword_Idle",
    "Walk_Loop",
    "Jog_Fwd_Loop",
    "Sprint_Loop",
    "Sword_Attack",
    "Punch_Jab",
    "Punch_Cross",
    "Hit_Chest",
    "Hit_Head",
    "Death01",
    "Spell_Simple_Enter",
    "Spell_Simple_Shoot",
    "Spell_Simple_Exit",
    "Spell_Simple_Idle_Loop",
    "Jump_Land",
    "Roll",
]
# ossos do corpo (dedos e "folhas" ficam de fora)
BONES = [
    "root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
    "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l", "middle_01_l",
    "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r", "middle_01_r",
    "thigh_l", "calf_l", "foot_l", "ball_l",
    "thigh_r", "calf_r", "foot_r", "ball_r",
]
CT = {5126: np.float32}
NC = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}


def load(path: Path):
    b = path.read_bytes()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20 : 20 + n])
    off = 20 + n
    bl = struct.unpack("<I", b[off : off + 4])[0]
    binary = b[off + 8 : off + 8 + bl]

    def acc(i):
        a = j["accessors"][i]
        bv = j["bufferViews"][a["bufferView"]]
        o = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        c = a["count"] * NC[a["type"]]
        return np.frombuffer(binary, dtype=CT[a["componentType"]], count=c, offset=o).reshape(a["count"], NC[a["type"]])

    return j, acc


def r(a, d=4):
    return [round(float(x), d) for x in np.asarray(a).ravel()]


def main():
    j, acc = load(SRC / "UAL1_Standard.glb")
    nodes = j["nodes"]
    idx = {n.get("name"): i for i, n in enumerate(nodes)}
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i
    bones = []
    for name in BONES:
        n = nodes[idx[name]]
        p = parent.get(idx[name])
        pname = nodes[p].get("name") if p is not None else None
        bones.append({
            "n": name,
            "p": pname if pname in BONES else None,
            "t": r(n.get("translation", [0, 0, 0])),
            "r": r(n.get("rotation", [0, 0, 0, 1]), 6),
        })
    # a raiz do Armature (pai do "root") não tem transformação; o "root" carrega a conversão Z→Y

    jr, accr = load(SRC / "UAL1_Standard_RM.glb")
    rm_nodes = jr["nodes"]
    stride = {}
    for an in jr["animations"]:
        if an["name"] not in CLIPS:
            continue
        for ch in an["channels"]:
            if rm_nodes[ch["target"]["node"]].get("name") == "root" and ch["target"]["path"] == "translation":
                v = accr(an["samplers"][ch["sampler"]]["output"])
                stride[an["name"]] = r(v[-1] - v[0], 3)

    clips = {}
    for an in j["animations"]:
        name = an["name"]
        if name not in CLIPS:
            continue
        times = None
        tracks = {}
        hips = None
        for ch in an["channels"]:
            node = nodes[ch["target"]["node"]].get("name")
            path = ch["target"]["path"]
            if node not in BONES:
                continue
            s = an["samplers"][ch["sampler"]]
            t = acc(s["input"]).ravel()
            if times is None:
                times = t
            elif len(t) != len(times) or np.abs(t - times).max() > 1e-4:
                raise SystemExit(f"{name}: trilhas com tempos diferentes ({node}.{path})")
            v = acc(s["output"])
            if path == "rotation":
                tracks[node] = r(v, 4)
            elif path == "translation" and node == "pelvis":
                hips = r(v, 4)
        clips[name] = {
            "d": round(float(times[-1]), 4),
            "n": int(len(times)),
            "rot": tracks,
            "pelvis": hips,
            "stride": stride.get(name, [0, 0, 0]),
        }
        missing = [c for c in CLIPS if c not in clips]
    if missing:
        raise SystemExit(f"Animações não encontradas: {missing}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "source": "Universal Animation Library [Standard] — Quaternius (CC0 1.0)",
        "bones": bones,
        "clips": clips,
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")))
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1024:.0f} KB, {len(clips)} animações")


if __name__ == "__main__":
    main()
