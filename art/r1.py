"""斗地主美术第一轮：乡村大院场景、座位头像、地主帽 / 农民草帽、炸弹王炸春天的特效图。结果在 out/r1/。

- 牌面复用掼蛋的像素扑克牌（代码画的），不用出。
- 场景（牌桌背景、首页主图）用 /create-image-pixen 512×288，每种 4 个种子：夜间灯笼月光的农家院，白天柿子树麦垛的农家院。
- 头像用 /generate-image-v2（40px，一次 64 个候选），挑 3 个当座位头像。
- 地主帽、农民草帽用 /generate-image-v2（32px，一次 64 个候选）。
- 特效（炸弹、火箭、爆炸、春天的桃花）用 /create-image-pixflux 透明底，每种 3 个种子。
PixelLab 同一时间只跑一个任务，按顺序来。

用法：python art/r1.py [名字 ...]（不写就全跑；已经出过的跳过）
"""
from __future__ import annotations

import sys

import pixellab

OUT = pixellab.ART / "out" / "r1"

SCENES: dict[str, tuple[str, tuple[int, ...]]] = {
    "yard-night": (
        "a traditional northern Chinese farmhouse courtyard at night, red paper lanterns glowing under the tiled eaves, full moon, "
        "grey brick walls, strings of dried red chili peppers and golden corn cobs hanging by the door, a stone mill, wooden benches, "
        "warm lantern light and cool blue moonlight, cozy, no people, no text, wide view",
        (11, 12, 13, 14),
    ),
    "yard-day": (
        "a traditional northern Chinese farmhouse courtyard on a sunny autumn afternoon, a persimmon tree full of orange persimmons, "
        "golden haystacks, golden corn cobs and red chili peppers hanging on grey brick walls, tiled roof, wooden benches, blue sky, "
        "bright and cheerful, no people, no text, wide view",
        (21, 22, 23, 24),
    ),
}

SPRITES: dict[str, tuple[str, int, int, bool]] = {
    "avatar": (
        "cute pixel art portrait of a cheerful chinese village card player for a game avatar, head and shoulders, front view, big eyes, "
        "rustic countryside clothing, warm colors, simple background removed",
        40,
        40,
        True,
    ),
    "hat-landlord": (
        "pixel art game icon of a traditional chinese landlord skullcap, a round black silk melon-skin cap with a red knot button on top, "
        "front view, bold outline",
        32,
        32,
        True,
    ),
    "hat-farmer": (
        "pixel art game icon of a woven golden straw farmer hat with a red band, front view, bold outline",
        32,
        32,
        True,
    ),
}

ITEMS: dict[str, tuple[str, int, tuple[int, ...]]] = {
    "bomb": ("a round black cartoon bomb with a short burning fuse and bright sparks, game icon, bold dark outline", 64, (31, 32, 33)),
    "rocket": ("a red chinese firework rocket with golden fins and a bright flame trail, pointing up, game icon, bold dark outline", 64, (41, 42, 43)),
    "boom": ("a big cartoon explosion burst, orange and yellow fire with white core and dark smoke puffs, game effect, bold dark outline", 96, (51, 52, 53)),
    "spring": ("a branch of pink peach blossoms with green leaves and falling petals, game icon, bold dark outline", 64, (61, 62, 63)),
}


def scene(name: str) -> None:
    prompt, seeds = SCENES[name]
    for seed in seeds:
        target = f"{name}-s{seed}"
        if (OUT / f"{target}.png").exists():
            continue
        pixellab.generate_image(target, {
            "description": prompt,
            "image_size": {"width": 512, "height": 288},
            "detail": "highly detailed",
            "seed": seed,
        }, OUT, endpoint="/create-image-pixen")
        print(target, "ok; spent", round(pixellab.spent_usd(), 4), flush=True)


def sprite(name: str) -> None:
    prompt, width, height, transparent = SPRITES[name]
    folder = OUT / name
    if folder.exists() and any(folder.glob("*.png")):
        print(name, "已有，跳过", flush=True)
        return
    pixellab.generate_async(name, {
        "description": prompt,
        "image_size": {"width": width, "height": height},
        "no_background": transparent,
        "seed": 901,
    }, folder, endpoint="/generate-image-v2")


def item(name: str) -> None:
    prompt, size, seeds = ITEMS[name]
    for seed in seeds:
        target = f"{name}-s{seed}"
        if (OUT / f"{target}.png").exists():
            continue
        pixellab.generate_image(target, {
            "description": prompt,
            "image_size": {"width": size, "height": size},
            "no_background": True,
            "outline": "single color black outline",
            "seed": seed,
        }, OUT)
        print(target, "ok; spent", round(pixellab.spent_usd(), 4), flush=True)


if __name__ == "__main__":
    names = sys.argv[1:] or [*SCENES, *SPRITES, *ITEMS]
    for name in names:
        try:
            if name in SPRITES:
                sprite(name)
            elif name in ITEMS:
                item(name)
            else:
                scene(name)
        except Exception as error:  # 一项失败不影响后面的
            print(name, "失败：", error, flush=True)
            continue
        print(name, "done; spent", round(pixellab.spent_usd(), 4), flush=True)
