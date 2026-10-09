"""把 selection.json 里选中的美术导出到 apps/web/public/art/（牌面复用掼蛋的像素扑克牌，不在这里）。

用法：python art/export.py
"""
import json
import shutil
from pathlib import Path

from PIL import Image

ART = Path(__file__).resolve().parent
OUT = ART.parent / "apps/web/public/art"
R1 = ART / "out/r1"


def candidate(folder: str, index: int) -> Path:
    """generate-image-v2 一次出 64 张：第 0 张叫 <folder>.png，其余 <folder>-<n>.png。"""
    return R1 / folder / (f"{folder}.png" if index == 0 else f"{folder}-{index}.png")


def copy_sprite(src: Path, dst: Path, size: int) -> None:
    """小图：透明底，原尺寸导出（页面上只按整数倍放大）。"""
    image = Image.open(src).convert("RGBA")
    assert image.size == (size, size), (src, image.size)
    image.save(dst)


def main() -> None:
    selection = json.loads((ART / "selection.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for key in ("scene-night", "scene-day"):
        shutil.copyfile(R1 / f"{selection[key]}.png", OUT / f"{key}.png")
    for seat, index in enumerate(selection["avatars"]):
        copy_sprite(candidate("avatar", index), OUT / f"avatar-{seat}.png", 40)
    copy_sprite(candidate("hat-landlord", selection["hat-landlord"]), OUT / "hat-landlord.png", 32)
    copy_sprite(candidate(selection["hat-farmer"][0], selection["hat-farmer"][1]), OUT / "hat-farmer.png", 32)
    # 网页图标用地主帽
    shutil.copyfile(OUT / "hat-landlord.png", OUT / "icon.png")
    for key, size in (("bomb", 64), ("rocket", 64), ("boom", 96), ("spring", 64)):
        copy_sprite(R1 / f"{selection[key]}.png", OUT / f"{key}.png", size)
    print("exported to", OUT)


if __name__ == "__main__":
    main()
