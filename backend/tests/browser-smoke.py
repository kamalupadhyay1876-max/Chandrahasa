#!/usr/bin/env python3
"""Sandbox Playwright smoke checks for static UI rendering.
Run: python tests/browser-smoke.py
This does not test the live API or checkout/payment integration.
"""
from pathlib import Path
import re, sys, os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
PAGES = ['index.html', 'product.html', 'login.html', 'heritage.html']
passed, failed = [], []

def check(label, condition, detail=''):
    (passed if condition else failed).append(label + ((' — ' + detail) if detail else ''))

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
    browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox'])
    for width in (390, 1280):
        for file in PAGES:
            page = browser.new_page(viewport={'width': width, 'height': 850})
            html = (PUBLIC / file).read_text(encoding='utf-8')
            errors = []
            handler = lambda err: errors.append(str(err))
            page.on('pageerror', handler)
            page.set_content(html, wait_until='domcontentloaded')
            for href in re.findall(r'<link[^>]+href=["\']([^"\']+\.css)["\']', html):
                rel = href.lstrip('/')
                if (PUBLIC / rel).exists(): page.add_style_tag(content=(PUBLIC / rel).read_text(encoding='utf-8'))
            for src in re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html):
                rel = src.lstrip('/')
                if (PUBLIC / rel).exists():
                    try: page.add_script_tag(content=(PUBLIC / rel).read_text(encoding='utf-8'))
                    except Exception as e: errors.append('script injection: '+str(e))
            page.wait_for_timeout(80)
            check(f'{width}px {file}: document renders', len(page.locator('body').inner_text().strip()) > 80)
            # CSS overflow can occur for 3D canvas; use a generous threshold and report only major overflow.
            overflow = page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            check(f'{width}px {file}: no major horizontal overflow', overflow <= 24, f'overflow={overflow}px')
            if file in ('index.html','shop.html','product.html','checkout.html','login.html','signup.html'):
                check(f'{width}px {file}: no uncaught page errors', not errors, '; '.join(errors[:2]))
            if file == 'heritage.html':
                check(f'{width}px heritage: WebGL failure fallback', page.locator('.heritage-3d-fallback').count() == 1)
            page.remove_listener('pageerror', handler)
            page.close()
    browser.close()
print(f'Browser smoke: {len(passed)} passed, {len(failed)} failed')
for item in passed: print('PASS', item)
for item in failed: print('FAIL', item)
sys.exit(1 if failed else 0)
