import io

import pytest
from PIL import Image

from app.services.photos import MAX_UPLOAD_BYTES, SIZE, PhotoError, make_profile_photo


def encode(img: Image.Image, fmt: str, **kw) -> bytes:
    out = io.BytesIO()
    img.save(out, fmt, **kw)
    return out.getvalue()


def test_makes_a_square_jpeg():
    raw = encode(Image.new("RGB", (1200, 800), (200, 30, 60)), "PNG")
    img = Image.open(io.BytesIO(make_profile_photo(raw)))
    assert img.format == "JPEG"
    assert img.size == (SIZE, SIZE)


def test_drops_exif_and_applies_rotation():
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: rotate 90°
    exif[0x8825] = {2: (37.0, 34.0, 0.0)}  # a GPS position
    raw = encode(Image.new("RGB", (800, 400), (10, 120, 200)), "JPEG", exif=exif)
    out = Image.open(io.BytesIO(make_profile_photo(raw)))
    assert not out.getexif()  # no orientation, no GPS
    assert out.size == (SIZE, SIZE)


def test_transparent_png_goes_on_white():
    raw = encode(Image.new("RGBA", (600, 600), (0, 0, 0, 0)), "PNG")
    out = Image.open(io.BytesIO(make_profile_photo(raw))).convert("RGB")
    assert out.getpixel((SIZE // 2, SIZE // 2))[0] > 240


@pytest.mark.parametrize("raw", [b"not an image", b"GIF89a" + b"\0" * 100])
def test_refuses_non_photos(raw):
    with pytest.raises(PhotoError):
        make_profile_photo(raw)


def test_refuses_gif():
    with pytest.raises(PhotoError, match="JPEG, PNG or WebP"):
        make_profile_photo(encode(Image.new("RGB", (50, 50)), "GIF"))


def test_refuses_too_large():
    with pytest.raises(PhotoError, match="5 MB"):
        make_profile_photo(b"\xff" * (MAX_UPLOAD_BYTES + 1))
