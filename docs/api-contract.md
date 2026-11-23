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
- `POST /api/orders` — creates an order with either `deliveryMethod: "courier"`,
  a shipping address and courier code, or `deliveryMethod: "pickup"` and a
  `pickupHubId` from the Swap Hub catalog. Pickup has no shipping fee. After
  QC, an admin confirms all items are physically available at the selected hub,
  then records their collection; the buyer confirms receipt to complete the
  order. Green Points are optional. The buyer service fee is 3% of product
  subtotal, rounded half up to whole rupiah. Green Point redemption is capped
  at 30% of product subtotal; shipping and service fees are paid in cash.
  Each seller's products must total at least Rp5.500. The order stores an
  immutable financial snapshot: gateway budget (0.7% of product subtotal),
  target SwapIt revenue (1.5%), GP pool (floor of 0.8%), actual gateway-fee
  estimate (0.7% of cash processed, including shipping), and the corresponding
  allocation. The GP pool is split 60% buyer / 40% sellers, with seller shares
  allocated proportionally using largest remainder. Seller fee snapshots
  record Rp5.500 once per seller per order.
- `GET /api/orders/:id` — returns an order belonging to the current user.
  Sellers receive their own fee and GP reward snapshots and, after order
  completion, the seller payable status.
- `POST /api/orders/:id/confirm-received` — buyer-only confirmation after the
  order has reached `DELIVERED`. It changes the order to `COMPLETED`, issues
  funded purchase rewards, and creates seller payables (zero-value payables
  are immediately `SETTLED`).
- `POST /api/orders/:id/cancel` — buyer cancellation of an order still
  awaiting payment; releases any reserved GP redemption and restores the
  points. Orders with a PRASMUL payment require manual reconciliation and
  cannot be cancelled by this endpoint.
- `POST /api/payments` — authenticated `{ orderId }`; creates or returns the
  pending QRIS payment for the buyer's pending order. With
  `PAYMENT_PROVIDER=PRASMUL`, the provider create request uses
  `/api/partners/orders/`. A configured provider-confirmed expiry time zone,
  callback URL, credentials and unique payment order index are required before
  creating a new PRASMUL payment. Production requires
  `https://swapitproject.web.id/api/payments/prasmul/callback/qris` as
  `PRASMUL_WEBHOOK_URL`. The provider amount must equal checkout.
- `GET /api/payments?orderId=:id` — returns the current user's payment status.
  Pending PRASMUL records are checked using the provider's legacy order-detail
  endpoint. A matching `Lunas` atomically finalizes the payment and order;
  `Belum Lunas` remains pending, while mismatches, unknown statuses and lookup
  failures remain unverified. When both sides have a QR ID, they must match.
  If a verified payment cannot be finalized, `verificationMessage` explains
  that reconciliation is required. Polling does not depend on callbacks or
  run in the background when no client requests status. An existing PRASMUL
  QR is shown only if its QR ID and code match the provider detail, the amount
  matches the payment and pending order, and both expiry checks pass.
  `expiredPayment` is omitted unless the provider's expiry can be parsed
  with an explicit or provider-confirmed configured time zone and matches
  the local record. When a QR is displayed, it is the earlier of the provider
  expiry and the order payment deadline; the timestamp itself does not
  establish expired status.
- `GET /api/prasmul/status?orderId=:id` — authenticated PRASMUL detail check
  for the buyer's payment. A matching `Lunas` also triggers the same atomic
  finalization as the callback and main payments endpoint.
- `POST /api/payments/webhook` — Xendit payment callback. A successful payment
  consumes the order's reserved GP redemption and advances the order to seller
  handover.
- `POST /api/payments/prasmul/webhook` — legacy alias of the QRIS callback
  below; it uses the same payload validation and provider verification.
  Configure new orders with the canonical QRIS callback URL, not this alias.
- `POST /api/payments/prasmul/callback/qris` — accepts the provided
  `qr.payment` example with a case-insensitive `PRASMUL-` reference prefix,
  `data.status: "COMPLETED"`, a nonempty `data.id`, and a positive safe-integer
  `data.amount`. The callback itself is not authenticated. It identifies a
  single local PRASMUL payment and independently fetches the provider order;
  only `Lunas` with matching reference, QRIS method and amounts can finalize
  the payment. `data.id` is not equated with the provider order ID or stored
  as a verified transaction ID. Finalization is atomic and duplicate callbacks
  do not repeat it. If creation metadata has not yet been stored, the provider
  amount must still match `grossAmount`, and is recorded during finalization;
  a stored provider amount must match, as must QR IDs present on both sides. A
  mismatched or ambiguous reference, amount or order state
  is rejected for reconciliation; lookup failure returns 502.
  When `NODE_ENV=development` and `PRASMUL_QRIS_CALLBACK_TEST_MODE=true`,
  valid payloads return `mode: "TEST"` and `paymentProcessed: false` without
  database or provider access. Official callback authentication and other
  provider status semantics remain unverified. MongoDB must support transactions
  (replica set or sharded cluster); the known standalone transaction error
  returns 503 without finalizing payment.
