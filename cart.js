/* ── Breadcrumb JSON-LD fix (GitHub Pages, bypasses CF-cached custom.js) ── */
(function() {
  'use strict';
  function fixBreadcrumbs() {
    var cleanUrl = window.location.href.split('?')[0].split('#')[0];
    /* 1. Patch existing Volusion BreadcrumbList JSON-LD — fill in missing names */
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function(el) {
      try {
        var data = JSON.parse(el.textContent);
        var list = data['@type'] === 'BreadcrumbList' ? data
          : (Array.isArray(data['@graph']) ? data['@graph'].find(function(n){ return n['@type']==='BreadcrumbList'; }) : null);
        if (!list || !list.itemListElement) return;
        var changed = false;
        list.itemListElement.forEach(function(item) {
          if (!item.name) {
            var url = String((item.item && (item.item['@id'] || item.item)) || '');
            var slug = url.replace(/\/$/, '').split('/').pop().replace(/[-_]/g,' ').replace(/\.htm$/,'');
            item.name = slug || 'Home';
            changed = true;
          }
        });
        if (changed) el.textContent = JSON.stringify(data);
      } catch(e) {}
    });
    /* 2. Inject our own clean breadcrumb if none already exists with data-bc="1" */
    if (document.querySelector('script[data-bc="1"]')) return;
    var bc = document.querySelector('.vCSS_breadcrumb_td');
    if (!bc) return;
    var links = Array.from(bc.querySelectorAll('a[href]'));
    if (!links.length) return;
    var items = links.map(function(link, i) {
      return {'@type':'ListItem','position':i+1,'name':link.textContent.trim()||'Home','item':link.href};
    });
    var h1text = '';
    document.querySelectorAll('h1').forEach(function(h){ if (!h1text && h.textContent.trim()) h1text = h.textContent.trim(); });
    if (h1text) items.push({'@type':'ListItem','position':items.length+1,'name':h1text,'item':cleanUrl});
    var s = document.createElement('script');
    s.type = 'application/ld+json'; s.setAttribute('data-bc','1');
    s.textContent = JSON.stringify({'@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':items});
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fixBreadcrumbs);
  else fixBreadcrumbs();
})();

