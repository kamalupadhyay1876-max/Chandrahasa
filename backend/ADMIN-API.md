# Admin operations API (admin role required)
- GET/POST `/api/admin/categories`
- PUT/DELETE `/api/admin/categories/:id` (deletion blocked while products use category)
- GET/PUT `/api/admin/settings` (allowlisted settings keys)
- GET `/api/admin/contacts`
- GET `/api/admin/newsletter`
- GET `/api/admin/reviews`
- DELETE `/api/admin/reviews/:id`
- PATCH `/api/admin/orders/:id/fulfillment` with shipping_provider, tracking_number, tracking_url and optional status
- GET `/api/admin/audit-log`

All API operations should be verified against the deployed runtime. Settings storage does not guarantee every existing storefront component is wired to dynamically render those settings yet.
