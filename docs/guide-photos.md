# Guide photos: what the backend needs

The frontend already shows a round "face" for each guide on the match cards and on the tourist's booking cards.
Today it shows the guide's first initial, because the API has no photo yet. As soon as the API sends a
`photo_url`, the frontend shows the photo instead. No frontend release is needed for that part.

## 1. Database

Add one nullable column to `guides` (`backend/app/models/guide.py`), with an Alembic migration:

```python
photo_url: Mapped[str | None] = mapped_column(Text)
```

## 2. Send it to the frontend

Add `photo_url: str | None = None` to:

- `GuideSummary` in `backend/app/schemas/matching.py`. It is used by matches, bookings and itineraries.
  The frontend reads `guide.photo_url` from match results and from `GET /bookings/...`.
- `GuideProfileRead`, so the guide sees their own photo on My profile.

Fill it from `Guide.photo_url` wherever those schemas are built.

## 3. Upload and remove (the guide's own photo only)

| Method | Path | Body | Returns |
|---|---|---|---|
| `PUT` | `/api/v1/guides/me/photo` | `multipart/form-data`, field `file` | `GuideProfileRead` with the new `photo_url` |
| `DELETE` | `/api/v1/guides/me/photo` | none | `GuideProfileRead` with `photo_url: null` |

Rules for `PUT`:

- **Auth:** only the signed-in guide, for their own profile.
- **File type:** JPEG, PNG or WebP only. Check the file's real type, not just its extension. Otherwise
  return `422` with a clear `detail`.
- **Size:** 5 MB at most, otherwise `413`.
- **Resize:** if possible, resize to a 512×512 square (crop to the centre) and strip EXIF data.
  EXIF data can include the GPS location where the photo was taken. Pillow can do both.
- **Old photo:** replace the old photo, and delete the old file from storage.

## 4. Where the files live

**Not on Render's disk.** It is wiped on every deploy, so photos would disappear.
Use an object storage service with a free tier and save its public URL in `photo_url`. For example:

- **Cloudinary:** free tier, and it can crop, resize and strip EXIF for you.
- **Supabase Storage**, or any S3-compatible storage such as Cloudflare R2.

Keep the storage key in Render's environment variables, never in the repo.

## 5. Rules for the photo itself

These are decisions for the team. The frontend is built to match them.

- **Optional:** guides without a photo show their initial, and nothing breaks.
- **Content:** a clear photo of the guide's face, alone, with no logos.
  The admin can check this when verifying a guide.
- **Ranking:** matching is **not** affected by having a photo. The order stays by match score.
- **Removal:** the guide can remove their photo at any time.

## 6. Frontend follow-up

Once the API is ready, the frontend adds:

- a photo upload and remove control on the guide's My profile;
- the photo in the profile header.

Match and booking cards need no change.
