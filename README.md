# WooCommerce Staff POS

A staff-facing Point of Sale system that runs inside the WooCommerce admin. Cashiers get a dedicated three-panel interface — customer, product catalogue, and cart — without touching the storefront or the regular WooCommerce checkout pipeline.

## Plugin Metadata

| Field | Value |
|---|---|
| Name | WooCommerce Staff POS |
| Author | Shakeel Ahmad |
| Version | 0.2.0 |
| Text domain | `wc-staff-pos` |
| REST namespace | `wc-pos/v1` |
| Requires WooCommerce | 8.0+ |
| Requires WordPress | 6.4+ |

---

## Implementation Status

| Feature | Status |
|---|---|
| Access & capabilities | ✅ Done |
| Product catalogue with search & category filter | ✅ Done |
| Variable product support | ✅ Done |
| Barcode scanner (auto-add on Enter) | ✅ Done |
| POS cart (isolated from storefront) | ✅ Done |
| Coupon apply / remove | ✅ Done |
| Cart-level discount (% or fixed) | ✅ Done |
| Custom price override per line item | ✅ Done |
| Customer search & create | ✅ Done |
| Guest / walk-in mode | ✅ Done |
| Order creation (payment link, invoice, mark paid) | ✅ Done |
| Receipt printing after manual payment | ✅ Done |
| Held / parked carts | ✅ Done |
| Order history with search & filters | ✅ Done |
| Refunds from order history | ✅ Done |
| Daily sales report | ✅ Done |
| Settings page (roles, tender types) | ✅ Done |
| Offline / connectivity resilience | ⬜ Planned |
| Stock reservation | ⬜ Planned |
| Split tender | ⬜ Planned |
| Barcode label printing | ⬜ Planned |
| Product bundles support | ⬜ Planned |
| Shift / till management | ⬜ Planned |
| Customer loyalty & notes | ⬜ Planned |
| Product quick-add grid | ⬜ Planned |
| Email receipt after payment | ⬜ Planned |
| Order editing | ⬜ Planned |

---

## Features

### Access & Capabilities

- Custom capability `wc_staff_pos` controls who can access the POS page (default: administrator, shop_manager)
- Custom capability `wc_staff_pos_price_override` controls who can override product prices
- Capabilities are synced from WP options on `init` — roles can be configured without code changes
- Top-level admin menu item with the store icon so cashier-only users get a proper menu entry

### Settings Page

- **Staff POS → Settings** — admin-only settings page built on the WP Settings API
- Assign / revoke `wc_staff_pos` access to any registered role via checkboxes
- Assign / revoke `wc_staff_pos_price_override` to any role
- Configure tender types (value + label pairs) without code changes; dynamic editor uses DOM APIs (no innerHTML)

### Product Catalogue

- Category filter chips — browse by product category
- Real-time search by product name or SKU (debounced 250 ms)
- SKU search covers both parent products and variation-level SKUs; variation hits are mapped to their parent
- Category filter applied to both name search and variation SKU lookups
- Stock status and quantity shown on product card and detail panel
- Out-of-stock and unsupported product types are visually badged and blocked from add-to-cart
- **Barcode scanner support** — scanning into the search field auto-adds the product on Enter when exactly one in-stock simple product matches

### Variable Products

- Attribute dropdowns populated from product data
- Variation selection resolves price and stock status in real time
- Add-to-cart is blocked when the selected variation is out of stock

### Cart

- POS cart is fully isolated from the storefront cart using per-user WooCommerce session key swapping
- Add simple and variable products (attribute selectors auto-populate from product data)
- Quantity editing — only commits on blur or Enter, no API call per keystroke
- Remove individual items or clear the entire cart
- Coupon apply / remove with live feedback
- **Cart-level discount** — apply a percentage or fixed-amount discount via a WooCommerce fee; discount chip persists across cart operations
- **Custom price override** per line item (gated by `wc_staff_pos_price_override` capability)
- Cart totals show subtotal, discount, tax, and grand total

### Held / Parked Carts

- "Hold cart" button saves the current cart under a named slot (prompt for name; defaults to timestamp)
- Held carts tab lists all parked carts with item count, total, and save time
- Restore replaces the active cart and removes the slot
- Per-user limit of 10 held carts; oldest slot evicted when the cap is exceeded
- Stored in user meta — persists across page reloads and browser sessions

### Customers

- Search by name, email, or phone across existing WooCommerce customers
- Create a new customer directly from the POS and auto-select them
- Guest / walk-in mode for cash sales without a customer account
- Billing details (name, email, phone) editable inline; edited values always take precedence over the linked account

### Order Creation

| Mode | Behaviour |
|---|---|
| **Create order** | Creates a pending order and copies the payment link |
| **Send payment link** | Creates a pending order and emails the WooCommerce invoice to the customer |
| **Mark paid** | Creates a completed order using the selected tender type (cash, card, cheque, …) |

