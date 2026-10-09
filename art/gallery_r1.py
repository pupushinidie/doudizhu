"""斗地主 · 第一轮选图画廊。python art/gallery_r1.py 生成 art/out/gallery/（可以反复运行）。
本地查看：python -m http.server 8769 --directory art/out/gallery，然后打开 http://localhost:8769/gallery.html
页面（gallery.html，和麻将同一个模板）：选择存 localStorage，每 30 秒重读 gallery.json，底部汇总成一段可复制的文字。
"""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

from PIL import Image, ImageDraw

import pixellab

ART = Path(__file__).resolve().parent
OUT = ART / "out" / "gallery"
R1 = ART / "out" / "r1"
COVERS = Path.home() / "projects/game-center/art/out/covers"
SEAT = ["#f0b53a", "#3f8fe8", "#47b968"]


def copy_in(path: Path, folder: str, scale: int = 1) -> str:
    target = OUT / folder / path.name
    target.parent.mkdir(parents=True, exist_ok=True)
    if scale == 1:
        shutil.copyfile(path, target)
    else:
        image = Image.open(path)
        image.resize((image.width * scale, image.height * scale), Image.NEAREST).save(target)
    return target.relative_to(OUT).as_posix()


def candidate(folder: str, index: int) -> Path:
    return R1 / folder / (f"{folder}.png" if index == 0 else f"{folder}-{index}.png")


def item(item_id: str, title: str, note: str, sources: list[tuple[str, str, str]], recommended: str | None, **extra) -> dict:
    return {
        "id": item_id, "title": title, "note": note, "kind": "image", **extra,
        "candidates": [{"id": cid, "src": src, "label": label, **({"recommended": True} if cid == recommended else {})} for cid, src, label in sources],
    }


def avatar_set(cid: str, picks: list[int]) -> str:
    """一组 3 个座位头像，按牌桌上的样子（深色底、座位色边）放大 3 倍。"""
    strip = Image.new("RGBA", (3 * 48 - 4, 44), (0, 0, 0, 0))
    for index, pick in enumerate(picks):
        face = Image.open(candidate("avatar", pick)).convert("RGBA")
        box = Image.new("RGBA", (44, 44), SEAT[index])
        box.paste(Image.new("RGBA", (40, 40), (11, 17, 32, 255)), (2, 2))
        box.alpha_composite(face, (2, 2))
        strip.alpha_composite(box, (index * 48, 0))
    strip = strip.resize((strip.width * 3, strip.height * 3), Image.NEAREST)
    target = OUT / "avatars" / f"{cid}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    strip.save(target)
    return target.relative_to(OUT).as_posix()


def on_plate(folder: str, index: int, avatar: int = 23) -> str:
    """帽子戴在头像上（和牌桌名牌上一样：头像 2 倍，帽子 2 倍压在头顶），再放大 2 倍看清楚。"""
    canvas = Image.new("RGBA", (96, 112), (14, 20, 36, 255))
    face = Image.open(candidate("avatar", avatar)).convert("RGBA").resize((80, 80), Image.NEAREST)
    canvas.alpha_composite(face, (8, 24))
    hat = Image.open(candidate(folder, index)).convert("RGBA").resize((64, 64), Image.NEAREST)
    canvas.alpha_composite(hat, (16, 2))
    canvas = canvas.resize((canvas.width * 2, canvas.height * 2), Image.NEAREST)
    target = OUT / "hats" / f"{folder}-{index}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target)
    return target.relative_to(OUT).as_posix()


