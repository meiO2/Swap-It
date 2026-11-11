# Swap-It

Swap-It is a full-stack circular-fashion marketplace for buying, selling,
swapping, repairing, and donating clothing. The application combines a
marketplace, Swap Hubs, Green Points, delivery, payment, donation tracking,
community messaging, and Revamp! upcycled merchandise in one Next.js app.

## Product capabilities

### Marketplace

- Browse available preloved products.
- Search and filter by category, size, condition, and price.
- View product details and seller information.
- Create, edit, archive, and manage listings.
- Upload product images and QC evidence to Cloudinary.
- Add products to a persistent cart.
- Prevent a seller from buying their own listing.
- Reserve one-unit listings during checkout.

### Checkout and orders

- Courier delivery or Swap Hub pickup.
- Server-side subtotal, shipping, Green Point, and total calculation.
- Mock courier rates for local development.
- Optional Biteship rates for real courier integration.
- Order status lifecycle:
  `PENDING_PAYMENT`, `PAID`, `PROCESSING`, `SHIPPED`, `DELIVERED`,
  `COMPLETED`, `CANCELLED`, `EXPIRED`, and `REFUNDED`.
- Pending orders can be cancelled and reserved products are released.
- Pickup orders store a snapshot of the selected Hub.

### Payments

- Midtrans Snap compatibility.
- Custom payment-method selection UI.
- Midtrans Core API support for:
  - BCA, BNI, BRI, Mandiri, and Permata Virtual Account
  - QRIS
  - GoPay
  - ShopeePay
  - Credit/debit card tokenization
  - Indomaret
  - Alfamart
- Payment status polling and webhook verification.
- Idempotent payment updates.
- Failed or expired payments release products and refund redeemed Green
  Points.

Payment methods still depend on the merchant account configuration and
availability in Midtrans Sandbox or Production.

### Green Points

Green Points are stored in a signed ledger rather than only in frontend state.

- Registration and email verification reward: 2,000 GP.
- Existing-user registration backfill for administrators.
- Donation quality rewards after admin verification: 5,000 GP per resale
  item, 3,000 GP per upcycling item, and 2,000 GP per social-donation item.
  Rejected items earn 0 GP.
- Purchase reward: 2% of the eligible subtotal.
- GP redemption at checkout using a slider.
- Maximum redemption is limited by the available balance and product subtotal.
- Shipping cannot be paid with GP.
- Redemption uses a negative `REDEEM` ledger entry.
- Cancellation and failed-payment refunds use idempotent `REFUND` entries.
- Ledger entries expire after 12 months.

The ledger supports `EARN`, `REDEEM`, `REFUND`, `EXPIRE`, `ADJUSTMENT`, and
`REVERSAL` transaction types.

### Swap Hubs and donations

- Swap Hub catalog with map coordinates, distance, address, and opening hours.
- Donation flow:
  secure Hub QR scan, physical door-event confirmation, admin item
  classification, and final GP award.
- Donation records are stored in MongoDB.
- Donation GP is awarded once through the Green Points ledger after
  verification; donor-reported item counts do not determine rewards.
- Admin review includes pending verification, completed history, and
  incomplete sessions; classification history is retained.
- The backend requires MongoDB transactions for atomic Hub confirmation and
  finalization, so production MongoDB must support transactions (replica set
  or sharded cluster).
- The ESP32 sketch remains a serial prototype: it still targets a legacy
  verification path and does not yet send authenticated door events. A device
  must be provisioned with its Hub credentials and send `/api/iot/scan` and
  `/api/iot/door-event` requests to use the physical workflow.

### Community and sustainability

- Authenticated user registration, login, logout, OTP verification, and
  password recovery.
- Saved delivery addresses.
- Persistent conversations and messages.
- Repair shop directory.
- Swap News.
- Revamp! upcycled merchandise.
- Admin panels for quality control, donation GP, news, and Revamp merchandise.

## Technology

