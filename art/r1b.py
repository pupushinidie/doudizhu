"""斗地主美术第一轮补充：农民的标记换成斗笠（第一版草帽带红箍，太像《海贼王》路飞的帽子，不用）。结果在 out/r1/hat-farmer2/。"""
from __future__ import annotations

import pixellab

OUT = pixellab.ART / "out" / "r1"

if __name__ == "__main__":
    folder = OUT / "hat-farmer2"
    if folder.exists() and any(folder.glob("*.png")):
        print("hat-farmer2 已有，跳过")
    else:
        pixellab.generate_async("hat-farmer2", {
            "description": "pixel art game icon of a traditional chinese conical bamboo rice hat (douli), wide pointed cone, woven bamboo texture in tan and brown, "
                           "dark brown chin strap, no ribbon, no band, front view, bold outline",
            "image_size": {"width": 32, "height": 32},
            "no_background": True,
            "seed": 902,
        }, folder, endpoint="/generate-image-v2")
    print("hat-farmer2 done; spent", round(pixellab.spent_usd(), 4), flush=True)