def numbered_sheet(folder: str, size: int, scale: int, title: str) -> Path:
    files = sorted((R1 / folder).glob("*.png"), key=lambda p: int("".join(ch for ch in p.stem.split("-")[-1] if ch.isdigit()) or 0) if p.stem != folder else 0)
    cell = size * scale
    cols = 8
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cell + 8) + 8, rows * (cell + 22) + 8), (40, 44, 60))
    draw = ImageDraw.Draw(sheet)
    for i, path in enumerate(files):
        number = 0 if path.stem == folder else int(path.stem.split("-")[-1])
        image = Image.open(path).convert("RGBA").resize((cell, cell), Image.NEAREST)
        x = 8 + (i % cols) * (cell + 8)
        y = 8 + (i // cols) * (cell + 22)
        sheet.paste(image, (x, y + 14), image)
        draw.text((x, y), str(number), fill=(255, 220, 0))
    target = ART / "out" / f"r1-{folder}-sheet.png"
    sheet.save(target)
    return target


def effects(name: str, seeds: tuple[int, ...], labels: dict[int, str], recommended: int, title: str, note: str, scale: int) -> dict | None:
    sources = [(f"s{seed}", copy_in(R1 / f"{name}-s{seed}.png", "fx", scale), labels.get(seed, "")) for seed in seeds if (R1 / f"{name}-s{seed}.png").exists()]
    if not sources:
        return None
    return item(name, title, note, sources, f"s{recommended}", scale=1)


def build() -> dict:
    items = []
    items.append(item("scene-night", "牌桌背景 · 夜间（农家院，灯笼月光）",
                      "512×288，按整数倍放大铺满牌桌，上面盖一层深色罩；首页主图也用它。s13 门匾上有乱码字，没放进来。",
                      [(f"s{s}", copy_in(R1 / f"yard-night-s{s}.png", "scenes"), label) for s, label in
                       ((14, "院子纵深、月亮、两边长凳（推荐）"), (12, "一排红灯笼、石磨"), (11, "正对堂屋、玉米辣椒挂满墙"))],
                      "s14", scale=1))
    items.append(item("scene-day", "牌桌背景 · 白天（柿子树、麦垛）",
                      "白天版用这张（罩色很淡）。s22 门上横幅有乱码字，没放进来。",
                      [(f"s{s}", copy_in(R1 / f"yard-day-s{s}.png", "scenes"), label) for s, label in
                       ((23, "柿子树居中、晴天（推荐）"), (24, "太阳、两个麦垛、纵深"), (21, "秋天落叶、长凳"))],
                      "s23", scale=1))
    items.append(item("avatars", "座位头像（一组 3 个，边框是座位色）",
                      "64 个候选见下面「全部头像候选」（带编号）。戴草帽穿红背心的几张太像《海贼王》的路飞，没放进组合里。想换哪几个，点「都不满意」在备注里写编号，比如「23 11 37」。",
                      [("A", avatar_set("A", [23, 11, 37]), "拿着牌的：奶奶 / 少年 / 姑娘（推荐）"),
                       ("B", avatar_set("B", [30, 26, 4]), "老爷子 / 扎辫子的姑娘 / 系头巾的小伙"),
                       ("C", avatar_set("C", [61, 19, 50]), "包头巾的奶奶 / 抱着一把牌的小伙 / 麻花辫姑娘")],
                      "A", scale=1))
    items.append(item("avatars-all", "全部头像候选（64 个，带编号）", "只是参考，不用选；在上一项的备注里写编号。",
                      [("all", copy_in(numbered_sheet("avatar", 40, 3, "头像"), "avatars"), "")], None, scale=1, wide=True))
    items.append(item("hat-landlord", "地主帽（当上地主后戴在头像上）",
                      "瓜皮帽，32px，显示 2 倍。图里是戴在头像上的样子。64 个候选见「全部地主帽」。",
                      [(f"L{i}", on_plate("hat-landlord", i), label) for i, label in
                       ((25, "金边 + 玉扣（推荐）"), (24, "红箍 + 金钱"), (9, "金色回纹边"), (36, "金边、黑缎"))],
                      "L25", scale=1))
    items.append(item("hat-farmer", "农民的斗笠（当农民时戴在头像上）",
                      "第一版画的是带红箍的草帽，太像《海贼王》路飞的帽子，改成斗笠。32px，显示 2 倍。64 个候选见下一项。",
                      [(f"F{i}", on_plate("hat-farmer2", i, 11), label) for i, label in
                       ((22, "竹篾一条条、有高光（推荐）"), (10, "深一点的编织纹"), (38, "横纹、偏红褐"), (0, "最素的一顶"))],
                      "F22", scale=1))
    items.append(item("hat-farmer-all", "全部斗笠候选（64 个，带编号）", "只是参考；想换别的编号写在上一项的备注里。",
                      [("all", copy_in(numbered_sheet("hat-farmer2", 32, 3, "斗笠"), "hats"), "")], None, scale=1, wide=True))
    items.append(item("hat-landlord-all", "全部地主帽候选（64 个，带编号）", "只是参考；想换别的编号写在「地主帽」的备注里。",
                      [("all", copy_in(numbered_sheet("hat-landlord", 32, 3, "地主帽"), "hats"), "")], None, scale=1, wide=True))
    fx = [
        effects("bomb", (33, 31, 32), {33: "冒火星（推荐）", 31: "导火索长", 32: "大火苗"}, 33, "炸弹", "出炸弹时先掉下来，再炸开。64px，显示 2 倍。", 3),
        effects("rocket", (42, 41, 43), {42: "红色烟花火箭（推荐）", 41: "像宇宙飞船", 43: "像宇宙飞船、斜着"}, 42, "王炸的火箭", "出王炸时从下往上飞出去。", 3),
        effects("boom", (51, 52, 53), {}, 51, "爆炸", "炸弹炸开的那一下。96px，显示 2 倍。", 2),
        effects("spring", (61, 62, 63), {}, 61, "春天 / 反春的桃花", "结算前弹出「春天！」时配的图。", 3),
    ]
    items.extend(entry for entry in fx if entry)
    if (COVERS / "doudizhu-s812-crop.png").exists():
        items.append(item("cover", "大厅卡片封面（已经上线的是 s812）",
                          "384×192，和其他游戏封面同一个画风，上下黑边导出时裁掉。第一批三张画了人，PixelLab 把地主帽画成了警帽，看着像警察打牌，全没用，改成不画人重出。",
                          [(cid, copy_in(COVERS / name, "covers"), label) for cid, name, label in
                           (("s812", "doudizhu-s812-crop.png", "院里一张矮桌、柿子、辣椒串、灯笼（推荐，现在用的）"),
                            ("s811", "doudizhu-s811.png", "红地毯，但桌上摆了四手牌（斗地主只有三个人）"),
                            ("s813", "doudizhu-s813.png", "比较素"))],
                          "s812", scale=1))
    return {
        "round": "r1",
        "title": "斗地主 · 第一轮：场景、头像、地主帽和斗笠、特效、封面",
        "updated": time.strftime("%m-%d %H:%M"),
        "spent": pixellab.spent_usd(),
        "intro": ("斗地主已经能玩（本地），美术先用我挑的（每项标「推荐」的就是现在用的）。牌面是掼蛋、德州那套像素扑克牌。\n"
                  "每项点「选这张」，或者「都不满意，重画」并写备注。最后把页面底部那段文字复制给我。"),
        "preview": [],
        "items": items,
    }


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    data = build()
    shots = OUT / "shots"
    if shots.exists():
        data["preview"] = [{"src": f"shots/{p.name}", "caption": caption, **({"small": True} if p.name == "phone.png" else {})} for p, caption in [
            (shots / "table-night.png", "牌桌 · 夜间版（1440×790）"),
            (shots / "table-day.png", "牌桌 · 白天版（1440×790）"),
            (shots / "bomb.png", "出炸弹的那一下"),
            (shots / "phone.png", "手机（390×664）"),
            (shots / "home.png", "首页"),
        ] if p.exists()]
    (OUT / "gallery.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
    shutil.copyfile(ART / "gallery.html", OUT / "gallery.html")
    print("gallery ok, items", len(data["items"]), "spent", round(pixellab.spent_usd(), 4))