- Next.js 16 App Router
- React 19
- TypeScript 5
- MongoDB with Mongoose
- Tailwind CSS 4
- Zustand for legacy/local UI state and persisted Hub session state
- Midtrans Snap and Core API
- Biteship shipping API
- Resend email delivery
- Leaflet and React Leaflet for maps
- QRCode.react for QR rendering
- Framer Motion for UI animation

## Repository structure

```text
src/
  app/
    (routes)/             Public homepage and route pages
    api/                  Next.js route handlers
    admin/                Admin dashboard and management pages
    checkout/             Cart checkout and delivery selection
    chat/                 Conversation list and chat threads
    donate/               Swap Hub donation flow
    orders/               Order list and order detail
    payment/              Custom payment-method UI
    products/             Marketplace listing pages
    revamp/               Revamp! merchandise pages
  components/             Reusable UI, layout, map, chat, and order components
  data/mock.ts            Frontend demo catalog and seed source
  lib/                    Database, auth, payment, shipping, GP, and API helpers
  models/                 Mongoose schemas
  store/                  Zustand stores
```

## Getting started

### Requirements

- Node.js compatible with the installed Next.js version.
- npm.
- MongoDB database.
- Midtrans account for payment testing.
- Optional Biteship account for real shipping rates.
- Optional Resend account for verification email delivery.

### Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Available scripts:

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Environment variables

Create a local `.env` file. Never commit real credentials.

```env
MONGODB_URI=mongodb://...
OTP_SECRET=...

MIDTRANS_SERVER_KEY=...
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=...
MIDTRANS_IS_PRODUCTION=false
NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION=false

SHIPPING_MODE=mock
BITESHIP_API_KEY=...
BITESHIP_BASE_URL=https://api.biteship.com
BITESHIP_ORIGIN_POSTAL_CODE=15339

RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

### Environment notes

- `MONGODB_URI` is required for database-backed features.
- `OTP_SECRET` signs email-verification OTP data.
- `MIDTRANS_SERVER_KEY` is server-only and must never be exposed to the
  browser.
- `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` is used only for browser-side card
  tokenization.
- `MIDTRANS_IS_PRODUCTION=false` uses Midtrans Sandbox.
- `SHIPPING_MODE=mock` is the default development mode.
- Set `SHIPPING_MODE=biteship` to use Biteship.
- Biteship API keys must remain server-side.
- Resend variables are required when verification email delivery is enabled.
- Cloudinary variables are required for image and QC-evidence uploads. Keep
  `CLOUDINARY_API_SECRET` server-side; uploaded files are stored in the
  `swapit` Cloudinary folder.

## Mock data and database seeding

The demo data in [src/data/mock.ts](./src/data/mock.ts) is also used as a
database seed source. It is not the active source after seeding.

When public data is requested, the application:

1. Connects to MongoDB.
2. Inserts each missing mock record with an idempotent upsert.
3. Reads the active records from MongoDB.
4. Preserves existing database records and does not overwrite them.

Seeded collections include:

- Marketplace products.
- Revamp merchandise.
- Swap Hubs.
- Swap News.
- Repair shops.
- Chat summaries.
- Authenticated-user conversations and initial mock messages.

The seed helper is [src/lib/mock-seed.ts](./src/lib/mock-seed.ts). Mock users
created for chat demonstrations use disabled-purpose local seed credentials
and are not substitutes for real authenticated users.

## Main pages

| Page | Purpose |
| --- | --- |
| `/` | Marketplace homepage |
| `/products` | Product catalog |
| `/products/[id]` | Product detail |
| `/sell` | Create a listing |
| `/cart` | Persistent cart |
| `/checkout` | Delivery, GP slider, and order creation |
| `/payment` | Custom payment-method selection |
| `/payment/result` | Payment status |
| `/orders` | Order history |
| `/orders/[id]` | Order detail and cancellation |
| `/swap` | Swipe-style product discovery |
| `/donate` | Donation introduction |
| `/donate/hub/qr` | Donation Hub QR |
| `/donate/hub/insert` | Item insertion |
| `/donate/hub/confirm` | Donation confirmation |
| `/donate/hub/done` | Donation completion and GP result |
| `/revamp/shop` | Revamp! merchandise |
| `/repair` | Repair shop directory |
| `/map` | Swap Hub and location map |
| `/chat` | Conversations |
| `/wallet` | Green Point wallet and ledger |
| `/profile` | Profile and balance |
| `/payments` | Payment history |

## API reference

All authenticated endpoints require the application session cookie unless
stated otherwise.

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/verify-otp`
- `POST /api/auth/resend-otp`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

