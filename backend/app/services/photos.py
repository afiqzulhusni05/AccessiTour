"""Profile photos: check an upload is a real image and turn it into a small, square JPEG."""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
SIZE = 512  # stored photos are SIZE × SIZE
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
# Refuse "decompression bombs": tiny files that expand into huge images.
Image.MAX_IMAGE_PIXELS = 40_000_000


class PhotoError(ValueError):
    """The upload can't be used as a profile photo; the message says why."""


def make_profile_photo(raw: bytes) -> bytes:
    """A 512×512 JPEG made from `raw`: turned upright, cropped to the centre, with no EXIF
    (which can hold the GPS position where the photo was taken). Raises PhotoError."""
    if len(raw) > MAX_UPLOAD_BYTES:
        raise PhotoError("The photo is larger than 5 MB.")
    try:
        img = Image.open(io.BytesIO(raw))
        if img.format not in ALLOWED_FORMATS:
            raise PhotoError("Use a JPEG, PNG or WebP photo.")
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise PhotoError("This file isn't a photo we can read.") from e

    img = ImageOps.exif_transpose(img)  # phones store rotation in EXIF; apply it before EXIF is dropped
    if img.mode not in ("RGB", "L"):
        # transparent PNGs: put them on white instead of black
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img.convert("RGBA"), mask=img.convert("RGBA").getchannel("A"))
        img = background
    img = ImageOps.fit(img.convert("RGB"), (SIZE, SIZE), Image.Resampling.LANCZOS)

    out = io.BytesIO()
    img.save(out, "JPEG", quality=85, optimize=True)  # no exif= argument, so nothing is carried over
    return out.getvalue()