- `POST /api/uploads` — authenticated multipart upload with 1-8 `images`
  files (JPEG, PNG, or WebP; up to 5 MB each). The server uploads files to
  Cloudinary and returns their HTTPS URLs.

## Admin

- `GET /api/admin/qc` — QC queue for orders.
- `PATCH /api/admin/qc/:type/:id` — `{ productId, category, answers, notes?,
  evidenceUrls? }`; stores a structured inspection assessment. If an order
  item fails QC, the entire order is cancelled, all items enter the
  seller-retrieval/return workflow, and the full product subtotal is refunded
  in GP (shipping and service fees are excluded). Saving is disabled until
  approved QC criteria are configured in `src/data/qcCriteria.ts`.
- `GET /api/admin/orders` — ADMIN-only shipment and pickup queue.
- `POST /api/admin/orders` — ADMIN-only `{ orderId, action: "SHIPPED" |
  "DELIVERED" | "READY_FOR_PICKUP" | "PICKED_UP", reference?, note? }`.
  Courier orders require QC clearance before `SHIPPED`, then `DELIVERED`.
  Pickup orders require QC clearance and physical availability at the
  selected hub before `READY_FOR_PICKUP`; after collection, `PICKED_UP`
  records the order as `DELIVERED` for buyer receipt confirmation.
- `GET /api/admin/settlements` — ADMIN-only, paginated seller payables,
  recoveries, and their auditable settlement ledger. Accepts independent
  `payablesPage` and `recoveriesPage` parameters (both default to `1`), a
  shared `pageSize` (`25` by default, maximum `100`), `payablesStatus`,
  `recoveriesStatus`, and a `search` term. Status and search filters are
  applied before pagination. Search matches seller name/email and full
  payable, recovery, order, or refund IDs. The response includes page, page
  size, total record count, and total page count for each collection; ledger
  entries accompany the records on the current pages. Historical missing
  payment amounts are returned as `null`, not inferred from settlement status.
  `financialProvenance: "REQUIRES_REVIEW"` means calculated outstanding amounts
  are unavailable; `BASELINE_RECORDED` is not a substitute for the financial
  guard's ledger integrity checks.
- `POST /api/admin/settlements` — ADMIN-only, idempotent manual transfer
  recording. Use `{ action: "PAYMENT", id, amount, reason, occurredAt,
  idempotencyKey, confirmedPaid: true, reference?, evidenceUrl? }` to record
  an actual seller transfer. Use `{ action: "OVERPAYMENT_RETURN", id, amount,
  reason, occurredAt, idempotencyKey, confirmedReceived: true, reference?,
  evidenceUrl? }` only after SwapIt has actually received the seller's manual
  return of excess funds. Use `{ action: "RECOVER", id, amount, reason,
  occurredAt, idempotencyKey, confirmedReceived: true, reference?,
  evidenceUrl? }` for a recovery after refund. Each entry records its amount,
  event date, recording ADMIN, server-recorded time, and optional uploaded
  proof. Actions are blocked by applicable active financial holds or failed
  integrity checks. Historical payables without a proven ledger baseline
  require review; amounts are not inferred. Seller payments are also blocked
  when a buyer refund entitlement or active refund exists. The existing
  `evidenceUrl` is not managed private settlement evidence.
- `GET /api/cron/seller-financial-resolution` — cron-secret protected,
  processes up to 25 due pending seller-resolution jobs. It creates recoveries
  only from ledger-backed retained payments, or places ambiguous payables on
  hold. Failures are recorded and retried after 1, 2, 4 and 8 minutes; the
  fifth failure moves the job to `FAILED_REQUIRES_ATTENTION`. `ON_HOLD` jobs
  are not retried automatically. The response includes processed, resolved,
  on-hold and failed counts; individual failures are logged and result in
  HTTP 500. Scheduling and a hold-resolution workflow are not yet configured.
- `GET /api/admin/seller-financial-resolutions` — ADMIN-only job queue.
  Supports `page`, `pageSize` (maximum 100), `status`, and a full order or
  resolution ID as `search`. Returns paginated job status, failure count,
  retry time and failure time; it does not requeue or release held jobs.
- `GET /api/admin/green-points/reserve` — ADMIN-only reserve snapshot,
  pending credits, and reserve ledger.
- `POST /api/admin/green-points/reserve` — ADMIN-only
  `{ amount, referenceKey, confirmedFunded: true, externalReference?,
  evidenceUrl?, note? }`. Only cash actually deposited may be recorded as a
  top-up. After top-up, pending GP refunds are processed before pending
  rewards.
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
record but does not collect payment. Xendit remains the configured payment
provider. Catalog products, courier choices, and Swap Hubs are currently
sourced from frontend repository data, not separate APIs.

## Green Points and refunds

- `GET /api/green-points` — returns the spendable ledger balance, recent
  entries, pending reward/refund credits, and whether redemption is covered
  by the reserve.
- Green Point credits become spendable only when backed by the funded reserve.
  Underfunded rewards are `PENDING_REWARD`; underfunded refunds are
  `PENDING_REFUND_GP` and are obligations of SwapIt, not cash refunds.
