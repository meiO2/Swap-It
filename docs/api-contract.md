# API contract

All responses use `{ success, data?, message? }`. Authenticated requests use
the `swapit_session` HTTP-only cookie. ADMIN-only endpoints reject other roles;
QC endpoints allow ADMIN and INSPECTOR.

## Authentication (existing)

- `POST /api/auth/register` — `{ name, email, password }`; starts registration and emails a six-digit OTP.
- `POST /api/auth/verify-otp` — `{ email, code }`; verifies and creates the account.
- `POST /api/auth/login` — `{ email, password }`; establishes the session cookie.
- `GET /api/auth/me` — returns the current user.
- `POST /api/auth/forgot-password` — `{ email }`; sends reset OTP without revealing account existence.
- `POST /api/auth/reset-password` — `{ email, code, newPassword }`; resets password and revokes sessions.
- `POST /api/auth/logout` — revokes the current session and clears the cookie.

## Account and addresses

- `GET /api/profile/addresses` — authenticated address list.
- `POST /api/profile/addresses` — `{ name, phone, address, city, postalCode }`; saves a profile address.
- `DELETE /api/profile/addresses/:id` — removes an address owned by the current user.
- `GET /api/profile` — returns current account profile.
- `PATCH /api/profile` — updates `name` and/or `phone` for the current account.

## Listings and orders

- `GET /api/listings` — current user's listings.
- `POST /api/listings` — creates a listing with `title`, `category`, `size`,
  `condition`, `price`, and `fulfillment` (`Swap Hub drop-off` or `Pickup`).
  `description` and an HTTP(S) `image` URL are optional. Pickup requires a
  future `pickupDate`; a `pickupAddress` snapshot may be supplied.
- `PATCH /api/listings/:id` — updates the pickup date for a listing owned by
  the current user.
- `GET /api/orders` — current user's orders.
- `POST /api/orders` — creates an order using courier delivery only. The
  request includes `deliveryMethod: "courier"`, a shipping address, courier
  code, and optional Green Points. Buyer service fee is 2.5% of the subtotal,
  bounded by the configured minimum and maximum.
- `GET /api/orders/:id` — returns an order belonging to the current user.
- `POST /api/uploads` — authenticated multipart upload with 1-8 `images`
  files (JPEG, PNG, or WebP; up to 5 MB each). The server uploads files to
  Cloudinary and returns their HTTPS URLs.

## Admin

- `GET /api/admin/qc` — QC queue for orders and listings.
- `PATCH /api/admin/qc/:type/:id` — `{ productId, category, answers, notes?,
  evidenceUrls? }`; stores a structured inspection assessment, not a buyer
  rejection. If any criterion is flagged, the item waits for the buyer and
  requires 1-8 uploaded Cloudinary evidence photos. The buyer receives a
  `QC_UPDATE` notification and chooses accept or reject through
  `POST /api/orders/:id/qc-decision`. Saving is disabled until approved QC
  criteria are configured in `src/data/qcCriteria.ts`.
- `GET /api/admin/revamp` — ADMIN-only merchandise list.
- `POST /api/admin/revamp` — ADMIN-only `{ name, category, size, condition, description, price, image, status }`.
- `PATCH /api/admin/revamp/:id` — ADMIN-only `{ status }` update; accepted
  values are `draft`, `available`, and `archived`.
- `GET /api/revamp` — public available merchandise.
- `GET /api/admin/news` — ADMIN-only news list including drafts.
- `POST /api/admin/news` — ADMIN-only `{ title, date, description, clothesDistributed, image, status }`.
- `PATCH /api/admin/news/:id` — ADMIN-only news update.
- `GET /api/news` — public published news list.

News create requires `title`, `date` (`YYYY-MM-DD`), `description`, `image`
(HTTP(S) URL), and `clothesDistributed`; `status` may be `draft` or
`published`. News update accepts those fields individually.

News image and Revamp image values are URLs. Image uploads require the
server-side `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
`CLOUDINARY_API_SECRET` environment variables. Order creation writes an order
record but does not collect payment. Catalog products, courier choices, Swap
Hubs, and fees are currently sourced from frontend repository data, not
separate APIs.
