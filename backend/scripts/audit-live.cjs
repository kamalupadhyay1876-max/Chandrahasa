const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3120';
const OUT = '/home/ubuntu/audit-work/latest-playwright';
fs.mkdirSync(OUT, { recursive: true });
const pages = ['/', '/shop', '/product?slug=floral-silver-ring', '/heritage', '/cart', '/wishlist', '/checkout', '/search', '/compare', '/gift-cards', '/rewards', '/track-order', '/returns', '/addresses', '/help', '/support', '/contact', '/policies', '/login', '/signup', '/account', '/admin', '/admin-operations', '/admin-marketplace', '/visual-search', '/seller-portal'];
const results = [];
function record(kind, name, ok, detail=''){ results.push({kind,name,ok,detail}); console.log(`${ok?'PASS':'FAIL'} ${kind} ${name}${detail?` — ${detail}`:''}`); }
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 const api=await fetch(`${BASE}/api/products`); const productData=await api.json(); const first=productData.items?.[0];
 record('API','products endpoint',api.ok,`status=${api.status}`);
 const ctx=await browser.newContext({ignoreHTTPSErrors:true});
 for(const width of [390,1280]){
  for(const route of pages){
   const page=await ctx.newPage(); const errors=[]; const failed=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('requestfailed',r=>{if(!r.url().startsWith('data:')) failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText||''}`)});
   try{
    await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:15000});
    await page.waitForTimeout(400);
    const text=(await page.locator('body').innerText().catch(()=>''))||'';
    record('UI',`${width}px ${route} renders`,text.trim().length>30,`status=${await page.evaluate(()=>document.title)}`);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    record('UI',`${width}px ${route} no major overflow`,overflow<=24,`overflow=${overflow}px`);
    record('CONSOLE',`${width}px ${route} no page errors`,errors.length===0,errors.slice(0,2).join(' | '));
    record('NETWORK',`${width}px ${route} no failed requests`,failed.length===0,failed.slice(0,2).join(' | '));
    await page.screenshot({path:`${OUT}/${width}-${route.replace(/[^a-z0-9]+/gi,'_')||'home'}.png`,fullPage:true});
   }catch(e){record('UI',`${width}px ${route} navigation`,false,e.message)}
   await page.close();
  }
 }
 // Guest checkout using a real seeded catalog item.
 const checkout=await ctx.newPage(); const checkoutErrors=[]; checkout.on('pageerror',e=>checkoutErrors.push(e.message));
 await checkout.addInitScript(({item})=>{localStorage.setItem('ch_cart',JSON.stringify([{productId:item.id,slug:item.slug,name:item.name,price:item.price,image:(item.images||[])[0]||'/assets/img/rings.webp',huid:item.huid||'',qty:1,size:''}]))},{item:first});
 await checkout.goto(BASE+'/checkout',{waitUntil:'networkidle',timeout:20000});
 await checkout.fill('#coEmail','playwright@example.com'); await checkout.fill('#coPhone','9876543210'); await checkout.fill('#coName','Playwright Buyer'); await checkout.fill('#coLine1','42 Test Street'); await checkout.fill('#coPincode','302001'); await checkout.fill('#coCity','Jaipur'); await checkout.selectOption('#coState',{index:1}).catch(()=>{});
 const before=await checkout.textContent('#sumTotal'); record('E2E','checkout summary calculates',Boolean(before&&before.trim()),`total=${before}`);
 await checkout.click('#placeOrderBtn'); await checkout.waitForTimeout(1800);
 record('E2E','guest COD reaches success page',checkout.url().includes('/success'),checkout.url());
 record('E2E','checkout has no page errors',checkoutErrors.length===0,checkoutErrors.join(' | '));
 if(checkout.url().includes('/success')){record('E2E','success page has order id',Boolean((await checkout.textContent('#ordId').catch(()=>''))?.trim()),''); await checkout.screenshot({path:`${OUT}/checkout-success.png`,fullPage:true});}
 await checkout.close();
 // API authorization/security probes.
 const probes=[['anonymous admin',`${BASE}/api/admin/orders` ,403],['anonymous order',`${BASE}/api/orders/1`,403],['traversal',`${BASE}/../../etc/passwd`,404]];
 for(const [name,url,expected] of probes){const r=await fetch(url);record('SECURITY',name,r.status===expected,`status=${r.status}, expected=${expected}`)}
 await browser.close();
 const summary={passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results}; fs.writeFileSync(`${OUT}/summary.json`,JSON.stringify(summary,null,2)); console.log(`SUMMARY passed=${summary.passed} failed=${summary.failed}`); process.exitCode=summary.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
