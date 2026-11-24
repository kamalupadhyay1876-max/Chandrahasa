# Commerce concurrency and recovery test matrix

Run these in a staging database with synthetic orders and Razorpay/Shiprocket sandbox credentials only. These scenarios are specifications; this file is not proof they passed.

| Scenario | Setup | Expected invariant |
|---|---|---|
| Stock contention | stock=1, concurrent 2 reservations | exactly one reservation succeeds; stock never negative |
| Duplicate captured webhook | replay same event 20 times | one ledger event and one payment state transition |
| Failure then capture | failure webhook followed by captured webhook | captured is authoritative; reconcile inventory or explicit paid exception |
| Reservation expiry | worker and capture race | no double release/consume; event recorded |
| Refund retry | same refund request key repeated | one gateway refund request/effect |
| Partial refund | two refunds sum to captured | balance cannot exceed captured amount |
| Oversized refund | request > refundable balance | rejected without gateway call |
| Gateway timeout | refund call times out | pending/unknown state; reconcile before retry |
| Shipment retry | repeat shipment job | no duplicate shipment (stable carrier/order idempotency) |
| Shipment failure | carrier API unavailable | order remains unshipped; retry/backoff and alert |
| Outbox poison event | handler fails repeatedly | dead-letter state and alert; no silent drop |
| Restore drill | restore recent backup to isolated instance | DB integrity and key workflows pass |
