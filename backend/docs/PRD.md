# Chandrahasa Storefront PRD (working draft)

## Purpose
A mobile-first jewellery storefront where shoppers can discover pieces, compare accurate product information, add to cart, place orders, and receive order updates. The admin can manage products, stock and fulfilment.

## Principles
1. Product facts are SKU-specific and verified.
2. Prices, discounts and stock are computed server-side.
3. No fake social proof, unsupported promises, or deceptive interface.
4. Lightweight performance for entry-level Android phones and slower networks.
5. Clear recovery states, keyboard access and reduced-motion support.

## MVP journeys
Browse/search/filter -> product details -> size/quantity -> cart -> address -> payment or COD (when configured) -> order status. Customer account, password recovery and admin operations remain separate journeys.

## Launch blockers
Production payment gateway verification/webhooks; secure order authorization; COD ownership/validation; contact/business identity; accurate product/material/hallmark data; policy review; backup/restore; deployment configuration; real-browser end-to-end testing.
