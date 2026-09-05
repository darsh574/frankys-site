# QuikTea B2B ordering portal

Static wholesale-ordering front end built from the live quiktea.com catalogue.
Plain HTML/CSS/JS, no build step, no backend, **no real payment gateway** — the
checkout runs a scripted gateway handshake and writes the order to
`localStorage`.

Self-contained and unrelated to the rest of this repo (frankys.site).

## Run

```
cd quiktea-b2b
python -m http.server 8099
# open http://localhost:8099/index.html
```

A server is needed only for clean relative paths — `products.js` is a plain
script, not a `fetch`, so opening `index.html` from the file system works too.

## Pages

| File | What it is |
|---|---|
| `index.html` | Home — hero, best sellers, categories, volume-tier table, support |
| `products.html` | Catalogue — category/pack/price filters, search, sort (`?cat=` deep link) |
| `product.html` | Product detail (`?id=`) — case pricing, live tier repricing, related items |
| `quick-order.html` | Quick order by SKU — multi-row sheet, add all to cart |
| `cart.html` | Cart — case quantities, tier savings, freight, minimum-order gate |
| `checkout.html` | Business details, delivery, payment gateway UI (card / ACH / Net 30) |
| `order.html` | Order confirmation + printable receipt |

Shared: `styles.css`, `app.js` (pricing, cart, header/footer), `products.js`
(87 SKUs generated from the quiktea.com store API), `test.js`.

## Commercial rules

- Everything is sold by the **case**; case pack derives from unit count
  (4/6/12/24 units per case).
- Tier discount off MSRP, per line: **1–4 cases 40 %**, **5–19 cases 47 %**,
  **20+ cases 55 %**.
- Minimum order value **$250** (checkout is blocked below it).
- Freight **$85** flat, free over **$1,000**. Sales tax $0 — resale exempt.

Change these in one place: the `TIERS`, `MIN_ORDER`, `FREIGHT` and
`FREE_FREIGHT` constants at the top of `app.js`.

## Payment

The three methods are interface only. Card input formats and validates
(brand detection, MM/YY expiry in the future, CVC length); ACH checks a 9-digit
routing number and the debit authorisation; Net 30 requires a PO number. On
submit a staged overlay simulates the gateway round-trip, then redirects to the
confirmation. Nothing is transmitted and no card data is stored.

To wire a real PSP, replace the `stages`/`step()` block in `checkout.html`
with the provider's client SDK call and keep the same order object.

## Test

```
node test.js
```

Covers tier boundaries, case pricing, cart merge/remove, freight and the
order minimum.

## Data

`products.js` was generated from `https://quiktea.com/wp-json/wc/store/v1/products`.
Product images are hot-linked from quiktea.com. To refresh the catalogue,
re-pull that endpoint and regenerate the file.