- The reserve begins at zero and tracks only actual top-ups. The target is
  Rp100.000 and the warning threshold is Rp20.000. GP pool allocation is not
  treated as reserve cash. Redemption is blocked if outstanding GP liability
  and pending refund obligations are not covered.
- Refunds are 100% in GP on product value only; shipping and service fees are
  excluded. Issued purchase rewards are reversed through the GP ledger when
  the order is refunded. Refund approval records an entitlement and queues
  GP independently of seller resolution; insufficient reserve leaves the GP
  pending. A separate seller-resolution job creates a manual recovery from
  verified ledger-backed transfers not already returned. Historical refund
  references that cannot safely be reconciled are flagged for review rather
  than issued again. A historical QC refund without an entitlement currently
  requires manual review and cannot be reused automatically.
- The original seller payable is immutable. Actual transfers and returned
  overpayments are separate settlement-ledger entries. Partial payment leaves
  the unpaid payable outstanding; an excess transfer is an outstanding
  overpayment until the seller returns it and ADMIN records the amount, date,
  and optional proof. `SETTLED` means the payable is fully paid and any
  overpayment has been returned. Overpayments are never automatically deducted
  from Green Points, other seller payables, or recognized as SwapIt revenue.
- Payable statuses are `PENDING` (no transfer yet), `PARTIALLY_SETTLED`
  (some payable remains unpaid), `OVERPAID` (the payable is paid but an excess
  transfer remains unreturned), `SETTLED`, and `CANCELLED`. Buyer payments
  continue to use Xendit QRIS; seller overpayment returns are manual transfers
  outside QRIS.

## Donations and Swap Hub devices

- `POST /api/donations` — authenticated `{ hubId, sessionId }`; `sessionId`
  must be a UUID and makes retries idempotent.
- `GET /api/donations` — returns the current user's donations, or all donations
  with donor contact details for ADMIN/INSPECTOR.
- `GET /api/donations/:id` — owner-only for donors; ADMIN/INSPECTOR may view
  any donation.
- `POST /api/hubs/access-token` — authenticated
  `{ activity: "DONATION", hubId, donationId }`; returns a short-lived,
  one-time QR token for the selected Hub.
- `POST /api/iot/scan` — Hub device only; requires `x-device-id` and
  `x-device-key` and a `{ token }` body. Consumes the QR token and moves the
  donation to `QR_SCANNED` atomically. For donation tokens only,
  `{ token, remoteUnlock: true }` instead creates a short-lived remote command
  and leaves the donation pending until the device acknowledges activation.
- `POST /api/admin/hub-scanner` — ADMIN and same-origin only; accepts
  `{ token }`, verifies it using the configured scanner device credentials
  and queues the command for that device. Never send device credentials to
  the browser.
- `GET /api/admin/hub-scanner/:id` — ADMIN only; reports the remote command
  status (`PENDING`, `CLAIMED`, `RELAY_ACTIVATED`, or `EXPIRED`). A claimed
  command without an acknowledgement has an unknown physical outcome.
- `POST /api/iot/remote-unlock` — authenticated Hub device only. `{ action:
  "CLAIM" }` atomically claims one unexpired command at most once.
  `{ action: "RELAY_ACTIVATED", sessionId }` acknowledges activation
  idempotently and advances the matching donation to `QR_SCANNED`. It does
  not assert that a door opened or an item was deposited.
- `POST /api/iot/door-event` — Hub device only; requires those same headers and
  `{ sessionId, event, occurredAt }`. The `DOOR_LOCKED` event confirms the
  physical donation and moves it to `UNDER_VERIFICATION`.
- `POST /api/donations/:id/complete` — donor-owned request that records a
  donor-reported item count (1–30) for display only. It does not change the
  donation status or award GP.
- `PATCH /api/donations/:id` — ADMIN/INSPECTOR finalization with
  `resaleQualityItems`, `upcyclingQualityItems`, `socialDonationItems`, and
  `rejectedItems` (integer counts totaling 1–30). The server calculates the
  quality-based reward and atomically saves classification history, marks the
  donation `COMPLETED`, and writes one idempotent Green Points ledger entry.
- `PATCH /api/donations/:id/cancel` — donor-owned cancellation for eligible
  `PENDING` donations.

New donations progress through `SESSION_CREATED`, `QR_SCANNED`,
`UNDER_VERIFICATION`, and `COMPLETED`. The donor-reported quantity is not used
to calculate GP. Resale, upcycling, and social-donation rewards are respectively
5,000, 3,000, and 2,000 GP per item; rejected items receive no reward.
Deposit and verification notifications use the existing `DONATION_DELIVERED`
type and are created after the corresponding state change; notification
failure does not roll back donation processing.

Hub scan and deposit confirmation, as well as admin finalization and GP ledger
insertion, use MongoDB transactions. The configured database deployment must
support transactions (replica set or sharded cluster); standalone MongoDB
causes the operation to fail without partially updating the donation.
Donations already completed by the former temporary-reward flow remain
historical completed records; they are not automatically reclassified or
rewarded again.