### Products, cart, and orders

- `GET /api/products`
  - Query parameters include `search`, `categoryId`, `size`, `condition`,
    `sort`, `page`, `limit`, and `mine`.
- `POST /api/products`
- `GET /api/products/:id`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`
- `POST /api/uploads`
- `GET /api/cart`
- `POST /api/cart`
- `DELETE /api/cart`
- `POST /api/orders`
- `GET /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders/:id/cancel`

The order endpoint never trusts frontend prices. It recalculates products,
shipping, GP redemption, and total amount from server-side data.

### Payments

- `POST /api/payments`
  - Snap fallback body: `{ "orderId": "..." }`
  - Custom Core API body: `{ "orderId": "...", "paymentMethod": "qris" }`
- `GET /api/payments`
- `POST /api/payments/webhook`

Supported custom payment method identifiers:

```text
bca_va
bni_va
bri_va
mandiri_va
permata_va
qris
gopay
shopeepay
credit_card
indomaret
alfamart
```

### Green Points

- `GET /api/green-points`
- `POST /api/admin/green-points/backfill-registration`

The backfill endpoint is admin-only and idempotent.

### Hubs, donations, and public content

- `GET /api/hubs`
- `GET /api/repair-shops`
- `GET /api/chat-summaries`
- `POST /api/donations`
- `GET /api/donations`
- `GET /api/donations/:id`
- `PATCH /api/donations/:id` (ADMIN/INSPECTOR final classification)
- `POST /api/donations/:id/complete` (records donor-reported item count only;
  it does not mark the donation complete or award GP)
- `PATCH /api/donations/:id/cancel`
- `POST /api/hubs/access-token`
- `POST /api/iot/scan` (Hub device authentication required)
- `POST /api/iot/door-event` (Hub device authentication required)
- `GET /api/news`
- `GET /api/revamp`
- `POST /api/shipping/rates`

### Messaging and profile

- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages`
- `GET /api/profile`
- `PATCH /api/profile`
- `GET /api/profile/addresses`
- `POST /api/profile/addresses`
- `PATCH /api/profile/addresses/:id`
- `DELETE /api/profile/addresses/:id`

## Shipping behavior

With `SHIPPING_MODE=mock`, the shipping service returns local development
rates such as JNE REG, SiCepat REG, and J&T EZ.

With `SHIPPING_MODE=biteship`, rates are requested server-side from Biteship.
The checkout sends the selected courier code, but the order route recalculates
the rate before saving the order.

## Payment lifecycle

1. Checkout creates a pending order.
2. Product records are reserved and the cart is cleared.
3. GP redemption is written to the ledger.
4. The user selects a payment method.
5. Midtrans receives the server-calculated total.
6. Midtrans webhook or status polling updates the payment.
7. Paid orders award the purchase GP reward.
8. Failed, cancelled, or expired payments release products and refund GP.

Payment item details include products, shipping, service fees, and GP
discounts so the Midtrans gross amount remains consistent.

## Security and operational notes

- Keep `.env` out of version control.
- Rotate credentials if they are ever exposed.
- Never send `MIDTRANS_SERVER_KEY`, Biteship keys, MongoDB credentials, or
  OTP secrets to the client.
- Treat frontend prices and GP values as untrusted input.
- Payment webhooks verify the Midtrans SHA-512 signature and amount.
- Ledger `referenceKey` values provide idempotency for rewards, redemption,
  and refunds.
- Local uploads under `public/uploads` are suitable for development, not
  production serverless hosting.

## Validation

Run the focused checks while developing:

```bash
npm run lint
npm run build
```

The repository may contain legacy type errors outside the feature being
changed. Always inspect the exact file and route involved when a full
repository type check reports an error.