- Orders are created directly via `wc_create_order` + `add_product`, bypassing the WooCommerce checkout validation pipeline
- HPOS-compatible: uses `$order->get_edit_order_url()` for edit links
- Order totals calculated and saved **before** `payment_complete()` or invoice emails are triggered
- Coupon application validated; on failure the incomplete order is rolled back and an error returned
- Staff notes (multi-line) attached to the order as internal notes
- `_wc_staff_pos_source = staff_pos` meta on every POS order for filtering
- Cashier user ID stored on every order (`_wc_staff_pos_cashier_user_id`)

### Receipt Printing

- Printable receipt generated for every `manual_paid` order
- Shows store name, order number, date, cashier, customer name, line items, subtotal, discount, tax, total, and tender type
- "Print receipt" triggers `window.print()` — print CSS hides all WP admin chrome and POS panels except the receipt
- "Show / Hide receipt" toggle on the order result card

### Order History

- Recent orders tab — up to 50 POS orders, newest first
- **Search & filter bar**:
  - Client-side text search by customer name, email, or order number
  - Status filter (all / completed / processing / pending / refunded)
  - Tender type filter
  - Date-from / date-to pickers (server-side)
- Displays order number, customer name, date, tender type, status badge, total
- Direct links to view or pay each order

### Refunds

- "Refund" button on completed / processing orders in history
- Inline refund form — amount pre-filled with order total, reason field optional
- Issues a WooCommerce refund via `wc_create_refund()`; clamps to remaining refundable balance
- Order status updates immediately in the history list after success

### Daily Sales Report

- "Daily report" tab — date picker defaults to today
- Summary cards: order count and total revenue (paid orders only)
- Breakdown by payment method (count + total per tender type)
- Breakdown by cashier (shown only when more than one cashier appears in the data)

### UX

- Auto-dismiss feedback banner (6 s timeout, manual close with accessible label)
- Coupon chip remove buttons have `aria-label="Remove coupon {code}"`
- Out-of-stock products and unsupported product types are visually badged and blocked from add-to-cart
- "New Transaction" button resets the entire panel state for the next sale
- Ref-counted busy map prevents async race conditions when multiple requests are in flight

---

## REST API

All endpoints require the `wc_staff_pos` capability and a valid nonce (`X-WP-Nonce`).

| Method | Path | Description |
|---|---|---|
| `GET` | `/wc-pos/v1/bootstrap` | Current user, capabilities, cart snapshot, tender types |
| `GET` | `/wc-pos/v1/products` | Product list (`q`, `category`, `limit` params) |
| `GET` | `/wc-pos/v1/products/{id}` | Product detail with attributes and variations |
| `GET` | `/wc-pos/v1/categories` | Published product categories |
| `GET` | `/wc-pos/v1/customers` | Customer search (`q` param) |
| `POST` | `/wc-pos/v1/customers` | Create customer |
| `GET` | `/wc-pos/v1/cart` | Current POS cart snapshot |
| `POST` | `/wc-pos/v1/cart/items` | Add item to POS cart |
| `PATCH` | `/wc-pos/v1/cart/items/{key}` | Update item quantity |
| `DELETE` | `/wc-pos/v1/cart/items/{key}` | Remove item |
| `DELETE` | `/wc-pos/v1/cart` | Clear entire cart |
| `POST` | `/wc-pos/v1/cart/coupons` | Apply coupon |
| `DELETE` | `/wc-pos/v1/cart/coupons/{code}` | Remove coupon |
| `POST` | `/wc-pos/v1/cart/discount` | Apply cart-level discount (`percent` or `fixed`) |
| `DELETE` | `/wc-pos/v1/cart/discount` | Remove cart discount |
| `GET` | `/wc-pos/v1/held-carts` | List held (parked) carts |
| `POST` | `/wc-pos/v1/held-carts` | Save current cart as a held slot |
| `POST` | `/wc-pos/v1/held-carts/{id}/restore` | Restore a held cart into the active session |
| `DELETE` | `/wc-pos/v1/held-carts/{id}` | Delete a held cart slot |
| `POST` | `/wc-pos/v1/orders` | Create order (`payment_link` or `manual_paid` mode) |
| `GET` | `/wc-pos/v1/orders` | POS order history (`status`, `tender_type`, `date_from`, `date_to`, `limit` params) |
| `POST` | `/wc-pos/v1/orders/{id}/refund` | Issue a partial or full refund on a POS order |
| `GET` | `/wc-pos/v1/reports/daily` | Daily sales summary (`date` param, defaults to today) |

---

## Architecture

