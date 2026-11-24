from pathlib import Path
import json, subprocess, sys
root=Path(__file__).parent
checks=[]
def check(name, ok): checks.append((name,bool(ok)))
# syntax-check every project JS file
js=list((root/'frontend').rglob('*.js'))+list((root/'backend').rglob('*.js'))
syntax_ok=True
for f in js:
    r=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
    if r.returncode:
        syntax_ok=False
        print(r.stderr)
check(f'JavaScript syntax ({len(js)} files)',syntax_ok)
config=json.loads((root/'frontend/vercel.json').read_text())
check('Vercel clean URLs enabled',config.get('cleanUrls') is True)
check('Vercel API function exists', (root/'frontend/api/[...path].js').is_file())
proxy=(root/'frontend/api/[...path].js').read_text()
check('API proxy requires configured backend origin', 'CHANDRAHASA_API_URL' in proxy)
store=(root/'frontend/js/store.js').read_text()
check('Search form submits full results', "globalSearchForm" in store and "'/shop?search='" in store)
check('Search exposes errors', 'Search is temporarily unavailable.' in store)
shop=(root/'frontend/js/shop.js').read_text()
check('Shop reads search URL parameter', "params.get('search')" in shop)
check('Shop sends stock/sale filters to API', "q.set('inStock', '1')" in shop and "q.set('sale', '1')" in shop)
server=(root/'backend/server.js').read_text()
check('Backend search includes category names', 'category_slug IN (SELECT slug FROM categories WHERE name LIKE ?)' in server)
check('Backend applies server-side stock/sale filters', "if (inStock) where += ' AND stock > 0'" in server and "if (saleOnly) where += ' AND compare_price IS NOT NULL AND compare_price > price'" in server)
feature_map=(root/'CHANDRAHASA-200-COMPONENT-FEATURE-MAP.md').read_text()
check('200 feature inventory present', sum(1 for l in feature_map.splitlines() if l[:3].isdigit() and l[3:5]=='. ')==200)
product_js=(root/'frontend/js/product.js').read_text()
check('Product Q&A mounts after product data loads', 'await mountProductQuestions();' in product_js and 'if(!state.product || document.querySelector' in product_js)
check('Review content is rendered as text, not raw HTML', 'author.textContent=String(r.author' in product_js and 'body.textContent=String(r.body' in product_js)
check('Owner Hinglish credential guide exists', (root/'OWNER-SETUP-HINGLISH.md').is_file())
check('Windows owner readiness checker exists', (root/'deploy/OWNER-CHECK-WINDOWS.cmd').is_file())

check('Seller KYC signed webhook and event deduplication exist', '/api/marketplace/kyc/webhook' in server and 'SELLER_KYC_WEBHOOK_SECRET' in server and 'seller_provider_events' in server)
check('Razorpay Route payout release has explicit feature gate', "RAZORPAY_ROUTE_ENABLED!=='true'" in server and '/api/admin/marketplace/suborders/release' in server)
check('Seller order split and warehouse inventory schema exist', all(x in (root/'backend/db.js').read_text() for x in ['seller_suborders','seller_warehouses','warehouse_inventory','inventory_movements']))
check('GST/TCS ledger and monthly report endpoints exist', all(x in server for x in ['/api/admin/marketplace/tax-settings','/api/admin/marketplace/tax-report.csv','marketplace_tax_adjustments']))
check('Authenticated WebSocket chat is implemented', "url.pathname!=='/ws/chat'" in server and "server.on('upgrade'" in server and 'wsBroadcast' in server)
check('Admin marketplace dashboard includes tax and sub-order panels', 'taxSettings' in (root/'frontend/admin-marketplace.html').read_text() and 'suborders' in (root/'frontend/admin-marketplace.html').read_text())

