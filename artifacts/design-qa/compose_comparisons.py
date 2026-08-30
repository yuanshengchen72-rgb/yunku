from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
TARGET_SIZE = (1265, 712)
HEADER_HEIGHT = 36


def normalize_reference(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")
    # Remove Edge chrome/debug banner so both sides start at the 1688 app shell.
    image = image.crop((0, 164, image.width, image.height))
    scale = TARGET_SIZE[0] / image.width
    image = image.resize(
        (TARGET_SIZE[0], round(image.height * scale)), Image.Resampling.LANCZOS
    )
    canvas = Image.new("RGB", TARGET_SIZE, "white")
    canvas.paste(image.crop((0, 0, TARGET_SIZE[0], TARGET_SIZE[1])), (0, 0))
    return canvas


def normalize_implementation(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")
    if image.size != TARGET_SIZE:
        image = image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)
    return image


def compose(reference: str, implementation: str, output: str) -> None:
    left = normalize_reference(ROOT / reference)
    right = normalize_implementation(ROOT / implementation)
    canvas = Image.new(
        "RGB", (TARGET_SIZE[0] * 2, TARGET_SIZE[1] + HEADER_HEIGHT), "#f5f5f5"
    )
    canvas.paste(left, (0, HEADER_HEIGHT))
    canvas.paste(right, (TARGET_SIZE[0], HEADER_HEIGHT))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=18)
    draw.text((14, 8), "REFERENCE / XIAOFENG", fill="#171717", font=font)
    draw.text(
        (TARGET_SIZE[0] + 14, 8),
        "IMPLEMENTATION / DIANCHAO",
        fill="#171717",
        font=font,
    )
    draw.line(
        (TARGET_SIZE[0], 0, TARGET_SIZE[0], canvas.height),
        fill="#ff5a14",
        width=2,
    )
    canvas.save(ROOT / output, optimize=True)


compose(
    "reference-xiaofeng-keyword.png",
    "implementation-search-keyword-batch-final.png",
    "comparison-keyword-batch.png",
)
compose(
    "reference-xiaofeng-image.png",
    "implementation-search-image-revised.png",
    "comparison-image.png",
)
compose(
    "reference-xiaofeng-results.png",
    "implementation-search-results-final.png",
    "comparison-results.png",
)
