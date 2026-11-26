# Profile photos (tourists and guides)

**Status:**
- The backend is on branch `feature/profile-photos-backend`, waiting for review.
- The frontend is on `feature/frontend-updates`.

The frontend works with or without the backend change. Until the backend is merged and deployed, people
see their initial, and "Add photo" says photos can't be saved yet.

## What the backend branch adds

- **Upload:** `PUT /api/v1/users/me/photo` with a `multipart/form-data` field `file`.
  - It accepts JPEG, PNG or WebP files up to 5 MB.
  - Otherwise it returns `422`, or `413` if the file is too large.
  - The photo is turned upright, cropped to a 512×512 square and saved as a JPEG of about 20–60 KB.
  - EXIF data, which can include the GPS position where the photo was taken, is removed.
  - It returns the user, including `photo_url`.
- **Remove:** `DELETE /api/v1/users/me/photo`.
- **Read:** `GET /api/v1/users/{id}/photo` needs sign-in. It returns the photo when:
  - the photo is your own;
  - it belongs to any guide; or
  - it belongs to a tourist who has booked you.

  Everyone else gets `404`.
- **`photo_url`:** for example `/users/3/photo?v=1795684475`, relative to the API root.
  It is included in `GET /users/me`, in the guide summaries used by matches and bookings, and in the
  booking's tourist details.
- **Storage:** a new `user_photos` table, plus `users.photo_updated_at`, added by migration `a7b8c9d0e1f2`.
  Photos are kept in the database because Render's disk is wiped on every deploy.
  No outside storage account is needed.
- **Dependency:** `pillow` is added to `requirements.txt`.
- **Tests:** `tests/test_photos.py` covers resizing, EXIF removal, transparent PNGs and refused files.

## To make it live

1. Review and merge `feature/profile-photos-backend` into `main`.
2. Redeploy the API on Render. The start command already runs `alembic upgrade head`.

## Rules the team agreed to follow

- **Optional:** guides without a photo show their initial, and nothing breaks.
- **Content:** a clear photo of the person's face. The admin can check guides' photos when verifying them.
- **Ranking:** matching is **not** affected by having a photo. The order stays by match score.
- **Removal:** people can remove their photo at any time.
