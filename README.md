# WooCommerce Staff POS

A staff-facing Point of Sale system that runs inside the WooCommerce admin. Cashiers get a dedicated three-panel interface — customer, product catalogue, and cart — without touching the storefront or the regular WooCommerce checkout pipeline.

## Plugin Metadata

| Field | Value |
|---|---|
| Name | WooCommerce Staff POS |
| Author | Shakeel Ahmad |
| Version | 0.1.0 |
| Text domain | `wc-staff-pos` |
| REST namespace | `wc-pos/v1` |
| Requires WooCommerce | 8.0+ |
| Requires WordPress | 6.4+ |

---

## Features

### Access & Capabilities
- Custom capability `wc_staff_pos` controls who can access the POS page (default: administrator, shop_manager)
- Custom capability `wc_staff_pos_price_override` controls who can override product prices
- Capabilities are synced from WP options on `init` — roles can be configured without code changes
- Top-level admin menu item with the store icon so cashier-only users get a proper menu entry

### Cart
- POS cart is fully isolated from the storefront cart using per-user WooCommerce session key swapping
- Add simple and variable products (attribute selectors auto-populate from product data)
- Quantity editing with debounced PATCH — only commits on blur or Enter, no API call per keystroke
- Remove individual items or clear the entire cart
- Coupon apply / remove with live feedback
- Custom price override per line item (gated by `wc_staff_pos_price_override` capability)
- Cart totals show subtotal, discount, tax, and grand total

### Product Catalogue
- Category filter chips — browse by product category
- Real-time search by product name or SKU (debounced 250 ms)
- SKU search covers both parent products and variation-level SKUs; variation hits are mapped to their parent
- Category filter is applied to both name search and variation SKU lookups
- Stock status and quantity shown on product card and detail panel
- Barcode scanner support: scanning into the search field auto-adds the product on Enter when exactly one in-stock simple product matches

### Variable Products
- Attribute dropdowns populated from product data
- Variation selection resolves price and stock status in real time
- Add-to-cart is blocked when the selected variation is out of stock

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
- Order totals are calculated and saved **before** `payment_complete()` or invoice emails are triggered
- Coupon application is validated; on failure the incomplete order is rolled back and an error is returned
- Staff notes (multi-line) are attached to the order as internal notes
- `_wc_staff_pos_source = staff_pos` meta tag on every POS order for filtering
- Cashier user ID stored on every order (`_wc_staff_pos_cashier_user_id`)

### Order History
- Recent orders tab shows the last 30 POS orders
- Displays order number, customer name, date, tender type, status badge, total
- Direct links to view or pay each order

### UX
- Auto-dismiss feedback banner (6 s timeout, manual close with accessible label)
- Coupon chip remove buttons have `aria-label="Remove coupon {code}"`
- Out-of-stock products and unsupported product types are visually badged and blocked from add-to-cart
- New Transaction button resets the entire panel state for the next sale

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
| `POST` | `/wc-pos/v1/orders` | Create order (`payment_link` or `manual_paid` mode) |
| `GET` | `/wc-pos/v1/orders` | Recent POS order history |

---

## Architecture

```
woocommerce-staff-pos.php        Plugin bootstrap, HPOS declaration
includes/
  Admin/Page.php                 Admin menu + asset enqueue
  Plugin.php                     Service wiring, capability sync, cart price hook
  Api/
    Router.php                   Registers all REST controllers
    Controller.php               Base controller (nonce + capability check)
    BootstrapController.php      Bootstrap endpoint
    ProductsController.php       Product list + detail
    CategoriesController.php     Category list
    CartController.php           Cart CRUD + coupons
    CustomersController.php      Customer search + create
    OrdersController.php         Order creation
    OrderHistoryController.php   Order history
  Domain/
    PosCartContext.php           Per-user cart session isolation
    OrderService.php             Order build logic (direct wc_create_order flow)
    Adapters/                    Interfaces + default implementations for currency,
                                 product config, and tender recording
assets/
  admin.js                       React UI (wp.element, wp.apiFetch, no build step)
  admin.css                      Admin-scoped styles
```

---

## TODO — Road to a Mature POS

The following items are planned to bring this plugin to production-ready status.

### 🔴 Critical

- [x] **Receipt printing** — Printable receipt after `manual_paid` orders with store name, items, totals, tender type, and browser print dialog
- [ ] **Offline / connectivity resilience** — Queue cart mutations locally when the REST API is unreachable and replay on reconnect
- [x] **Role management UI** — Settings page (`Staff POS → Settings`) to assign/revoke `wc_staff_pos` and `wc_staff_pos_price_override` to any role; configure tender types without code changes
- [ ] **Stock reservation** — Reserve stock when an item is added to the POS cart so concurrent sessions cannot oversell

### 🟠 High Priority

- [ ] **Split tender** — Allow a single order to be paid with multiple payment methods (e.g. part cash, part card)
- [ ] **Refunds / returns** — Initiate a WooCommerce refund from the POS order history panel
- [x] **Held / parked carts** — Save the current cart under a named slot and restore it later; dedicated "Held carts" tab shows all parked carts with restore/delete actions
- [ ] **Barcode label printing** — Print product barcodes directly from the product detail panel
- [x] **Discount by percentage or fixed amount** — Apply a cart-level percentage or fixed discount via a WooCommerce fee; discount persists across cart operations and is shown as a chip
- [ ] **Product bundles support** — Handle `woocommerce-product-bundles` composed products in the cart

### 🟡 Medium Priority

- [ ] **Shift / till management** — Open/close a cash drawer session; track expected vs actual cash at end of shift
- [ ] **Customer loyalty / notes** — Show customer lifetime value, order count, and any internal notes on the customer panel
- [ ] **Product quick-add buttons** — Pin frequently sold products to a fast-access grid that bypasses search
- [ ] **Configurable tax display** — Toggle inc/exc tax display per cashier preference
- [ ] **Order search in history** — Search and filter the order history by customer, date range, or tender type
- [ ] **End-of-day sales report** — Summary of POS orders for the current day (count, total, breakdown by tender type)

### 🟢 Polish & Infrastructure

- [ ] **Build pipeline** — Introduce a lightweight bundler (esbuild or wp-scripts) to enable JSX, tree-shaking, and source maps
- [ ] **Unit tests** — PHPUnit coverage for `OrderService`, `PosCartContext`, and capability sync
- [ ] **E2E tests** — Playwright smoke tests against a WooCommerce test instance
- [ ] **Automated capability migration** — On plugin update, migrate old option keys to new schema without data loss
- [ ] **Settings page** — Admin UI for tender types, default order status, receipt template, and capability assignment
- [ ] **Multisite compatibility** — Verify session isolation and capability sync work correctly on network-activated multisite
- [ ] **WPCS / PHPStan** — Add CI linting with WordPress Coding Standards and static analysis
