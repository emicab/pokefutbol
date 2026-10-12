"""Importa sprites de Pokémon desde una copia de PokéSurvivor.

Uso:
    python tools/import_pokemon.py RUTA_A_POKESURVIVOR 25 4 7 ...

Copia assets/pokemon/{dex}/*.png (sin shinies), y regenera
js/sprites-meta.js y CREDITS.md con TODOS los dex presentes en
assets/pokemon/ de este proyecto.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANIMS = ["Idle", "Walk", "Attack", "Shoot", "Charge", "Hurt"]


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    for dex in sys.argv[2:]:
        dst = ROOT / "assets" / "pokemon" / dex
        dst.mkdir(parents=True, exist_ok=True)
        for anim in ANIMS:
            f = src / "assets" / "pokemon" / dex / f"{anim}.png"
            if f.exists():
                shutil.copy2(f, dst / f.name)
        print("copiado", dex)

    have = sorted(int(p.name) for p in (ROOT / "assets" / "pokemon").iterdir() if p.is_dir())

    # metadatos: una línea por dex en el sprites-meta.js original
    meta_src = (src / "js" / "data" / "sprites-meta.js").read_text(encoding="utf-8")
    lines = {}
    for line in meta_src.splitlines():
        m = re.match(r"\s*(\d+):\s*\{", line)
        if m:
            lines[int(m.group(1))] = line.rstrip().rstrip(",")
    out = [
        "/* sprites-meta.js — GENERADO por tools/import_pokemon.py, no editar a mano.",
        " * Extraído de PokéSurvivor (SpriteCollab AnimData.xml). Ver sprites.js. */",
        "PF.SPRITE_META = {",
    ]
    out += [f"  {lines[d].strip()}," for d in have if d in lines]
    out.append("};")
    (ROOT / "js" / "sprites-meta.js").write_text("\n".join(out) + "\n", encoding="utf-8")

    # créditos: artistas de esos dex
    credits = (src / "CREDITS.md").read_text(encoding="utf-8")
    want = set(have)
    rows = []
    for line in credits.splitlines():
        m = re.match(r"\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([\d,\s]+)\|", line)
        if not m:
            continue
        nums = {int(x) for x in m.group(3).replace(" ", "").split(",") if x}
        hit = sorted(nums & want)
        if hit:
            rows.append(f"| {m.group(1)} | {m.group(2)} | {', '.join(map(str, hit))} |")
    text = (
        "# Créditos\n\n## Sprites\n\n"
        "Sprites estilo *Pokémon Mundo Misterioso* de [SpriteCollab](https://github.com/PMDCollab/SpriteCollab),\n"
        "licencia [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): uso **no comercial** y con atribución.\n"
        "Copiados de [PokéSurvivor](https://github.com/JPTER78/pokesurvivor) (código MIT de JPTER78).\n\n"
        "| Artista | Contacto | Sprites (nº de Pokédex) |\n|---|---|---|\n"
        + "\n".join(rows)
        + "\n\n## Fuente\n\nPixelify Sans, licencia SIL Open Font License (ver `assets/fonts/OFL.txt`).\n\n"
        "Pokémon y sus nombres son marcas de Nintendo, Creatures y GAME FREAK. Proyecto de fans, sin ánimo de lucro.\n"
    )
    (ROOT / "CREDITS.md").write_text(text, encoding="utf-8")
    print(f"{len(have)} Pokémon en el proyecto, {len(rows)} artistas en CREDITS.md")


if __name__ == "__main__":
    main()
