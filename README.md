This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Cart API

- `GET /api/cart` returns the authenticated user's cart, item count, and server-calculated subtotal.
- `POST /api/cart` adds one available product. Body: `{ "productId": "..." }`.
- `DELETE /api/cart` removes a product. Body: `{ "productId": "..." }`.

All cart endpoints require the session cookie. A seller cannot add their own product, and each listing can only appear once in a cart.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Product API

Product management is available through these route handlers:

- `GET /api/products` lists available products. Use `search`, `categoryId`, `size`, `condition`, `sort`, `page`, and `limit` query parameters.
- `GET /api/products?mine=true` lists the authenticated user's products.
- `POST /api/products` creates a product for the authenticated user.
- `GET /api/products/:id` retrieves an available product.
- `PATCH /api/products/:id` updates a product owned by the authenticated user or an admin.
- `DELETE /api/products/:id` deactivates a product owned by the authenticated user or an admin.

Create requests must include `name`, `description`, `categoryId`, `price`, `size`, `condition`, and an `images` array. Supported conditions are `NEW`, `LIKE_NEW`, `GOOD`, and `FAIR`; supported statuses are `AVAILABLE`, `RESERVED`, `SOLD`, `INACTIVE`, `REVAMP_ELIGIBLE`, and `REVAMPED`. The session cookie created by the auth A