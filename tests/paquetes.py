"""Valida los paquetes de packs/: pack.json, nombres, requisitos, reglas y skills únicas."""
import json
import pathlib
import sys

repo = pathlib.Path(sys.argv[1])
packs = {p.parent.name: json.loads(p.read_text()) for p in sorted(repo.glob("packs/*/pack.json"))}
errores = []
skills = {d.name: "global" for d in repo.glob("skills/*/")}
for id, p in packs.items():
    if p.get("nombre") != id:
        errores.append(f"{id}: nombre distinto de la carpeta")
    if not p.get("descripcion"):
        errores.append(f"{id}: falta descripcion")
    if not p.get("detecta"):
        errores.append(f"{id}: sin reglas de detección")
    for r in p.get("detecta", []):
        if not ("npm" in r or "fichero" in r):
            errores.append(f"{id}: regla de detección desconocida {r}")
    for req in p.get("requiere", []):
        if req not in packs:
            errores.append(f"{id}: requiere {req}, que no existe")
    for d in (repo / "packs" / id / "skills").glob("*/"):
        if d.name in skills:
            errores.append(f"skill {d.name} repetida ({skills[d.name]} y {id})")
        skills[d.name] = id
for e in errores:
    print("  " + e)
sys.exit(1 if errores else 0)