/* ── Product page: enhanced cart flyout via cart.js (bypasses CF-cached custom.js) ── */
(function() {
  'use strict';
  if (window.location.pathname.toLowerCase().indexOf('shoppingcart') !== -1) return;

  /* 1. Kill Volusion's built-in push-cart immediately — it shows stale items */
  function killVolCart() {
    var v = document.getElementById('vol-push-cart');
    if (v) { v.style.cssText = 'display:none!important'; }
  }
  killVolCart();
  document.addEventListener('DOMContentLoaded', killVolCart);

  /* 2. Inject cart-list styles */
  var s = document.createElement('style');
  s.textContent =
    '#tcf-cart-list{margin:10px 0 0;border-top:1px solid rgba(255,255,255,.12);padding-top:10px;max-height:220px;overflow-y:auto}' +
    '.tcf-cl-item{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.07)}' +
    '.tcf-cl-item:last-child{border-bottom:none}' +
    '.tcf-cl-img{width:44px;height:44px;min-width:44px;background:#fff;border-radius:4px;display:flex;align-items:center;justify-content:center;overflow:hidden}' +
    '.tcf-cl-img img{width:100%;height:100%;object-fit:contain;padding:2px}' +
    '.tcf-cl-info{flex:1;min-width:0}' +
    '.tcf-cl-name{font-size:11px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.tcf-cl-meta{font-size:11px;color:rgba(255,255,255,.5);margin-top:2px}' +
    '.tcf-cl-new{font-size:10px;background:#4caf50;color:#fff;border-radius:3px;padding:1px 5px;margin-left:6px;vertical-align:middle}';
  document.head.appendChild(s);

  var _origin = window.location.origin; /* capture before DOMParser changes context */

  /* 3. Parse cart items from ShoppingCart.asp HTML */
  function parseCartHTML(html) {
    var dp = new DOMParser().parseFromString(html, 'text/html');
    var items = [];
    dp.querySelectorAll('#v65-cart-table .v65-cart-details-row').forEach(function(row) {
      var nameEl = row.querySelector('b.cart-item-name');
      var linkEl = row.querySelector('a.cart-item-name');
      var qtyEl  = row.querySelector('input[id^="Quantity"]');
      var fonts  = row.querySelectorAll('font.carttext');
      if (!nameEl || !qtyEl) return;
      var unit = 0;
      fonts.forEach(function(f) {
        if (!f.querySelector('b') && f.textContent.indexOf('$') !== -1) {
          var m = f.textContent.match(/[\d,]+\.\d{2}/);
          if (m) unit = parseFloat(m[0].replace(/,/g, ''));
        }
      });
      /* Build absolute product URL from relative href (DOMParser has no base URL) */
      var rawHref = linkEl ? (linkEl.getAttribute('href') || '') : '';
      rawHref = rawHref.replace(/&?CartID=\d+/g, '').replace(/\?$/, ''); /* strip CartID */
      var link = rawHref ? (_origin + (rawHref.charAt(0) === '/' ? '' : '/') + rawHref) : '';
      items.push({ name: nameEl.textContent.trim(), qty: qtyEl.value, unit: unit, img: '', link: link });
    });
    return items;
  }

  /* 3b. Load image key from product page for every cart item */
  function loadFlyoutImages(items) {
    items.forEach(function(item, idx) {
      if (!item.link) return;
      fetch(item.link, { credentials: 'same-origin' })
        .then(function(r) { return r.text(); })
        .then(function(html) {
          /* Extract [itemprop="image"] src — works in both attribute orders */
          var m = html.match(/itemprop=['"]image['"][^>]*src=['"]([^'"]+)['"]/i)
               || html.match(/src=['"]([^'"]+)['"]\s+[^>]*itemprop=['"]image['"]/i);
          if (!m) return;
          var imgUrl = m[1];
          if (!imgUrl || imgUrl.indexOf('nophoto') !== -1) return;
          if (imgUrl.indexOf('//') === 0) imgUrl = 'https:' + imgUrl;
          var listEl = document.getElementById('tcf-cart-list');
          if (!listEl) return;
          var imgWrap = listEl.querySelectorAll('.tcf-cl-img')[idx];
          if (!imgWrap) return;
          var img = new Image();
          img.loading = 'lazy';
          img.style.cssText = 'width:100%;height:100%;object-fit:contain;padding:2px';
          img.onload = function() { imgWrap.innerHTML = ''; imgWrap.appendChild(img); };
          img.src = imgUrl;
        }).catch(function() {});
    });
  }

  /* 4. Render cart list in flyout */
  function renderCartList(items, newName) {
    var listEl = document.getElementById('tcf-cart-list');
    if (!listEl) {
      var body = document.getElementById('tcf-body');
      if (!body) return;
      listEl = document.createElement('div');
      listEl.id = 'tcf-cart-list';
      body.appendChild(listEl);
    }
    if (!items.length) { listEl.innerHTML = ''; return; }
    listEl.innerHTML = items.map(function(it) {
      var isNew = newName && it.name.toLowerCase().indexOf(newName.toLowerCase().substring(0, 10)) !== -1;
      return '<div class="tcf-cl-item">' +
        '<div class="tcf-cl-img">' + (it.img ? '<img src="' + it.img + '" loading="lazy">' : '') + '</div>' +
        '<div class="tcf-cl-info">' +
          '<div class="tcf-cl-name">' + it.name + (isNew ? '<span class="tcf-cl-new">NEW</span>' : '') + '</div>' +
          '<div class="tcf-cl-meta">Qty ' + it.qty + (it.unit ? ' &bull; $' + it.unit.toFixed(2) : '') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* 5. Wait for our custom drawer, then wire everything */
  var attempts = 0;
  var poll = setInterval(function() {
    var drawer = document.getElementById('tcf-drawer');
    if (!drawer) { if (++attempts > 60) clearInterval(poll); return; }
    clearInterval(poll);

    var mo = new MutationObserver(function() {
      if (!drawer.classList.contains('tcf-open')) return;

      /* Fix empty product name */
      var nameEl = document.getElementById('tcf-name');
      if (nameEl && !nameEl.textContent.trim()) {
        var h1s = document.querySelectorAll('h1');
        for (var i = 0; i < h1s.length; i++) {
          var t = h1s[i].textContent.trim();
          if (t) { nameEl.textContent = t; break; }
        }
      }

      /* Fetch updated cart and show full list */
      var currentName = nameEl ? nameEl.textContent.trim() : '';
      fetch('/ShoppingCart.asp', { credentials: 'same-origin' })
        .then(function(r) { return r.text(); })
        .then(function(html) {
          var items = parseCartHTML(html);
          renderCartList(items, currentName);
          loadFlyoutImages(items);
          /* Update item count */
          var nEl = document.getElementById('tcf-n');
          if (nEl && items.length) nEl.textContent = items.length;
          var iEl = document.getElementById('tcf-items');
          if (iEl && items.length) iEl.textContent = items.length;
          /* Update total from cart subtotal */
          var subM = html.match(/class="v65-cart-subtotal-cell[^"]*"[^>]*>\s*<[^>]*>\s*\$?([\d,]+\.\d{2})/);
          if (!subM) subM = html.match(/id="v65-cart-total-estimate-cell[^"]*"[^>]*>[\s\S]*?\$([\d,]+\.\d{2})/);
          if (subM) {
            var totEl = document.getElementById('tcf-total');
            if (totEl) totEl.textContent = '$' + subM[1];
          }
        }).catch(function() {});
    });
    mo.observe(drawer, { attributes: true, attributeFilter: ['class'] });
  }, 250);
})();

(function() {
  'use strict';
  if (window.location.pathname.toLowerCase().indexOf('shoppingcart') === -1) return;
  function init() {
  var cartForm = document.querySelector('form[action="ShoppingCart.asp"]');
  if (!cartForm) return;

  /* ── Helpers ── */
  function parsePrice(txt) {
    var m = (txt || '').match(/[\d,]+\.\d{2}/);
    return m ? parseFloat(m[0].replace(/,/g, '')) : 0;
  }
  function fmtPrice(n) { return '$' + n.toFixed(2); }

  /* ── Parse cart items from hidden Volusion table ── */
  function parseItems() {
    var items = [];
    var rows = document.querySelectorAll('#v65-cart-table .v65-cart-details-row:not(.v65-divider-hr-row)');
    rows.forEach(function(row) {
      var imgEl  = row.querySelector('.v65-cart-detail-productimage img');
      var nameEl = row.querySelector('b.cart-item-name');
      var linkEl = row.querySelector('a.cart-item-name');
      var qtyEl  = row.querySelector('input[id^="Quantity"]');
      var remEl  = row.querySelector('.v65-cart-item-remove-link');
      var fonts  = row.querySelectorAll('font.carttext');
      var unitPrice = 0, lineTotal = 0;
      fonts.forEach(function(f) {
        if (!f.querySelector('b') && f.textContent.indexOf('$') !== -1) unitPrice = parsePrice(f.textContent);
        if (f.querySelector('b')) lineTotal = parsePrice(f.querySelector('b').textContent);
      });
      if (!nameEl || !qtyEl) return;
      items.push({
        name:      nameEl.textContent.trim(),
        link:      linkEl ? linkEl.href : '#',
        image:     imgEl  ? imgEl.src  : '',
        qty:       parseInt(qtyEl.value, 10) || 1,
        qtyName:   qtyEl.name,
        unitPrice: unitPrice,
        lineTotal: lineTotal || unitPrice * (parseInt(qtyEl.value, 10) || 1),
        removeHref: remEl ? remEl.getAttribute('href') : '',
        _qtyEl:    qtyEl,
        _row:      row
      });
    });
    return items;
  }

  /* ── Parse totals ── */
  function parseTotals() {
    var tax   = parsePrice((document.querySelector('.v65-cart-tax-cell b') || {}).textContent || '');
    var grand = parsePrice((document.querySelector('#v65-cart-total-estimate-cell b') || {}).textContent || '');
    var sub   = parsePrice((document.querySelector('.v65-cart-subtotal-cell b') || {}).textContent || '');
    if (!sub) sub = grand - tax;
    return { subtotal: sub, tax: tax, grand: grand };
  }

  /* ── Inject styles ── */
  var sty = document.createElement('style');
  sty.textContent = [
    '#tc-cart-wrap{display:flex;gap:24px;max-width:1200px;margin:0 auto;padding:20px 16px;font-family:Roboto,sans-serif;align-items:flex-start}',
    '#tc-cart-items{flex:1;min-width:0}',
    '#tc-cart-items h2{font-size:22px;font-weight:700;color:#1a1f2e;margin:0 0 16px;display:flex;align-items:center;gap:10px}',
    '#tc-cart-items h2 span{background:#DE1E1E;color:#fff;border-radius:20px;font-size:13px;padding:2px 10px}',
    '.tc-item{display:flex;gap:16px;align-items:flex-start;background:#fff;border:1px solid #e8eaf0;border-radius:10px;padding:16px;margin-bottom:12px;transition:box-shadow .2s}',
    '.tc-item:hover{box-shadow:0 2px 12px rgba(0,0,0,.08)}',
    '.tc-item-img{width:80px;height:80px;min-width:80px;background:#f5f6fa;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center}',
    '.tc-item-img img{width:100%;height:100%;object-fit:contain;padding:4px}',
    '.tc-item-info{flex:1;min-width:0}',
    '.tc-item-name{font-size:14px;font-weight:600;color:#1a1f2e;text-decoration:none;display:block;margin-bottom:4px;line-height:1.4}',
    '.tc-item-name:hover{color:#DE1E1E}',
    '.tc-item-unit{font-size:12px;color:#888;margin-bottom:10px}',
    '.tc-item-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
    '.tc-qty-wrap{display:flex;align-items:center;background:#f5f6fa;border-radius:6px;overflow:hidden;border:1px solid #dde0e8}',
    '.tc-qty-btn{width:30px;height:30px;border:none;background:none;font-size:18px;cursor:pointer;color:#1a1f2e;display:flex;align-items:center;justify-content:center;transition:background .15s}',
    '.tc-qty-btn:hover{background:#e8eaf0}',
    '.tc-qty-input{width:36px;height:30px;border:none;text-align:center;font-size:14px;font-weight:600;background:none;color:#1a1f2e}',
    '.tc-item-linetotal{font-size:16px;font-weight:700;color:#1a1f2e;margin-left:auto;white-space:nowrap}',
    '.tc-remove{background:none;border:none;color:#bbb;font-size:20px;cursor:pointer;padding:0 4px;line-height:1;transition:color .15s;align-self:flex-start;margin-left:8px}',
    '.tc-remove:hover{color:#DE1E1E}',
    '.tc-item.tc-removing{opacity:0;transform:translateX(30px);transition:opacity .25s,transform .25s}',
    '#tc-cart-sidebar{width:300px;min-width:280px;background:#1a1f2e;border-radius:12px;padding:24px;color:#fff;position:sticky;top:20px}',
    '#tc-cart-sidebar h3{font-size:16px;font-weight:700;color:#fff;margin:0 0 18px;letter-spacing:.04em;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:14px}',
    '.tc-summary-row{display:flex;justify-content:space-between;font-size:13px;color:rgba(255,255,255,.7);margin-bottom:10px}',
    '.tc-summary-row.tc-total{font-size:20px;font-weight:700;color:#fff;border-top:1px solid rgba(255,255,255,.15);padding-top:14px;margin-top:4px}',
    '.tc-summary-row.tc-total span:last-child{color:#e8a020}',
    '#tc-checkout-btn{display:block;width:100%;padding:14px;background:#DE1E1E;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;text-align:center;margin:18px 0 10px;letter-spacing:.02em;transition:background .15s}',
    '#tc-checkout-btn:hover{background:#c01818}',
    '#tc-continue{display:block;text-align:center;color:rgba(255,255,255,.6);font-size:13px;text-decoration:none;margin-bottom:18px;transition:color .15s}',
    '#tc-continue:hover{color:#fff}',
    '.tc-trust{border-top:1px solid rgba(255,255,255,.1);padding-top:16px;display:flex;flex-direction:column;gap:8px}',
    '.tc-trust-item{font-size:12px;color:rgba(255,255,255,.6);display:flex;align-items:center;gap:8px}',
    '.tc-trust-item svg{flex-shrink:0;opacity:.7}',
    '#tc-updating{position:fixed;bottom:20px;right:20px;background:#1a1f2e;color:#fff;font-size:13px;padding:10px 16px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:9999;opacity:0;transition:opacity .2s;pointer-events:none}',
    '#tc-updating.vis{opacity:1}',
    '#tc-empty{text-align:center;padding:60px 20px;color:#888}',
    '#tc-empty h3{font-size:20px;margin-bottom:8px;color:#1a1f2e}',
    '#tc-empty a{color:#DE1E1E;text-decoration:none;font-weight:600}',
    '@media(max-width:768px){#tc-cart-wrap{flex-direction:column}#tc-cart-sidebar{width:100%;position:static}.tc-item-linetotal{margin-left:0}}'
  ].join('');
  document.head.appendChild(sty);

  /* ── Build UI ── */
  var items = parseItems();
  var totals = parseTotals();

  /* Hide original cart content */
  var cartTable = document.getElementById('v65-cart-table');
  var cartTotal = document.getElementById('v65-cart-total-estimate');
  var checkoutSection = document.querySelector('#v65-checkout-form-table, .v65-checkout-form-table, form[name="Proceed_To_Checkout_Form"]');
  [cartTable, cartTotal].forEach(function(el) { if (el) el.style.display = 'none'; });
  /* Keep checkout form hidden but functional */
  if (checkoutSection) checkoutSection.style.display = 'none';

  /* Build wrap */
  var wrap = document.createElement('div');
  wrap.id = 'tc-cart-wrap';

  /* ── Left: items ── */
  var leftDiv = document.createElement('div');
  leftDiv.id = 'tc-cart-items';

  function renderItems() {
    leftDiv.innerHTML = '<h2>Your Cart <span>' + items.length + ' item' + (items.length !== 1 ? 's' : '') + '</span></h2>';
    if (!items.length) {
      leftDiv.innerHTML += '<div id="tc-empty"><h3>Your cart is empty</h3><p>Find the parts you need in our catalog.</p><a href="/">Shop Now &rarr;</a></div>';
      return;
    }
    items.forEach(function(item, i) {
      var card = document.createElement('div');
      card.className = 'tc-item';
      card.dataset.index = i;
      var imgSrc = (item.image && item.image.indexOf('nophoto') === -1) ? item.image : '';
      card.innerHTML =
        '<div class="tc-item-img">' + (imgSrc ? '<img src="' + imgSrc + '" alt="" loading="lazy">' : '<svg width="36" height="36" fill="none" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="#e8eaf0"/><path d="M8 8h8v8H8z" fill="#ccc"/></svg>') + '</div>' +
        '<div class="tc-item-info">' +
          '<a class="tc-item-name" href="' + item.link + '">' + item.name + '</a>' +
          '<div class="tc-item-unit">Unit price: ' + fmtPrice(item.unitPrice) + '</div>' +
          '<div class="tc-item-controls">' +
            '<div class="tc-qty-wrap">' +
              '<button class="tc-qty-btn tc-qty-minus" data-i="' + i + '">&#8722;</button>' +
              '<input class="tc-qty-input" type="number" min="1" value="' + item.qty + '" data-i="' + i + '">' +
              '<button class="tc-qty-btn tc-qty-plus" data-i="' + i + '">&#43;</button>' +
            '</div>' +
            '<div class="tc-item-linetotal" data-i="' + i + '">' + fmtPrice(item.lineTotal) + '</div>' +
          '</div>' +
        '</div>' +
        '<button class="tc-remove" data-i="' + i + '" title="Remove item">&times;</button>';
      leftDiv.appendChild(card);
    });
  }

  /* ── Right: sidebar ── */
  var sidebar = document.createElement('div');
  sidebar.id = 'tc-cart-sidebar';

  function renderSidebar() {
    var sub   = items.reduce(function(s, it) { return s + it.lineTotal; }, 0);
    var tax   = totals.tax;
    var grand = sub + tax;
    sidebar.innerHTML =
      '<h3>Order Summary</h3>' +
      '<div class="tc-summary-row"><span>Subtotal</span><span id="tc-sub">' + fmtPrice(sub) + '</span></div>' +
      '<div class="tc-summary-row"><span>Shipping</span><span style="color:rgba(255,255,255,.45);font-style:italic;font-size:12px">Calculated at checkout</span></div>' +
      '<div class="tc-summary-row"><span>Tax</span><span style="color:rgba(255,255,255,.45);font-style:italic;font-size:12px">Calculated at checkout</span></div>' +
      '<div class="tc-summary-row tc-total"><span>Total</span><span id="tc-grand">' + fmtPrice(sub) + '</span></div>' +
      '<button id="tc-checkout-btn">Proceed to Checkout &rarr;</button>' +
      '<a id="tc-continue" href="/">&#8592; Continue Shopping</a>' +
      '<div class="tc-trust">' +
        '<div class="tc-trust-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>Secure SSL Checkout</div>' +
        '<div class="tc-trust-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>Same-Day Shipping Available</div>' +
        '<div class="tc-trust-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>10 US Warehouses</div>' +
        '<div class="tc-trust-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>Est. 1979 · 3M+ Parts</div>' +
      '</div>';
  }

  /* ── Updating toast ── */
  var toast = document.createElement('div');
  toast.id = 'tc-updating';
  toast.textContent = '✓ Cart updated';
  document.body.appendChild(toast);
  var toastTimer;
  function showToast(msg) {
    toast.textContent = msg || '✓ Cart updated';
    toast.classList.add('vis');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { toast.classList.remove('vis'); }, 2000);
  }

  /* ── Update totals in sidebar ── */
  function refreshSidebarTotals() {
    var sub = items.reduce(function(s, it) { return s + it.lineTotal; }, 0);
    var subEl = document.getElementById('tc-sub');
    var grandEl = document.getElementById('tc-grand');
    if (subEl) subEl.textContent = fmtPrice(sub);
    if (grandEl) grandEl.textContent = fmtPrice(sub); /* tax calculated at checkout */
  }

  /* ── Event delegation ── */
  var qtyTimer = null;
  function handleQtyChange(idx, delta, newVal) {
    var item = items[idx];
    if (!item) return;
    var qty = newVal !== undefined ? parseInt(newVal, 10) : item.qty + delta;
    qty = Math.max(1, qty || 1);
    item.qty = qty;
    item.lineTotal = item.unitPrice * qty;
    /* Update our UI */
    var card = leftDiv.querySelector('.tc-item[data-index="' + idx + '"]');
    if (card) {
      var qtyInp = card.querySelector('.tc-qty-input');
      var ltEl   = card.querySelector('.tc-item-linetotal');
      if (qtyInp) qtyInp.value = qty;
      if (ltEl)   ltEl.textContent = fmtPrice(item.lineTotal);
    }
    /* Sync hidden Volusion qty input */
    if (item._qtyEl) { item._qtyEl.value = qty; }
    refreshSidebarTotals();
    /* Debounce server sync */
    clearTimeout(qtyTimer);
    qtyTimer = setTimeout(function() {
      showToast('Syncing...');
      var fd = new FormData(cartForm);
      fd.append('btnRecalculate.x', '1'); fd.append('btnRecalculate.y', '1');
      fetch('ShoppingCart.asp', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function(r) { return r.text(); })
        .then(function(html) {
          try {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var t = parsePrice((doc.querySelector('#v65-cart-total-estimate-cell b') || {}).textContent || '');
            if (t) { var ge = document.getElementById('tc-grand'); if (ge) ge.textContent = fmtPrice(t); }
          } catch(e) {}
          showToast('✓ Cart updated');
        }).catch(function() { showToast('✓ Cart updated'); });
    }, 700);
  }

  function handleRemove(idx) {
    var item = items[idx];
    if (!item) return;
    var card = leftDiv.querySelector('.tc-item[data-index="' + idx + '"]');
    if (card) { card.classList.add('tc-removing'); }
    setTimeout(function() {
      items.splice(idx, 1);
      renderItems();
      renderSidebar();
      wireEvents();
      showToast('Item removed');
      /* Re-index data attrs */
    }, 260);
    /* Server sync */
    if (item.removeHref) {
      fetch(item.removeHref, { credentials: 'same-origin' }).catch(function() {});
    }
  }

  function wireEvents() {
    /* Qty minus */
    leftDiv.querySelectorAll('.tc-qty-minus').forEach(function(btn) {
      btn.addEventListener('click', function() { handleQtyChange(+btn.dataset.i, -1); });
    });
    /* Qty plus */
    leftDiv.querySelectorAll('.tc-qty-plus').forEach(function(btn) {
      btn.addEventListener('click', function() { handleQtyChange(+btn.dataset.i, +1); });
    });
    /* Qty input direct */
    leftDiv.querySelectorAll('.tc-qty-input').forEach(function(inp) {
      inp.addEventListener('change', function() { handleQtyChange(+inp.dataset.i, 0, inp.value); });
    });
    /* Remove */
    leftDiv.querySelectorAll('.tc-remove').forEach(function(btn) {
      btn.addEventListener('click', function() { handleRemove(+btn.dataset.i); });
    });
  }

  /* ── Checkout button ── */
  sidebar.addEventListener('click', function(e) {
    if (e.target.id !== 'tc-checkout-btn') return;
    /* Show hidden checkout form and submit it */
    if (checkoutSection) { checkoutSection.style.display = ''; }
    var btn = checkoutSection ? checkoutSection.querySelector('input[name="btn_checkout"], input[type="submit"], button[type="submit"]') : null;
    if (btn) { btn.click(); }
    else if (checkoutSection) { checkoutSection.submit ? checkoutSection.submit() : window.location.href = '/login.asp'; }
    else { window.location.href = '/login.asp'; }
  });

  /* ── Render ── */
  renderItems();
  renderSidebar();
  wireEvents();
  wrap.appendChild(leftDiv);
  wrap.appendChild(sidebar);

  /* ── Async image loading from product pages ── */
  function loadProductImages() {
    items.forEach(function(item, idx) {
      if (!item.link || item.link === '#') return;
      fetch(item.link, {credentials: 'same-origin'})
        .then(function(r) { return r.text(); })
        .then(function(html) {
          /* Try itemprop="image" first (Volusion product page), then og:image */
          var m = html.match(/itemprop=['"]image['"][^>]*src=['"]([^'"]+)['"]/i);
          if (!m) m = html.match(/src=['"]([^'"]+)['"'][^>]*itemprop=['"]image['"]/i);
          if (!m) m = html.match(/property=['"]og:image['"][^>]*content=['"]([^'"]+)['"]/i);
          if (!m) m = html.match(/content=['"]([^'"]+)['"'][^>]*property=['"]og:image['"]/i);
          if (!m) return;
          var imgUrl = m[1];
          if (!imgUrl || imgUrl.indexOf('nophoto') !== -1) return;
          /* Ensure absolute URL */
          if (imgUrl.indexOf('//') === 0) imgUrl = 'https:' + imgUrl;
          var card = leftDiv.querySelector('.tc-item[data-index="' + idx + '"]');
          if (!card) return;
          var imgWrap = card.querySelector('.tc-item-img');
          if (!imgWrap) return;
          var img = new Image();
          img.alt = '';
          img.loading = 'lazy';
          img.onload = function() { imgWrap.innerHTML = ''; imgWrap.appendChild(img); };
          img.src = imgUrl;
        }).catch(function() {});
    });
  }
  /* Fire after a small delay so page render isn't blocked */
  setTimeout(loadProductImages, 200);

  /* Inject after page header, before original cart area */
  var insertBefore = cartTable ? cartTable.parentElement : document.querySelector('.v65-product-detail, #v65-main-wrap, .main');
  if (insertBefore && cartTable) {
    cartTable.parentElement.insertBefore(wrap, cartTable);
  } else {
    document.body.appendChild(wrap);
  }

  /* Also block Recalculate full reload on the hidden form (safety net) */
  cartForm.addEventListener('submit', function(e) { e.preventDefault(); }, false);
  } // end init()
  // Volusion's ssl.asp CORS error can stall the load event indefinitely.
  // Use DOMContentLoaded + small delay to run after Volusion's inline scripts.
  function tryInit() {
    if (document.querySelector('form[action="ShoppingCart.asp"]')) {
      init();
    } else {
      // Cart form not ready yet — retry briefly
      setTimeout(init, 300);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(tryInit, 100); });
  } else {
    setTimeout(tryInit, 50);
  }
})();


/* ── Product JSON-LD injection (fixes GSC "missing offers" critical error) ── */
(function() {
  'use strict';
  // Only run on product detail pages, not cart/checkout/category
  var path = window.location.pathname.toLowerCase();
  if (path.indexOf('shoppingcart') !== -1 || path.indexOf('checkout') !== -1) return;
  var productContainer = document.querySelector('[itemscope][itemtype*="schema.org/Product"]');
  if (!productContainer) return; // not a product page

  function getProductJsonLd() {
    var name = '';
    var nameEl = document.querySelector('h1 [itemprop="name"], [itemprop="name"]');
    if (!nameEl || !nameEl.textContent.trim()) {
      nameEl = document.querySelector('h1');
    }
    if (nameEl) name = nameEl.textContent.trim();

    var sku = '';
    var skuEl = document.querySelector('.product_code, [itemprop="sku"]');
    if (skuEl) sku = skuEl.textContent.trim();
    if (!sku) {
      var m = window.location.pathname.match(/\/([^\/]+)\.htm$/i);
      if (m) sku = m[1].replace(/-p$/, '').toUpperCase();
    }

    var price = '';
    var priceEl = document.querySelector('[itemprop="price"]');
    if (priceEl) price = priceEl.getAttribute('content') || priceEl.textContent.replace(/[^0-9.]/g,'').trim();

    var image = '';
    var imgEl = document.querySelector('[itemprop="image"]');
    if (imgEl) image = imgEl.src || imgEl.getAttribute('content') || '';

    var brand = '';
    var mfrEl = document.querySelector('[itemprop="manufacturer"]');
    if (mfrEl) brand = mfrEl.getAttribute('content') || mfrEl.textContent.trim();

    var availability = 'https://schema.org/InStock';
    var availEl = document.querySelector('[itemprop="availability"]');
    if (availEl) {
      var av = availEl.getAttribute('content') || '';
      if (/OutOfStock|out/i.test(av)) availability = 'https://schema.org/OutOfStock';
      else if (/PreOrder|pre/i.test(av)) availability = 'https://schema.org/PreOrder';
    }

    if (!name || !price) return null;

    var obj = {
      '@context': 'https://schema.org/',
      '@type': 'Product',
      'name': name,
      'offers': {
        '@type': 'Offer',
        'price': price,
        'priceCurrency': 'USD',
        'availability': availability,
        'itemCondition': 'https://schema.org/NewCondition',
        'url': window.location.href.split('?')[0]
      }
    };
    if (sku)   obj.sku = sku;
    if (image) obj.image = image;
    if (brand) obj.brand = { '@type': 'Brand', 'name': brand };

    return obj;
  }

  function inject() {
    // Don't double-inject
    if (document.querySelector('script[data-pld="1"]')) return;
    var data = getProductJsonLd();
    if (!data) return;
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.setAttribute('data-pld', '1');
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
