/* Safety: this script creates fictional demo customers, orders and reviews. Never run it in production. */
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo records in production. Import real catalogue data through the admin workflow.');
  process.exit(1);
}

'use strict';
/* Chandrahasa — Database seed. Idempotent: wipes & recreates catalog when run.
   Usage: node seed.js            (reseed catalog, keep users/orders)
          node seed.js --fresh    (also drop demo orders/users first)  */

const crypto = require('crypto');
if (process.env.NODE_ENV === 'production' || process.env.ALLOW_SEED !== '1') { console.error('Seed blocked. Set ALLOW_SEED=1 explicitly for a non-production environment. Never seed production.'); process.exit(1); }
const db = require('./db');

const scrypt = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const mkUser = (name, email, phone, password, role) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = scrypt(password, salt);
  db.prepare('INSERT INTO users (name,email,phone,password_hash,salt,role) VALUES (?,?,?,?,?,?)')
    .run(name, email.toLowerCase(), phone, hash, salt, role);
  return db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()).id;
};

const IMG = '/assets/img/';
const categories = [
  ['Rings', 'rings', IMG + 'rings.webp', 1],
  ['Necklaces', 'necklaces', IMG + 'necklaces.webp', 2],
  ['Earrings', 'earrings', IMG + 'earrings.webp', 3],
  ['Pendants', 'pendants', IMG + 'pendants.jpg', 4],
  ['Bracelets', 'bracelets', IMG + 'bracelets.webp', 5],
  ['Gift Sets', 'gift-sets', IMG + 'giftsets.jpg', 6],
];

