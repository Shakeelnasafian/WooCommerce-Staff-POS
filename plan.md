# `plan.md` — WooCommerce Staff POS Implementation Roadmap

## Summary
Current baseline already covers: isolated POS cart, product search/configuration, customer search/create, coupon support, pending orders with payment links, and manual-paid orders.

This roadmap turns the plugin into a commercial, online-first, single-location POS product. Implement modules in the order below. Do not skip earlier foundation modules, because later POS workflow depends on them.

## Implementation Order

### Module 1. Plugin Foundation and Architecture
**Goal:** make the codebase extensible before adding more POS behavior.

**Changes**
- Introduce clear layers for application services, domain services, infrastructure adapters, and REST controllers.
- Add settings service, logger interface, audit-event interface, and shared response/validation helpers.
- Add plugin lifecycle structure: activation defaults, upgrade routine entrypoint, uninstall policy, versioned migrations.
- Add `composer.json`, coding standards, static analysis config, PHPUnit bootstrap, and CI skeleton.

**Done when**
- New services can be registered without growing `Plugin.php` into a god object.
- There is a repeatable local test/lint command set.
- Upgrades can be versioned from the current `0.1.x` state.

### Module 2. Roles, Capabilities, and Settings
**Goal:** replace the single `manage_woocommerce` gate with real POS permissions and configuration.

**Changes**
- Add roles/capabilities: `wc_pos_cashier`, `wc_pos_manager`, `wc_pos_admin`.
- Add settings for receipt branding, barcode field priority, default tender options, customer requirement rule, debug logging, and POS app behavior.
- Add settings bootstrap endpoint consumed by the frontend.
- Restrict admin-only functions from cashier-only actions.

**Public API / types**
- New settings payload in bootstrap.
- Capability map returned to the POS app.

**Done when**
- A cashier can use POS without full WooCommerce admin power.
- A manager/admin can configure POS behavior without editing code.

### Module 3. Dedicated POS App Shell
**Goal:** move from a simple wp-admin page to a focused full-screen POS app.

**Changes**
- Replace the current one-file admin UI with a structured POS shell: header, product pane, cart pane, customer pane, session status, dialogs.
- Keep WordPress-hosted delivery, but use a dedicated POS page layout optimized for cashier workflow.
- Add app bootstrap loading, error states, reconnect states, and keyboard-friendly interactions.

**Done when**
- The POS works as a dedicated cashier interface rather than a generic admin form page.
- UI state is modular enough for later register, held-cart, and receipt flows.

### Module 4. Register and Shift Management
**Goal:** add the core POS concept missing today: a cashier must operate inside an open register/shift.

**Changes**
- Add domain entities/services for `Register` and `Shift`.
- Add endpoints for register status, open shift, close shift, and current session summary.
- Store opening cash, closing cash, expected cash, cashier, open/close timestamps, and notes.
- Block checkout actions when no register is open.

**Public API / types**
- `register/status`
- `register/open`
- `register/close`
- `shift-summary`

**Done when**
- A cashier must open a register before selling.
- Closing a shift produces totals and cash reconciliation data.

### Module 5. Held Carts and Cart Recovery
**Goal:** support real counter workflow where carts are parked and resumed.

**Changes**
- Add `HeldCart` storage and service.
- Add hold, list, restore, rename, and delete held carts.
- Preserve customer, line items, coupons, notes, discounts, and fees when a cart is held.
- Add stale-cart handling when products or variations become invalid.

**Public API / types**
- `held-carts` create/list/get/restore/delete

**Done when**
- Cashiers can park a sale and resume it later without rebuilding the cart.
- Invalid held-cart items surface clear recovery errors.

### Module 6. Cart Adjustments: Discounts, Fees, Notes
**Goal:** support common in-store adjustments without editing products.

**Changes**
- Add cart-level fixed/percentage discount support.
- Add line-item discount support.
- Add custom fee support with validation.
- Add cart notes and order notes captured from POS.
- Show adjustment breakdown clearly in totals and receipt data.

**Public API / types**
- `cart/discounts`
- `cart/fees`
- cart note fields in cart/order payloads

