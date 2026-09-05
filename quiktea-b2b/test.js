/* Smoke test for the pricing + cart maths.  Run: node test.js */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const store = {};
const ctx = {
  document: { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => (store[k] = String(v)),
  },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['products.js', 'app.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx);
const QT = ctx.QT;

assert.ok(QT.products.length > 50, 'catalogue loaded');
assert.ok(QT.products.every(p => p.img && p.retail > 0 && p.casePack > 0), 'every SKU is orderable');

// tier boundaries
assert.strictEqual(QT.tierFor(1).off, 0.40);
assert.strictEqual(QT.tierFor(4).off, 0.40);
assert.strictEqual(QT.tierFor(5).off, 0.47);
assert.strictEqual(QT.tierFor(19).off, 0.47);
assert.strictEqual(QT.tierFor(20).off, 0.55);
assert.strictEqual(QT.tierFor(999).off, 0.55);

// price falls as volume rises, never above MSRP
const p = QT.products[0];
assert.ok(QT.unitPrice(p, 20) < QT.unitPrice(p, 5) && QT.unitPrice(p, 5) < QT.unitPrice(p, 1));
assert.ok(QT.unitPrice(p, 1) < p.retail);
assert.strictEqual(QT.casePrice(p, 1), +(QT.unitPrice(p, 1) * p.casePack).toFixed(2));

// cart arithmetic
QT.cart.clear();
QT.cart.add(p.id, 5);
QT.cart.add(p.id, 1);                       // merges into one line of 6 cases
assert.strictEqual(QT.cart.cases(), 6);
let t = QT.cart.totals();
assert.strictEqual(t.lines.length, 1);
assert.strictEqual(t.lines[0].cases, 6);
assert.strictEqual(t.lines[0].unit, QT.unitPrice(p, 6));   // repriced at the 5+ tier
assert.strictEqual(t.units, 6 * p.casePack);
assert.strictEqual(t.total, +(t.subtotal + t.freight).toFixed(2));
assert.ok(t.savings > 0 && t.msrp > t.subtotal);

// freight + minimum-order rules
assert.strictEqual(t.subtotal >= QT.FREE_FREIGHT ? t.freight : t.freight, t.subtotal >= QT.FREE_FREIGHT ? 0 : QT.FREIGHT);
QT.cart.clear();
assert.strictEqual(QT.cart.totals().freight, 0, 'empty cart is never charged freight');
assert.strictEqual(QT.cart.totals().belowMin, false, 'empty cart does not trip the minimum');

const cheap = QT.products.slice().sort((a, b) => QT.casePrice(a, 1) - QT.casePrice(b, 1))[0];
QT.cart.set(cheap.id, 1);
assert.strictEqual(QT.cart.totals().belowMin, QT.cart.totals().subtotal < QT.MIN_ORDER);

// removal
QT.cart.set(cheap.id, 0);
assert.strictEqual(QT.cart.totals().lines.length, 0);

console.log('ok — ' + QT.products.length + ' SKUs, pricing/cart/freight checks pass');