const products = [
  // slug, name, category, price, compare, images[], huid, weight, stock, rating, reviews, badge, artisan, desc, story
  ['floral-silver-ring', 'Floral Silver Ring', 'rings', 1299, 1899, ['rings.webp'], 'H284193', '4.2 g', 34, 4.8, 124, 'NEW', 'Ramesh Prajapat · Jaipur',
   'A delicate hand-filed floral band in 925 sterling silver, finished with a mirror polish that catches candlelight like dew.',
   'Ramesh ji has been filing floral motifs in Jaipur’s Johari Bazaar for 19 years — this rosette is cut entirely by hand with a graver his father left him.'],
  ['diamond-cut-silver-ring', 'Diamond-cut Silver Ring', 'rings', 1599, 2200, ['diamond-cut-ring.jpg'], 'H391207', '5.1 g', 21, 4.7, 98, 'SALE', 'Mahesh Soni · Jaipur',
   'Precision diamond-cut facets across the band — a quiet fire that works from boardroom to baraat.',
   'Mahesh ji cuts every facet under a jeweller’s loupe, not a machine — forty-two separate angled strikes per ring.'],
  ['triple-band-silver-ring', 'Triple Band Silver Ring', 'rings', 1499, null, ['triple-band-ring.jpg'], 'H175542', '6.3 g', 40, 4.9, 195, 'TOP RATED', 'Ramesh Prajapat · Jaipur',
   'Three hand-soldered bands, each polished separately then united — our most-reviewed ring for a reason.',
   'The three bands are soldered in sequence over a charcoal block, quenched, and re-polished between every stage.'],
  ['filigree-drop-earrings', 'Filigree Drop Earrings', 'earrings', 2199, 2999, ['earrings.webp'], 'H402981', '3.8 g', 28, 4.8, 87, 'STAFF PICK', 'Kamala Devi · Nathdwara',
   'Micro-filigree teardrops, each wire rolled and curled by hand in the Nathdwara tradition.',
   'Kamala ji trained at the temple-town workshops of Nathdwara; each drop takes four days of wire work.'],
  ['pearl-silver-earrings', 'Pearl & Silver Earrings', 'earrings', 1799, 2400, ['pearl-earrings.jpg'], 'H558310', '4.4 g', 25, 4.6, 76, 'NEW', 'Kamala Devi · Nathdwara',
   'Freshwater pearls cradled in hand-formed 925 silver cups — evening light, bottled.',
   'Each pearl is hand-matched in size and overtone before being set in Kamala ji’s claw cups.'],
  ['layered-chain-necklace', 'Layered Chain Necklace', 'necklaces', 2799, 3800, ['layered-chain.jpg'], 'H610274', '8.9 g', 18, 4.7, 55, 'NEW', 'Imran Sheikh · Jaipur',
   'Three lengths, one clasp — a cascading layered chain that needs no second thought when you dress.',
   'Imran ji builds each chain link-by-link, then welds and re-links so layers fall exactly as intended.'],
  ['classic-silver-necklace', 'Classic Silver Necklace', 'necklaces', 2099, 2800, ['classic-necklace.jpg'], 'H733915', '12.5 g', 31, 4.8, 142, 'NEW', 'Imran Sheikh · Jaipur',
   'The everyday heirloom — a substantial herringbone weave with a hidden box clasp.',
   'Our best-loved everyday chain: herringbone-woven, hand-finished, and built to outlast trends.'],
  ['heart-pendant', 'Heart Pendant', 'pendants', 999, 1499, ['heart-pendant.jpg'], 'H120987', '2.6 g', 52, 4.9, 201, 'HOT', 'Sita Rathore · Jodhpur',
   'A plump, hand-raised heart on a weekend-proof chain. The gift that always lands.',
   'Sita ji raises each heart from a single silver disc — hammered, annealed, re-shaped until the curve is perfect.'],
  ['om-pendant-necklace', 'Om Pendant Necklace', 'pendants', 1199, null, ['om-pendant.jpg'], 'H847621', '3.1 g', 44, 4.8, 278, 'MOST LOVED', 'Sita Rathore · Jodhpur',
   'A serene Om, hand-finished with antique oxidation — quiet meaning for every day.',
   'Cast from a master mould Sita ji keeps from her grandfather, then antique-finished by hand.'],
  ['temple-bloom-pendant', 'Temple Bloom Pendant', 'pendants', 1499, 1999, ['pendants.jpg'], 'H466182', '3.6 g', 22, 4.7, 63, 'NEW', 'Ramesh Prajapat · Jaipur',
   'A temple-gopuram lotus, hand-cast and oxidised to bring out its seven-petal architecture.',
   'Inspired by the gopurams of Rajasthan’s stepwells — cast, oxidised, then hand-buffed on the petals only.'],
  ['silver-kada-bracelet', 'Silver Kada Bracelet', 'bracelets', 3499, 4500, ['bracelets.webp'], 'H294758', '18.2 g', 15, 4.9, 63, 'NEW', 'Mahaveer Singh · Udaipur',
   'A solid hand-forged kada with softened edges — substantial, smooth, and quietly ceremonial.',
   'Mahaveer ji forged this profile for the royal households of Mewar; each kada is hammered from a single ingot.'],
  ['oxidised-silver-bangle', 'Oxidised Silver Bangle', 'bracelets', 2499, null, ['bangle.jpg'], 'H589104', '15.7 g', 38, 4.8, 312, '#1 BEST SELLER', 'Mahaveer Singh · Udaipur',
   'Deep antique oxidation over hand-chased patterns — the bangle that started Chandrahasa.',
   'The piece that made our name in 2004: chased, oxidised, and polished by the same hands for two decades.'],
  ['bridal-heritage-gift-set', 'Bridal Heritage Gift Set', 'gift-sets', 5999, 8500, ['giftsets.jpg'], 'H710293', '24.5 g', 12, 5.0, 28, 'LIMITED', 'Chandrahasa Atelier',
   'Kada, drops and a pendant-layered chain — the full ceremony, gift-wrapped in our heritage box.',
   'Assembled by the atelier: each set is inspected twice and hallmarked as a single heirloom.'],
  ['chandrahasa-heritage-set', 'Chandrahasa Heritage Set', 'gift-sets', 4499, 6000, ['giftsets.jpg'], 'H681745', '21.0 g', 9, 4.8, 41, 'NEW', 'Chandrahasa Atelier',
   'Our signature trio — filigree ring, kada and drop earrings — the young collector’s first heirloom.',
   'Our most-gifted trio, curated from three workshops across Rajasthan and finished at the atelier.'],
];

const coupons = [
  ['SILVER20', 'percentage', 20, 999, 10000],
  ['WELCOME10', 'percentage', 10, 499, 5000],
  ['HERITAGE500', 'fixed', 500, 2999, 500],
];