check('Seller CSV/JSON bulk catalogue import validates and reports rows', all(x in server for x in ['/api/seller/catalog/bulk','/api/seller/catalog/template.csv','seller_bulk_jobs','parseCsvRows']))
check('Seller carrier credentials are encrypted and isolated per seller', all(x in server for x in ['seller_carrier_accounts','aes-256-gcm','/api/seller/carriers/shiprocket','decryptSellerSecret']))
check('Seller-specific shipment, AWB, label and tracking APIs exist', all(x in server for x in ['shipment\\/awb','shipment\\/label','shipment\\/track','seller_shipments','/shipping-options']))
check('Seller performance metrics cover dispatch, seller-attributed cancellation/defect and response', all(x in server for x in ['lateDispatchRate','cancellationRate','defectRate','responseRate','averageResponseMinutes','seller_quality_events']))
check('Seller policy rules support warning, payout hold, listing pause and suspension', all(x in server for x in ['seller_policy_rules','payout_hold','pause_listings','seller-policy/run']))
check('Admin can attribute defects and seller-caused cancellations to exact sub-orders', '/api/admin/marketplace/quality-event' in server and 'data-quality-suborder' in (root/'frontend/admin-marketplace.html').read_text())
check('Shiprocket serviceability quotes are seller-account and warehouse specific', '/shipping-options' in server and 'courier/serviceability/' in server and 'data-rates-seller' in (root/'frontend/js/advanced-commerce.js').read_text())
check('Admin seller policy console and scorecards exist', all(x in (root/'frontend/admin-marketplace.html').read_text() for x in ['sellerPolicy','sellerPerformanceAdmin','runSellerPolicy']))
check('Seller portal includes bulk import, independent shipping and performance', all(x in (root/'frontend/js/advanced-commerce.js').read_text() for x in ['sellerBulkUpload','sellerCarrierState','sellerPerformance','data-create-shipment']))
check('Customer can ask seller and view persisted seller replies', all(x in (root/'frontend/js/product.js').read_text() for x in ['Ask the artisan / seller','/api/seller/inquiries']) and '/api/customer/seller-inquiries' in (root/'frontend/js/account.js').read_text())
check('Seller dispatch SLA deadline is stamped at checkout and backfilled', 'dispatch_due_at' in server and 'dispatch_due_at=datetime(created_at' in (root/'backend/db.js').read_text())
check('Seller carrier credential key documented for Railway setup', 'SELLER_CARRIER_ENCRYPTION_KEY' in (root/'backend/.env.example').read_text() and (root/'SELLER-MARKETPLACE-COMPLETE-UPGRADE-2026-11-24.md').is_file())


check('Automatic payout is disabled by default in environment template', 'AUTO_ROUTE_PAYOUTS=false' in (root/'backend/.env.example').read_text())
check('Owner test and deploy checklist exists', (root/'OWNER-TEST-AND-DEPLOY-CHECKLIST-HINGLISH.md').is_file())
check('Retryable Razorpay webhook processing is implemented', all(x in server for x in ["status='processed'","status='failed'",'processing_started_at','Webhook processing failed']))
check('Notification outbox uses HTTPS HMAC, retries and admin controls', all(x in server for x in ['dispatchNotificationOutbox','NOTIFICATION_WEBHOOK_URL','NOTIFICATION_WEBHOOK_SECRET','X-Chandrahasa-Signature','/api/admin/notifications/outbox']))
check('Order state machine blocks invalid lifecycle and unpaid online shipping', 'ORDER_TRANSITIONS' in server and 'Online payment must be captured before fulfilment' in server)
check('Order inventory and seller ledger transitions are transactional', 'const applyTransition=db.transaction' in server and 'Seller warehouse fulfilment mismatch; delivery update rolled back.' in server)
check('Return lifecycle enforces approval and reconciled refund', 'Invalid return transition' in server and 'Full captured online payment must be reconciled' in server)
check('Cancelled order stock is released once and late payment does not resurrect it', 'admin_cancelled' in server and 'payment_captured_after_cancellation' in server)
check('COD collection is auditable and supports seller manual settlement', '/api/admin/payments/cod/collect' in server and 'codCleared' in server and 'manual_bank_transfer' in server and "ord.payment_method!=='razorpay'" in server)
check('Return workflow enforces state transitions and COD refund reference', 'Invalid return transition' in server and 'manual_bank_transfer' in server)
check('Production Node engine matches native dependency requirements', json.loads((root/'backend/package.json').read_text()).get('engines',{}).get('node')=='>=20')
schema_check=subprocess.run([sys.executable,str(root/'backend/tests/schema-check.py')],capture_output=True,text=True)
check('SQLite schema and additive migration smoke test',schema_check.returncode==0)

for n,ok in checks: print(('PASS' if ok else 'FAIL')+' — '+n)
print(f'RESULT: {sum(ok for _,ok in checks)}/{len(checks)} passed')
sys.exit(0 if all(ok for _,ok in checks) else 1)

