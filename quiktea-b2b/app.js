/* QuikTea B2B — shared data, pricing, cart and page chrome.
   ponytail: localStorage is the whole backend; swap QT.cart.read/write for an API when a real one exists. */
(function () {
  'use strict';

  const LOGO = 'https://quiktea.com/wp-content/uploads/2024/05/quiktea.png';

  const QT = window.QT = {
    LOGO,
    products: window.QT_PRODUCTS || [],

    /* Mock signed-in wholesale account. */
    account: {
      company: 'Hovers Retail Supply',
      buyer: 'Darshan P.',
      code: 'QT-B2B-4471',
      terms: 'Net 30',
      email: 'orders@hovers.in'
    },

    /* Volume pricing off MSRP, keyed on total cases of that line. */
    TIERS: [
      { min: 1, off: 0.40, label: '1 – 4 cases' },
      { min: 5, off: 0.47, label: '5 – 19 cases' },
      { min: 20, off: 0.55, label: '20+ cases' }
    ],
    MIN_ORDER: 250,     // USD, minimum order value
    FREIGHT: 85,        // USD flat
    FREE_FREIGHT: 1000, // USD subtotal for free freight

    money: n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),

    byId(id) { return QT.products.find(p => String(p.id) === String(id)); },

    tierFor(cases) {
      let t = QT.TIERS[0];
      for (const x of QT.TIERS) if (cases >= x.min) t = x;
      return t;
    },
    unitPrice(p, cases) { return +(p.retail * (1 - QT.tierFor(cases).off)).toFixed(2); },
    casePrice(p, cases) { return +(QT.unitPrice(p, cases) * p.casePack).toFixed(2); },
    caseMsrp(p) { return +(p.retail * p.casePack).toFixed(2); },

    /* ---------- cart: { [productId]: cases } ---------- */
    cart: {
      read() {
        try { return JSON.parse(localStorage.getItem('qt_b2b_cart')) || {}; }
        catch (e) { return {}; }
      },
      write(c) {
        try { localStorage.setItem('qt_b2b_cart', JSON.stringify(c)); } catch (e) { }
        QT.paintCount();
      },
      add(id, cases) {
        const c = QT.cart.read();
        c[id] = Math.max(0, (c[id] || 0) + (cases || 1));
        if (!c[id]) delete c[id];
        QT.cart.write(c);
      },
      set(id, cases) {
        const c = QT.cart.read();
        if (cases > 0) c[id] = cases; else delete c[id];
        QT.cart.write(c);
      },
      remove(id) { QT.cart.set(id, 0); },
      clear() { QT.cart.write({}); },
      cases() { return Object.values(QT.cart.read()).reduce((a, b) => a + b, 0); },
      lines() {
        const c = QT.cart.read();
        return Object.keys(c).map(id => {
          const p = QT.byId(id);
          if (!p) return null;
          const cases = c[id];
          return {
            p, cases,
            unit: QT.unitPrice(p, cases),
            each: QT.casePrice(p, cases),
            total: +(QT.casePrice(p, cases) * cases).toFixed(2),
            msrp: +(QT.caseMsrp(p) * cases).toFixed(2),
            units: p.casePack * cases
          };
        }).filter(Boolean);
      },
      totals() {
        const lines = QT.cart.lines();
        const subtotal = +lines.reduce((a, l) => a + l.total, 0).toFixed(2);
        const msrp = +lines.reduce((a, l) => a + l.msrp, 0).toFixed(2);
        const freight = subtotal === 0 || subtotal >= QT.FREE_FREIGHT ? 0 : QT.FREIGHT;
        return {
          lines, subtotal, msrp,
          savings: +(msrp - subtotal).toFixed(2),
          freight,
          tax: 0,
          units: lines.reduce((a, l) => a + l.units, 0),
          cases: lines.reduce((a, l) => a + l.cases, 0),
          total: +(subtotal + freight).toFixed(2),
          belowMin: subtotal > 0 && subtotal < QT.MIN_ORDER
        };
      }
    },

    /* ---------- ui helpers ---------- */
    toast(msg) {
      let t = document.getElementById('toast');
      if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(QT._tt);
      QT._tt = setTimeout(() => t.classList.remove('show'), 2400);
    },

    paintCount() {
      const n = QT.cart.cases();
      document.querySelectorAll('[data-cart-count]').forEach(el => {
        el.textContent = n;
        el.style.display = n ? '' : 'none';
      });
    },

    /* Header + footer injected once per page so six files stay in sync. */
    chrome(active) {
      const nav = [
        ['index.html', 'Home'],
        ['products.html', 'Catalogue'],
        ['quick-order.html', 'Quick order'],
        ['index.html#pricing', 'Pricing tiers'],
        ['index.html#support', 'Support']
      ];
      const a = QT.account;
      const head = document.querySelector('[data-chrome-header]');
      if (head) head.outerHTML = `
      <div class="topbar"><div class="wrap">
        <span>Wholesale portal — <b>${a.company}</b> · Account ${a.code} · Terms <b>${a.terms}</b></span>
        <span class="topbar-links"><a href="index.html#support">732-452-1300</a><a href="index.html#support">info@quiktea.com</a></span>
      </div></div>
      <header class="site"><div class="wrap">
        <a class="logo" href="index.html">
          <img src="${LOGO}" alt="QuikTea">
          <span class="b2b">Wholesale</span>
        </a>
        <button class="burger" aria-label="Menu" onclick="document.querySelector('nav.main').classList.toggle('open')">☰</button>
        <nav class="main">
          ${nav.map(([h, t]) => `<a href="${h}"${h.split('#')[0] === active ? ' aria-current="page"' : ''}>${t}</a>`).join('')}
        </nav>
        <a class="cart-btn" href="cart.html">Cart <span class="pill" data-cart-count>0</span></a>
        <div class="acct">
          <span class="av">${a.company.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
          <span><strong>${a.buyer}</strong><small>${a.company}</small></span>
        </div>
      </div></header>`;

      const foot = document.querySelector('[data-chrome-footer]');
      if (foot) foot.outerHTML = `
      <footer class="site"><div class="wrap">
        <div class="cols">
          <div>
            <img class="fimg" src="${LOGO}" alt="QuikTea">
            <p style="max-width:34ch;margin:0">Authentic chai and coffee lattes since 2001. Wholesale programme for cafés, grocers, distributors and food service.</p>
          </div>
          <div><h5>Order</h5>
            <a href="products.html">Full catalogue</a><a href="quick-order.html">Quick order by SKU</a>
            <a href="cart.html">Current cart</a><a href="index.html#pricing">Volume pricing</a></div>
          <div><h5>Account</h5>
            <a href="index.html#support">Payment terms</a><a href="index.html#support">Freight policy</a>
            <a href="index.html#support">Resale certificate</a><a href="index.html#support">Returns</a></div>
          <div><h5>Contact</h5>
            <a href="index.html#support">666 Plainsboro Road,<br>Unit 424, Plainsboro, NJ 08536</a>
            <a href="index.html#support">732-452-1300</a><a href="index.html#support">info@quiktea.com</a></div>
        </div>
        <div class="bottom">
          <span>© ${new Date().getFullYear()} QuikTea®. Wholesale portal demo — product data and imagery from quiktea.com.</span>
          <span>No live payments are processed in this environment.</span>
        </div>
      </div></footer>`;

      QT.paintCount();
    },

    /* Product card markup shared by home + catalogue. */
    card(p) {
      const cases = 1;
      return `<article class="p-card">
        <a class="p-thumb" href="product.html?id=${p.id}">
          <img src="${p.img}" alt="${QT.esc(p.name)}" loading="lazy">
          <span class="tag">${Math.round(QT.tierFor(1).off * 100)}% off MSRP</span>
        </a>
        <div class="p-body">
          <span class="p-cat">${p.cat}</span>
          <a class="p-name" href="product.html?id=${p.id}">${QT.esc(p.name)}</a>
          <div class="p-meta"><span>SKU ${p.sku}</span><span>${p.casePack} × ${p.units} ct / case</span></div>
          <div class="p-price">
            <b>${QT.money(QT.casePrice(p, cases))}</b><span class="per">/ case</span>
            <s>${QT.money(QT.caseMsrp(p))}</s>
          </div>
          <div class="p-actions">
            <button class="btn btn-primary" onclick="QT.quickAdd(${p.id})">Add case</button>
            <a class="btn btn-ghost" href="product.html?id=${p.id}">Details</a>
          </div>
        </div>
      </article>`;
    },

    quickAdd(id) {
      QT.cart.add(id, 1);
      const p = QT.byId(id);
      QT.toast(`1 case of ${p.name} added — ${QT.cart.cases()} case(s) in cart`);
    },

    esc(s) {
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    qs(k) { return new URLSearchParams(location.search).get(k); }
  };

  document.addEventListener('DOMContentLoaded', QT.paintCount);
})();