**Done when**
- Staff can complete common assisted-checkout scenarios entirely inside POS.
- Totals remain correct for tax, coupon, discount, and fee combinations.

### Module 7. Receipt and Order Follow-up
**Goal:** make completed orders usable in-store.

**Changes**
- Add receipt renderer service and printable receipt template.
- Add receipt/reprint endpoint and order-level receipt metadata.
- Add quick order lookup in POS for recent POS orders.
- Add payment-link resend/regenerate for pending POS orders.
- Add edit/review links for managers from POS order history.

**Public API / types**
- `receipts/{order}`
- `orders/{id}/payment-link`
- `orders/recent`

**Done when**
- Every POS order can be printed or reprinted.
- Pending payment-link orders can be recovered without leaving the POS flow.

### Module 8. Fast Product Entry and Search
**Goal:** make item entry fast enough for real cashier usage.

**Changes**
- Add barcode and SKU-first lookup flow.
- Add recent/frequent products.
- Add quick quantity controls and item scanning behavior.
- Improve product result ranking and stock messaging.
- Add walk-in customer shortcut and fast cart clear/start-new-sale flow.

**Done when**
- A cashier can build a sale quickly with keyboard or scanner input.
- Product lookup no longer depends on slow manual search alone.

### Module 9. Checkout Hardening and Audit Trail
**Goal:** make current order creation safe for production.

**Changes**
- Add stock revalidation at submit time.
- Add duplicate-submit protection and idempotent checkout handling.
- Add better recovery for partial failures after order creation begins.
- Add structured audit events for register open/close, held-cart restore, manual payment, payment-link send, and order completion.
- Add debug/system-status screen for support.

**Done when**
- Checkout failures are recoverable and diagnosable.
- Important cashier actions are traceable.

### Module 10. Shift Reporting and Manager Tools
**Goal:** add the minimum management layer expected in a mature POS.

**Changes**
- Add shift summary report with sales totals, tender breakdown, discounts, refunds placeholder, and order count.
- Add manager views for open shifts, recent POS orders, and cashier activity.
- Add close-shift exceptions/warnings when pending orders or mismatched cash exist.

**Done when**
- A manager can review day-to-day POS activity without direct database access.

### Module 11. Commercial Plugin Readiness
**Goal:** finish the plugin as a supportable product.

**Changes**
- Add `readme.txt`, changelog discipline, screenshots/docs placeholders, translations folder, and support docs.
- Add compatibility matrix and dependency checks for supported WordPress/WooCommerce/PHP versions.
- Add uninstall cleanup behavior and migration tests.
- Add smoke tests for install, activate, bootstrap, register open, sale complete, held-cart restore, and receipt render.

**Done when**
- The plugin is installable, upgradeable, testable, and supportable as a commercial product.

## Public Interfaces to Add
- Domain concepts: `Register`, `Shift`, `HeldCart`, `Receipt`, `AuditEvent`, `PosSettings`
- New service interfaces:
  - register manager
  - held-cart repository
  - receipt renderer
  - audit logger
  - settings provider
- New REST families:
  - `bootstrap/settings`
  - `register/*`
  - `held-carts/*`
  - `cart/discounts`
  - `cart/fees`
  - `receipts/*`
  - `orders/recent`
  - `reports/shift-summary`

## Acceptance and Testing
Every module must ship with:
- REST/controller tests for success, validation failure, and permission failure.
- Domain/service tests for the main business rules.
- At least one end-to-end happy-path flow covering the module’s cashier behavior.
- No regression to current MVP flows: add item, select customer, apply coupon, create payment-link order, create manual-paid order.

Release-level acceptance:
- Cashier can open register, create/hold/restore carts, apply adjustments, complete sale, and print/reprint receipt.
- Manager can close shift and review shift totals.
- Plugin installs cleanly, upgrades from current baseline, and exposes useful support/debug info.

## Assumptions and Defaults
- Target is a commercial plugin, not an internal-only tool.
- Single-location only for this roadmap.
- Online-first only; offline sync is deferred.
- Card-present terminal support is deferred until after this roadmap.
- Current coupon module is treated as existing baseline functionality, not a future module.
- Refunds/voids can be added after Module 10 unless they become a release blocker.