```text
woocommerce-staff-pos.php        Plugin bootstrap, HPOS declaration
includes/
  Admin/Page.php                 Admin menu + asset enqueue
  Admin/SettingsPage.php         Settings page (roles, tender types)
  Plugin.php                     Service wiring, capability sync, cart price hook
  Api/
    Router.php                   Registers all REST controllers
    Controller.php               Base controller (nonce + capability check)
    BootstrapController.php      Bootstrap endpoint
    ProductsController.php       Product list + detail
    CategoriesController.php     Category list
    CartController.php           Cart CRUD + coupons
    CartDiscountController.php   Cart-level discount (percent / fixed)
    HeldCartsController.php      Park and restore carts
    CustomersController.php      Customer search + create
    OrdersController.php         Order creation
    OrderHistoryController.php   Order history (status / date / tender filters)
    RefundsController.php        Issue refunds on POS orders
    ReportsController.php        Daily sales summary
  Domain/
    PosCartContext.php           Per-user cart session isolation + held carts + discount
    OrderService.php             Order build logic (direct wc_create_order flow)
    Adapters/                    Interfaces + default implementations for currency,
                                 product config, and tender recording
assets/
  admin.js                       React UI (wp.element, wp.apiFetch, no build step)
  admin.css                      Admin-scoped styles
```

---

## TODO — Road to a Mature POS

### 🔴 Critical

- [x] **Receipt printing** — Printable receipt after `manual_paid` orders with store name, items, totals, tender type, and browser print dialog
- [x] **Role management UI** — Settings page (`Staff POS → Settings`) to assign/revoke capabilities per role; configure tender types without code changes
- [ ] **Offline / connectivity resilience** — Queue cart mutations locally when the REST API is unreachable and replay on reconnect
- [ ] **Stock reservation** — Reserve stock when an item is added to the POS cart so concurrent sessions cannot oversell

### 🟠 High Priority

- [x] **Held / parked carts** — Save the current cart under a named slot and restore it later; "Held carts" tab with restore/delete actions
- [x] **Discount by percentage or fixed amount** — Cart-level percentage or fixed discount via a WooCommerce fee; shown as a removable chip
- [x] **Refunds / returns** — Initiate a WooCommerce refund from the POS order history panel with amount and reason
- [ ] **Email receipt after payment** — Send a formatted receipt email to the customer immediately after `manual_paid` (separate from the WooCommerce invoice)
- [ ] **Split tender** — Allow a single order to be paid with multiple payment methods (e.g. part cash, part card)
- [ ] **Order editing** — Edit line items, quantities, and discounts on pending orders directly from the POS without opening WC admin
- [ ] **Gift card support** — Redeem WooCommerce-compatible gift cards at checkout (e.g. `woocommerce-gift-cards` plugin)
- [ ] **Barcode label printing** — Print product barcodes directly from the product detail panel
- [ ] **Product bundles support** — Handle `woocommerce-product-bundles` composed products in the cart

### 🟡 Medium Priority

- [x] **Order search in history** — Filter by customer name/email, status, tender type, and date range
- [x] **End-of-day sales report** — Daily summary (order count, revenue, breakdown by tender type and cashier)
- [ ] **Shift / till management** — Open/close a cash drawer session; track expected vs actual cash at end of shift
- [ ] **Customer loyalty / notes** — Show customer lifetime value, order count, and internal notes on the customer panel
- [ ] **Product quick-add grid** — Pin frequently sold products to a fast-access grid that bypasses search
- [ ] **Low stock alerts** — Real-time warning in the cart when a line item quantity meets or exceeds available stock
- [ ] **Configurable tax display** — Toggle inc/exc tax display per cashier preference
- [ ] **Keyboard shortcuts** — Power-user bindings: `/` to focus product search, `Enter` to add selected product, `Esc` to deselect
- [ ] **Paginated order history** — "Load more" pagination instead of a hard row limit
- [ ] **Export sales report** — Download daily or date-range report as CSV

### 🟢 Polish & Infrastructure

- [x] **Settings page** — Admin UI for tender types and capability assignment
- [ ] **Build pipeline** — Introduce a lightweight bundler (esbuild or wp-scripts) to enable JSX, tree-shaking, and source maps
- [ ] **Unit tests** — PHPUnit coverage for `OrderService`, `PosCartContext`, and capability sync
- [ ] **E2E tests** — Playwright smoke tests against a WooCommerce test instance
- [ ] **Automated capability migration** — On plugin update, migrate old option keys to new schema without data loss
- [ ] **Multi-terminal tracking** — Tag each order with a configured terminal/register ID for multi-lane stores
- [ ] **Multisite compatibility** — Verify session isolation and capability sync work correctly on network-activated multisite
- [ ] **WPCS / PHPStan** — Add CI linting with WordPress Coding Standards and static analysis