function run() {
  const tx = db.transaction(() => {
    if (process.argv.includes('--fresh')) {
      db.prepare('DELETE FROM orders').run();   // cascades order_items
      db.prepare('DELETE FROM users').run();    // orders.user_id would be SET NULL anyway
    }
    db.prepare('DELETE FROM products').run();    // cascades reviews, cart_items, wishlists; SET NULLs order_items
    db.prepare('DELETE FROM coupons').run();
    db.prepare('DELETE FROM categories').run();

    const insCat = db.prepare('INSERT INTO categories (name, slug, image, sort_order) VALUES (?,?,?,?)');
    for (const c of categories) insCat.run(...c);

    const insProd = db.prepare(`INSERT INTO products
      (slug,name,category_slug,description,price,compare_price,images,huid,purity,weight,stock,rating,review_count,badge,artisan,artisan_story,is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`);
    for (const p of products) {
      const [slug, name, category, price, compare, imgs, huid, weight, stock, rating, rc, badge, artisan, desc, story] = p;
      insProd.run(slug, name, category, desc, price, compare, JSON.stringify(imgs.map(i => IMG + i)), huid, '925 Sterling Silver', weight, stock, rating, rc, badge, artisan, story);
    }

    const insCoupon = db.prepare('INSERT INTO coupons (code, type, value, min_order, usage_limit) VALUES (?,?,?,?,?)');
    for (const c of coupons) insCoupon.run(...c);

    // Users (always ensure they exist)
    const getUser = db.prepare('SELECT id FROM users WHERE email = ?');
    let adminId = getUser.get('admin@chandrahasa.com')?.id;
    if (!adminId) adminId = mkUser('Chandrahasa Admin', 'admin@chandrahasa.com', '+91 90000 00001', 'Admin@123', 'admin');
    let demoId = getUser.get('demo@chandrahasa.com')?.id;
    if (!demoId) {
      demoId = mkUser('Priya Demo', 'demo@chandrahasa.com', '+91 90000 00002', 'Demo@123', 'customer');
      // ~3 weeks of plausible order history so the workshop ledger feels lived-in.
      const history = [
        // daysAgo, items [[slug, qty]], coupon, status, method, paid, hoursAgoOffset
        [0,  [['om-pendant-necklace', 1]],                 'SILVER20', 'confirmed', 'razorpay', 1, 4],
        [0,  [['heart-pendant', 2]],                       null,       'pending',   'cod',      0, 7],
        [1,  [['oxidised-silver-bangle', 1], ['heart-pendant', 1]], null, 'shipped', 'razorpay', 1, 2],
        [2,  [['floral-silver-ring', 1]],                  'WELCOME10','delivered', 'razorpay', 1, 8],
        [3,  [['layered-chain-necklace', 1]],              null,       'delivered', 'razorpay', 1, 3],
        [4,  [['pearl-silver-earrings', 1]],               'SILVER20', 'delivered', 'upi',      1, 9],
        [5,  [['chandrahasa-heritage-set', 1]],            null,       'delivered', 'razorpay', 1, 6],
        [6,  [['triple-band-silver-ring', 1], ['floral-silver-ring', 1]], null, 'delivered', 'razorpay', 1, 1],
        [7,  [['classic-silver-necklace', 1]],             null,       'delivered', 'cod',      1, 10],
        [9,  [['silver-kada-bracelet', 1]],                null,       'delivered', 'razorpay', 1, 5],
        [11, [['om-pendant-necklace', 1], ['diamond-cut-silver-ring', 1]], 'SILVER20', 'delivered', 'razorpay', 1, 6],
        [13, [['bridal-heritage-gift-set', 1]],            null,       'delivered', 'razorpay', 1, 4],
        [15, [['heart-pendant', 1]],                       'WELCOME10','returned',  'razorpay', 1, 2],
        [19, [['filigree-drop-earrings', 1]],              null,       'delivered', 'razorpay', 1, 9],
      ];
      const findP = db.prepare('SELECT id, name, price, huid, images FROM products WHERE slug = ?');
      const insOrder = db.prepare(`INSERT INTO orders
        (user_id,email,phone,subtotal,discount,shipping,total,coupon_code,status,payment_method,payment_status,payment_id,address,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now', '-' || ? || ' days', '-' || ? || ' hours'))`);
      const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, image, price, qty, size, huid) VALUES (?,?,?,?,?,?,?,?)');
      const buyers = ['Meera Iyer','Kavya Nair','Sunita Kapoor','Rohit Menon','Ishita Verma','Ananya Rao','Divya Pillai','Nikhil Chowdary','Sneha Kulkarni','Arjun Malhotra'];
      history.forEach(([days, items, coupon, status, method, paid, hr], i) => {
        const rows = items.map(([slug, qty]) => { const p = findP.get(slug); return { ...p, qty }; }).filter(r => r.id);
        if (!rows.length) return;
        const subtotal = rows.reduce((s, r) => s + r.price * r.qty, 0);
        let discount = 0;
        if (coupon === 'SILVER20') discount = Math.min(Math.floor(subtotal * 0.2), 10000);
        else if (coupon === 'WELCOME10') discount = Math.min(Math.floor(subtotal * 0.1), 5000);
        const shipping = (subtotal - discount) >= 999 ? 0 : 79;
        const total = subtotal - discount + shipping;
        const buyer = buyers[i % buyers.length];
        const email = buyer.split(' ')[0].toLowerCase() + '.' + buyer.split(' ')[1].toLowerCase().replace(/[^a-z]/g, '') + '@example.com';
        const orderId = insOrder.run(
          i % 3 === 0 ? demoId : null, email, '+91 98' + String(10000000 + i * 137913).slice(0, 8),
          subtotal, discount, shipping, total, coupon,
          status, method, paid ? 'paid' : 'created',
          paid ? 'pay_SEED' + String(1000 + i) : null,
          JSON.stringify({ name: buyer, line1: (i + 3) + ', ' + ['Johari Bazaar','M.I. Road','C-Scheme','Bani Park'][i % 4], city: 'Jaipur', state: 'Rajasthan', pincode: '30200' + (i % 9 + 1) }),
          days, hr
        ).lastInsertRowid;
        for (const r of rows) {
          let img = ''; try { img = JSON.parse(r.images)[0] || ''; } catch {}
          insItem.run(orderId, r.id, r.name, img, r.price, r.qty, '', r.huid);
        }
      });
      // The original flagship demo order stays too (most recent delivered).
      const kada = db.prepare('SELECT id, price FROM products WHERE slug = ?').get('oxidised-silver-bangle');
      const heart = db.prepare('SELECT id, price FROM products WHERE slug = ?').get('heart-pendant');
      const orderId = db.prepare(`INSERT INTO orders
        (user_id,email,phone,subtotal,discount,shipping,total,coupon_code,status,payment_method,payment_status,payment_id,address)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          demoId, 'demo@chandrahasa.com', '+91 90000 00002',
          kada.price + heart.price, 0, 0, kada.price + heart.price, null,
          'delivered', 'razorpay', 'paid', 'pay_DEMO0001',
          JSON.stringify({ name: 'Priya Demo', line1: '12, Johari Bazaar', city: 'Jaipur', state: 'Rajasthan', pincode: '302003' })
        ).lastInsertRowid;
      insItem.run(orderId, kada.id, 'Oxidised Silver Bangle', IMG + 'bangle.jpg', kada.price, 1, '', 'H589104');
      insItem.run(orderId, heart.id, 'Heart Pendant', IMG + 'heart-pendant.jpg', heart.price, 1, '', 'H120987');
      db.prepare('INSERT INTO reviews (product_id, user_id, author, rating, title, body) VALUES (?,?,?,?,?,?)')
        .run(kada.id, demoId, 'Priya Sharma', 5, 'Heirloom quality', 'The bangle looks even better in person — deep oxidation and flawless finish. Fast delivery too.');

      const extra = [
        ['oxidised-silver-bangle', 'Meera Iyer', 5, 'Heirloom in the making', 'Wore it to a wedding — endless compliments. The oxidation depth is unmatched and the HUID card felt official.'],
        ['oxidised-silver-bangle', 'Sunita Kapoor', 5, 'Everyday kada, forever', 'Substantial yet comfortable. Verified the HUID on BIS Care before wearing — all good.'],
        ['floral-silver-ring', 'Kavya Nair', 5, 'Delicate and precise', 'The floral filing is even finer in person. Sizing was spot on and shipping was fast.'],
        ['heart-pendant', 'Ananya Rao', 4, 'Beautiful gift', 'Two-day delivery with a maker’s card. The chain could be a touch longer, but the pendant is divine.'],
        ['om-pendant-necklace', 'Rohit Menon', 5, 'Quietly powerful', 'The oxidation sits perfectly in the engraving. Strangers ask about it often.'],
        ['triple-band-silver-ring', 'Ishita Verma', 5, 'My third Chandrahasa piece', 'They keep getting better. The triple band stacks beautifully with my solitaire.'],
      ];
      const findProd = db.prepare('SELECT id FROM products WHERE slug = ?');
      const insRev = db.prepare('INSERT INTO reviews (product_id, user_id, author, rating, title, body) VALUES (?, NULL, ?, ?, ?, ?)');
      for (const [s, author, rating, title, body] of extra) {
        const p = findProd.get(s);
        if (p) insRev.run(p.id, author, rating, title, body);
      }
    }

    const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
    console.log(`Seed complete — ${categories.length} categories, ${count} products, ${coupons.length} coupons.`);
    console.log('Admin  → admin@chandrahasa.com / Admin@123');
    console.log('Demo   → demo@chandrahasa.com / Demo@123');
  });
  tx();
}

run();
