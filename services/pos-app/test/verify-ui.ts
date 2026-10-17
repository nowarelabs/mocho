// UI logic verification (run with: node --no-warnings test/verify-ui.ts).
//
// Exercises the front-end-only store, auth and permission matrix the way the
// custom elements drive them: sign in, ring up a sale, match an M-Pesa receipt,
// open and close a shift, close the trading day, and confirm role gating. No
// DOM is required; the elements themselves are validated by the bundler.

import { auth, USERS } from "../src/app/auth.ts";
import { VIEWS, visibleViews } from "../src/app/nav.ts";
import { ACTIONS, ACTION_GROUPS, needsApproval, permissionFor } from "../src/app/permissions.ts";
import { store, TAX_RATE } from "../src/app/store.ts";
import { round2 } from "../src/app/util.ts";

let failures = 0;
function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const signIn = (id: string, pin: string, storeId = "sto_central"): void => {
  const error = auth.signIn(storeId, id, pin);
  if (error) throw new Error(`sign in failed: ${error}`);
};

console.log("permission matrix");
check("every action declares a known group", ACTIONS.every((a) => ACTION_GROUPS.includes(a.group)));
check("owner may do everything", ACTIONS.every((a) => permissionFor("owner", a.id).allowed));
check("manager may sell but not sync", permissionFor("manager", "sell.create").allowed && !permissionFor("manager", "sync.manage").allowed);
check("manager may not run backups", !permissionFor("manager", "backup.manage").allowed);
check("cashier may sell but not manage catalog", permissionFor("cashier", "sell.create").allowed && !permissionFor("cashier", "catalog.manage").allowed);
check("cashier may not view staff", !permissionFor("cashier", "staff.view").allowed);
check("stockkeeper may not sell", !permissionFor("stockkeeper", "sell.create").allowed);
check("stockkeeper may adjust inventory", permissionFor("stockkeeper", "inventory.manage").allowed);
check("cashier discount above the ceiling needs approval", needsApproval("cashier", "sell.discount", 10));
check("cashier discount under the ceiling needs none", !needsApproval("cashier", "sell.discount", 3));
check("every view action resolves", VIEWS.every((v) => ACTIONS.some((a) => a.id === v.action)));

console.log("sign in and view filtering");
signIn("usr_amina", "3456");
check("cashier is signed in", auth.signedIn && auth.user.id === "usr_amina");
check(
  "cashier sees only permitted views",
  visibleViews().map((v) => v.id).join(",") === "sell,sales,catalog,customers",
  visibleViews().map((v) => v.id).join(","),
);
const attempts = auth.signIn("sto_central", "usr_amina", "0000");
check("wrong pin is rejected with a message", typeof attempts === "string" && attempts.length > 0);
auth.signOut();
check("sign out clears the session", !auth.signedIn);

console.log("ringing up a sale");
signIn("usr_grace", "1234");
const product = store.products[0];
check("dataset is scoped to the store", store.dataset.storeId === "sto_central" && store.products.length > 0);
store.add(product.id);
store.add(product.id);
const lines = store.lines();
const totals = store.totals();
check("cart holds the added quantity", lines[0]?.qty === 2);
check("tax uses the product rate", totals.tax === round2(product.price * 2 * store.taxRateOf(product.id)));
const stockBefore = product.stock;
const order = store.checkout([{ method: "cash", amount: totals.total }]);
check("checkout returns an order", order != null && order.status === "paid");
check("order has a receipt number", !!order?.receiptNo);
check("stock is decremented", product.stock === stockBefore - 2);
check("cart is emptied after checkout", store.lines().length === 0);
check("lastOrder is recorded", store.lastOrder?.id === order?.id);

console.log("role gating at the store");
signIn("usr_mary", "4567");
const stockkeeperProduct = store.products[0];
store.add(stockkeeperProduct.id);
check("stockkeeper cannot add to the cart", store.qtyInCart(stockkeeperProduct.id) === 0);
check("stockkeeper checkout is refused", store.checkout([{ method: "cash", amount: 100 }]) === null);

console.log("shift cash-up");
signIn("usr_grace", "1234");
store.reset();
const shift = store.openShift(100);
check("shift opens", shift != null && shift.status === "open");
check("current shift is the open one", store.currentShift()?.id === shift?.id);
if (shift) {
  store.addCashMovement("float", 50, "Till float");
  const closed = store.closeShift(148);
  const expected = 100 + store.cashSince(shift.openedAt) + store.cashMovesFor(shift.id);
  check("shift closes", closed?.status === "closed");
  check("expected cash includes the float movement", closed?.expectedCash === round2(expected));
  check("variance is counted minus expected", closed?.variance === round2(148 - expected));
}

console.log("M-Pesa reconciliation");
signIn("usr_grace", "1234");
const before = store.unmatchedReceipts().length;
check("there are unmatched receipts", before >= 1);
const matched = store.receipts.find((r) => r.status === "unmatched" && store.matchReceipt(r.id));
check("a receipt matches a pending payment", matched != null);
check("matching a receipt reduces the unmatched count", store.unmatchedReceipts().length === before - 1);

console.log("day close");
const businessDate = store.businessDateOf(Date.now());
const closed = store.closeDay(businessDate);
check("day close records totals", closed != null && closed.businessDate === businessDate);
check("day close appears in the ledger", store.dayClose(businessDate)?.id === closed?.id);
check("closing the same day twice is refused", store.closeDay(businessDate) === null);

console.log("reset");
store.add(store.products[0].id);
store.reset();
check("reset clears transient sale state", store.lines().length === 0 && store.customerId === null);

check("known users exist", USERS.length >= 8);
check("default tax rate is 8%", TAX_RATE === 0.08);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nui verified");
