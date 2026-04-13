(function (window, wp, config) {
  function showInitError(msg) {
    var r = window.document && window.document.getElementById('wc-staff-pos-root');
    if (r) {
      r.innerHTML =
        '<div class="wc-staff-pos-init-error">' +
        '<strong>Staff POS could not load.</strong> ' + msg +
        '<br><small>Check the browser console (F12) for more details.</small>' +
        '</div>';
    }
  }

  if (!window || !wp || !config) {
    showInitError('Required configuration (wcStaffPosConfig) is missing. The page may need to be refreshed.');
    return;
  }

  if (!wp.element || typeof wp.element.createElement !== 'function') {
    showInitError('The WordPress element library (wp-element / React) did not load correctly. Try disabling other plugins to check for conflicts.');
    return;
  }

  var element = wp.element;
  var apiFetch = wp.apiFetch;
  var h = element.createElement;
  var useEffect = element.useEffect;
  var useMemo = element.useMemo;
  var useRef = element.useRef;
  var useState = element.useState;

  if (apiFetch && apiFetch.createNonceMiddleware) {
    apiFetch.use(apiFetch.createNonceMiddleware(config.nonce));
  }

  function request(path, options) {
    return apiFetch(Object.assign({ path: '/wc-pos/v1' + path, method: 'GET' }, options || {}));
  }

  function classNames() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
  }

  function htmlNode(html) {
    return h('span', { dangerouslySetInnerHTML: { __html: html || '' } });
  }

  function get_woocommerce_currency_symbol_js() {
    return (config && config.currencySymbol) ? config.currencySymbol : '$';
  }

  function Receipt(props) {
    var r = props.receipt;
    if (!r) return null;
    return h('div', { className: 'wc-staff-pos-receipt' },
      h('div', { className: 'wc-staff-pos-receipt-store' }, r.storeName),
      h('div', { className: 'wc-staff-pos-receipt-meta' },
        h('span', null, 'Order #' + r.orderNumber),
        h('span', null, r.date)
      ),
      h('div', { className: 'wc-staff-pos-receipt-meta' },
        h('span', null, 'Cashier: ' + r.cashier),
        h('span', null, 'Customer: ' + r.customerName)
      ),
      h('hr', { className: 'wc-staff-pos-receipt-hr' }),
      h('div', { className: 'wc-staff-pos-receipt-items' },
        r.items.map(function (item, i) {
          return h('div', { key: i, className: 'wc-staff-pos-receipt-item' },
            h('span', null, item.quantity + '\u00d7 ' + item.name),
            htmlNode(item.totalHtml)
          );
        })
      ),
      h('hr', { className: 'wc-staff-pos-receipt-hr' }),
      h('div', { className: 'wc-staff-pos-receipt-totals' },
        h('div', null, h('span', null, 'Subtotal'), htmlNode(r.subtotalHtml)),
        h('div', null, h('span', null, 'Discount'), htmlNode(r.discountHtml)),
        h('div', null, h('span', null, 'Tax'), htmlNode(r.taxHtml)),
        h('div', { className: 'is-total' }, h('strong', null, 'Total'), htmlNode(r.totalHtml))
      ),
      h('div', { className: 'wc-staff-pos-receipt-tender' }, 'Paid by: ' + r.tenderType),
      h('div', { className: 'wc-staff-pos-receipt-print-actions' },
        h('button', {
          type: 'button', className: 'button button-secondary',
          onClick: function () { window.print(); }
        }, 'Print receipt')
      )
    );
  }

  function renderNotice(notice, index) {
    return h('div', { key: 'notice-' + index, className: classNames('wc-staff-pos-notice', notice.type) }, notice.message);
  }

  function findVariation(product, selectedAttributes) {
    if (!product || !product.variations || !product.variations.length) return null;
    return product.variations.find(function (variation) {
      var keys = Object.keys(variation.attributes || {});
      return keys.length && keys.every(function (key) {
        return (selectedAttributes[key] || '') === (variation.attributes[key] || '');
      });
    }) || null;
  }

  function Field(props) {
    return h('label', { className: 'wc-staff-pos-field' },
      h('span', { className: 'wc-staff-pos-field-label' }, props.label),
      props.children
    );
  }

  function ProductCard(props) {
    var p = props.product;
    return h('button', {
      type: 'button',
      className: classNames('wc-staff-pos-product-card', props.active && 'is-active', !p.inStock && 'is-out-of-stock'),
      onClick: function () { props.onSelect(p.id); }
    },
      p.image ? h('img', { src: p.image, alt: '', className: 'wc-staff-pos-product-image', 'aria-hidden': 'true' }) : null,
      h('div', { className: 'wc-staff-pos-product-card-body' },
        h('strong', null, p.name),
        p.sku ? h('span', { className: 'wc-staff-pos-meta' }, 'SKU: ' + p.sku) : null,
        h('span', { className: 'wc-staff-pos-price' }, htmlNode(p.priceHtml || '')),
        h('div', { className: 'wc-staff-pos-product-card-badges' },
          !p.inStock ? h('span', { className: 'wc-staff-pos-badge is-warning' }, 'Out of stock') : null,
          !p.isSupported ? h('span', { className: 'wc-staff-pos-badge is-warning' }, 'Unsupported') : null
        )
      )
    );
  }

  function CartItem(props) {
    var item = props.item;
    var _lq = useState(item.quantity), localQty = _lq[0], setLocalQty = _lq[1];

    // Keep local qty in sync when the server-side cart updates the item.
    useEffect(function () { setLocalQty(item.quantity); }, [item.quantity]);

    function commitQty() {
      var next = Number(localQty);
      if (!isNaN(next) && next !== item.quantity) {
        props.onQuantityChange(item.key, next);
      }
    }

    return h('div', { className: 'wc-staff-pos-cart-item' },
      h('div', { className: 'wc-staff-pos-cart-item-main' },
        h('strong', null, item.name),
        item.customPrice ? h('span', { className: 'wc-staff-pos-custom-price-chip' }, 'Custom price') : null,
        item.attributes && item.attributes.length
          ? h('div', { className: 'wc-staff-pos-cart-attributes' },
              item.attributes.map(function (a, i) {
                return h('span', { key: item.key + '-attr-' + i }, a.name + ': ' + a.value);
              })
            )
          : null
      ),
      h('div', { className: 'wc-staff-pos-cart-item-controls' },
        h('input', {
          type: 'number', min: 0, value: localQty,
          onChange: function (e) { setLocalQty(e.target.value); },
          onBlur: commitQty,
          onKeyDown: function (e) { if (e.key === 'Enter') { e.target.blur(); } }
        }),
        h('span', { className: 'wc-staff-pos-price' }, htmlNode(item.lineTotalHtml || '')),
        h('button', { type: 'button', className: 'button button-link-delete', onClick: function () { props.onRemove(item.key); } }, 'Remove')
      )
    );
  }

  /* ---- History row ---- */
  function OrderRow(props) {
    var o = props.order;
    var statusClass = o.status === 'completed' || o.status === 'processing'
      ? 'wc-staff-pos-badge is-success'
      : 'wc-staff-pos-badge is-warning';
    var canRefund = (o.status === 'completed' || o.status === 'processing') && props.onRefundClick;
    return h('div', { className: 'wc-staff-pos-history-row' },
      h('div', { className: 'wc-staff-pos-history-row-main' },
        h('strong', null, '#' + o.number + ' \u2013 ' + o.customerName),
        h('span', { className: 'wc-staff-pos-meta' }, o.date),
        o.tenderType ? h('span', { className: 'wc-staff-pos-meta' }, o.tenderType) : null
      ),
      h('div', { className: 'wc-staff-pos-history-row-aside' },
        h('span', { className: 'wc-staff-pos-price' }, htmlNode(o.totalHtml || '')),
        h('span', { className: statusClass }, o.status),
        h('div', { className: 'wc-staff-pos-history-actions' },
          h('a', { href: o.editUrl, target: '_blank', rel: 'noreferrer', className: 'button button-small' }, 'View'),
          o.paymentUrl
            ? h('a', { href: o.paymentUrl, target: '_blank', rel: 'noreferrer', className: 'button button-small button-secondary' }, 'Pay')
            : null,
          canRefund
            ? h('button', {
                type: 'button', className: 'button button-small',
                onClick: function () { props.onRefundClick(o); }
              }, 'Refund')
            : null
        )
      )
    );
  }

  /* ---- Inline refund form ---- */
  function RefundPanel(props) {
    var o = props.order;
    return h('div', { className: 'wc-staff-pos-refund-panel' },
      h('h4', null, 'Refund order #' + o.number + ' \u2013 ' + o.customerName),
      h(Field, { label: 'Amount' },
        h('input', {
          type: 'number', min: '0.01', step: '0.01', value: props.amount,
          onChange: function (e) { props.onAmountChange(e.target.value); }
        })
      ),
      h(Field, { label: 'Reason (optional)' },
        h('textarea', {
          className: 'wc-staff-pos-textarea', rows: 2, value: props.reason,
          onChange: function (e) { props.onReasonChange(e.target.value); }
        })
      ),
      h('div', { className: 'wc-staff-pos-refund-actions' },
        h('button', {
          type: 'button', className: 'button button-primary',
          disabled: !props.amount || props.busy,
          onClick: props.onConfirm
        }, props.busy ? 'Processing\u2026' : 'Process refund'),
        h('button', {
          type: 'button', className: 'button button-secondary',
          disabled: props.busy,
          onClick: props.onCancel
        }, 'Cancel')
      )
    );
  }

  /* ---- Daily report ---- */
  function DailyReport(props) {
    var r = props.report;
    if (!r) return null;
    return h('div', { className: 'wc-staff-pos-report' },
      h('div', { className: 'wc-staff-pos-report-grid' },
        h('div', { className: 'wc-staff-pos-report-card' },
          h('div', { className: 'wc-staff-pos-report-card-value' }, r.orderCount),
          h('div', { className: 'wc-staff-pos-report-card-label' }, 'Orders')
        ),
        h('div', { className: 'wc-staff-pos-report-card' },
          h('div', { className: 'wc-staff-pos-report-card-value' }, htmlNode(r.totalRevenueHtml)),
          h('div', { className: 'wc-staff-pos-report-card-label' }, 'Revenue (paid)')
        )
      ),
      r.tenderBreakdown && r.tenderBreakdown.length
        ? h('div', null,
            h('h4', null, 'By payment method'),
            h('table', { className: 'wc-staff-pos-report-table' },
              h('thead', null, h('tr', null,
                h('th', null, 'Method'), h('th', null, 'Orders'), h('th', null, 'Total')
              )),
              h('tbody', null,
                r.tenderBreakdown.map(function (t, i) {
                  return h('tr', { key: 'tender-' + i },
                    h('td', null, t.label), h('td', null, t.count), h('td', null, htmlNode(t.totalHtml))
                  );
                })
              )
            )
          )
        : null,
      r.cashierBreakdown && r.cashierBreakdown.length > 1
        ? h('div', null,
            h('h4', null, 'By cashier'),
            h('table', { className: 'wc-staff-pos-report-table' },
              h('thead', null, h('tr', null,
                h('th', null, 'Cashier'), h('th', null, 'Orders'), h('th', null, 'Total')
              )),
              h('tbody', null,
                r.cashierBreakdown.map(function (t, i) {
                  return h('tr', { key: 'cashier-' + i },
                    h('td', null, t.name), h('td', null, t.count), h('td', null, htmlNode(t.totalHtml))
                  );
                })
              )
            )
          )
        : null
    );
  }

  function App() {
    // Core
    var _a = useState(null), bootstrap = _a[0], setBootstrap = _a[1];
    var _b = useState({ items: [], itemCount: 0, totals: {}, appliedCoupons: [], notices: [] }), cart = _b[0], setCart = _b[1];
    var _p = useState(false), loading = _p[0], setLoading = _p[1];
    // busyMap: { [actionKey]: refCount } — prevents race conditions where a
    // faster request clearing a single string would unlock the UI prematurely.
    var _q = useState({}), busyMap = _q[0], setBusyMap = _q[1];
    var _n = useState(''), feedback = _n[0], setFeedback = _n[1];
    var _o = useState(null), orderResult = _o[0], setOrderResult = _o[1];

    // Products
    var _c = useState([]), products = _c[0], setProducts = _c[1];
    var _d = useState(''), productQuery = _d[0], setProductQuery = _d[1];
    var _e = useState(null), selectedProductId = _e[0], setSelectedProductId = _e[1];
    var _f = useState(null), selectedProduct = _f[0], setSelectedProduct = _f[1];
    var _g = useState({}), selectedAttributes = _g[0], setSelectedAttributes = _g[1];
    var _h = useState(1), quantity = _h[0], setQuantity = _h[1];
    var _po = useState(false), priceOverride = _po[0], setPriceOverride = _po[1];
    var _cp = useState(''), customPrice = _cp[0], setCustomPrice = _cp[1];

    // Categories
    var _cat = useState([]), categories = _cat[0], setCategories = _cat[1];
    var _sc = useState(0), selectedCategory = _sc[0], setSelectedCategory = _sc[1];

    // Customers
    var _i = useState([]), customers = _i[0], setCustomers = _i[1];
    var _j = useState(''), customerQuery = _j[0], setCustomerQuery = _j[1];
    var _k = useState(null), selectedCustomer = _k[0], setSelectedCustomer = _k[1];
    var _l = useState({ first_name: '', last_name: '', email: '', phone: '' }), customerDraft = _l[0], setCustomerDraft = _l[1];
    var _gm = useState(false), guestMode = _gm[0], setGuestMode = _gm[1];

    // Cart extras
    var _m = useState('cash'), tenderType = _m[0], setTenderType = _m[1];
    var _r = useState(''), couponCode = _r[0], setCouponCode = _r[1];
    var _s = useState(''), orderNote = _s[0], setOrderNote = _s[1];

    // View mode for the centre panel
    var _vm = useState('products'), viewMode = _vm[0], setViewMode = _vm[1];
    var _ho = useState([]), historyOrders = _ho[0], setHistoryOrders = _ho[1];
    var _hl = useState(false), historyLoading = _hl[0], setHistoryLoading = _hl[1];

    // Held carts
    var _hc = useState([]), heldCarts = _hc[0], setHeldCarts = _hc[1];
    var _hcl = useState(false), heldCartsLoading = _hcl[0], setHeldCartsLoading = _hcl[1];

    // Cart discount
    var _dt = useState('percent'), discountType = _dt[0], setDiscountType = _dt[1];
    var _dv = useState(''), discountValue = _dv[0], setDiscountValue = _dv[1];

    // Receipt visibility
    var _rv = useState(false), showReceipt = _rv[0], setShowReceipt = _rv[1];

    // History filters (server-side: status, tender, date; client-side: text query)
    var _hq = useState(''), historyQuery = _hq[0], setHistoryQuery = _hq[1];
    var _hs = useState(''), historyStatus = _hs[0], setHistoryStatus = _hs[1];
    var _htt = useState(''), historyTenderFilter = _htt[0], setHistoryTenderFilter = _htt[1];
    var _hdf = useState(''), historyDateFrom = _hdf[0], setHistoryDateFrom = _hdf[1];
    var _hdt = useState(''), historyDateTo = _hdt[0], setHistoryDateTo = _hdt[1];

    // Refund
    var _ro = useState(null), refundTarget = _ro[0], setRefundTarget = _ro[1];
    var _ram = useState(''), refundAmount = _ram[0], setRefundAmount = _ram[1];
    var _rrs = useState(''), refundReason = _rrs[0], setRefundReason = _rrs[1];

    // Daily report
    var _rep = useState(null), report = _rep[0], setReport = _rep[1];
    var _repd = useState(''), reportDate = _repd[0], setReportDate = _repd[1];
    var _repl = useState(false), reportLoading = _repl[0], setReportLoading = _repl[1];

    // Ref to trigger auto-add after product details load (barcode scanner flow)
    var autoAddRef = useRef(false);

    // ---- busy helpers -------------------------------------------------------
    function startBusy(key) {
      setBusyMap(function (m) {
        var n = Object.assign({}, m);
        n[key] = (n[key] || 0) + 1;
        return n;
      });
    }
    function stopBusy(key) {
      setBusyMap(function (m) {
        var n = Object.assign({}, m);
        if ((n[key] || 0) > 1) { n[key]--; } else { delete n[key]; }
        return n;
      });
    }
    function isBusy(key) { return !!(busyMap[key]); }
    var anyBusy = Object.keys(busyMap).length > 0;
    // Legacy alias so existing `isBusy('xyz')` checks still work via isBusy
    var busyAction = Object.keys(busyMap)[0] || '';
    // -------------------------------------------------------------------------

    var selectedVariation = useMemo(function () {
      return findVariation(selectedProduct, selectedAttributes);
    }, [selectedProduct, selectedAttributes]);

    var canOverridePrice = bootstrap && bootstrap.capabilities && bootstrap.capabilities.wc_staff_pos_price_override;

    /* ---- Auto-dismiss feedback ---- */
    useEffect(function () {
      if (!feedback) return;
      var t = window.setTimeout(function () { setFeedback(''); }, 6000);
      return function () { window.clearTimeout(t); };
    }, [feedback]);

    /* ---- Bootstrap ---- */
    useEffect(function () {
      setLoading(true);
      Promise.all([
        request('/bootstrap'),
        request('/held-carts')
      ])
        .then(function (results) {
          var res = results[0];
          setBootstrap(res);
          setCart(res.cart || { items: [], itemCount: 0, totals: {}, appliedCoupons: [], notices: [] });
          setHeldCarts((results[1] && results[1].items) || []);
        })
        .catch(function (err) { setFeedback(err.message || 'Failed to load Staff POS.'); })
        .finally(function () { setLoading(false); });
    }, []);

    /* ---- Load categories once ---- */
    useEffect(function () {
      request('/categories')
        .then(function (res) { setCategories(res.items || []); })
        .catch(function () {}); // Non-fatal
    }, []);

    /* ---- Product search (debounced) ---- */
    useEffect(function () {
      var t = window.setTimeout(function () {
        var url = '/products?q=' + encodeURIComponent(productQuery || '');
        if (selectedCategory > 0) url += '&category=' + selectedCategory;
        request(url)
          .then(function (res) { setProducts(res.items || []); })
          .catch(function (err) { setFeedback(err.message || 'Failed to load products.'); });
      }, 250);
      return function () { window.clearTimeout(t); };
    }, [productQuery, selectedCategory]);

    /* ---- Customer search (debounced) ---- */
    useEffect(function () {
      var t = window.setTimeout(function () {
        request('/customers?q=' + encodeURIComponent(customerQuery || ''))
          .then(function (res) { setCustomers(res.items || []); })
          .catch(function (err) { setFeedback(err.message || 'Failed to load customers.'); });
      }, 250);
      return function () { window.clearTimeout(t); };
    }, [customerQuery]);

    /* ---- Load product detail ---- */
    useEffect(function () {
      if (!selectedProductId) {
        setSelectedProduct(null);
        setSelectedAttributes({});
        autoAddRef.current = false;
        return;
      }

      request('/products/' + selectedProductId)
        .then(function (res) {
          var product = res.item || null;
          setSelectedProduct(product);
          setSelectedAttributes({});
          setQuantity(1);
          setPriceOverride(false);
          setCustomPrice('');

          // Barcode scanner: auto-add if the product is simple & in stock.
          if (autoAddRef.current && product && product.isSupported && product.inStock && product.type === 'simple') {
            autoAddRef.current = false;
            startBusy('add-to-cart');
            request('/cart/items', {
              method: 'POST',
              data: { product_id: product.id, quantity: 1, variation_id: 0, selected_attributes: {} }
            })
              .then(function (r) {
                syncCart(r.cart);
                setFeedback('\u2713 ' + product.name + ' added to cart.');
                setProductQuery('');
                setSelectedProductId(null);
              })
              .catch(function (e) { setFeedback(e.message || 'Could not add product.'); })
              .finally(function () { stopBusy('add-to-cart'); });
          } else {
            autoAddRef.current = false;
          }
        })
        .catch(function (err) { setFeedback(err.message || 'Failed to load product details.'); });
    }, [selectedProductId]);

    /* ---- Load order history when panel switches or server-side filters change ---- */
    useEffect(function () {
      if (viewMode !== 'history') return;
      setHistoryLoading(true);
      var url = '/orders?limit=50';
      if (historyStatus) url += '&status=' + encodeURIComponent(historyStatus);
      if (historyTenderFilter) url += '&tender_type=' + encodeURIComponent(historyTenderFilter);
      if (historyDateFrom) url += '&date_from=' + encodeURIComponent(historyDateFrom);
      if (historyDateTo) url += '&date_to=' + encodeURIComponent(historyDateTo);
      request(url)
        .then(function (res) { setHistoryOrders(res.items || []); })
        .catch(function (err) { setFeedback(err.message || 'Failed to load order history.'); })
        .finally(function () { setHistoryLoading(false); });
    }, [viewMode, historyStatus, historyTenderFilter, historyDateFrom, historyDateTo]);

    /* ---- Load held carts when panel switches ---- */
    useEffect(function () {
      if (viewMode !== 'held-carts') return;
      setHeldCartsLoading(true);
      request('/held-carts')
        .then(function (res) { setHeldCarts(res.items || []); })
        .catch(function (err) { setFeedback(err.message || 'Failed to load held carts.'); })
        .finally(function () { setHeldCartsLoading(false); });
    }, [viewMode]);

    /* ---- Load daily report when the reports tab is opened ---- */
    useEffect(function () {
      if (viewMode !== 'reports') return;
      loadDailyReport(reportDate);
    }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ======================================================
       Handlers
    ====================================================== */
    function syncCart(nextCart) {
      setCart(nextCart || { items: [], itemCount: 0, totals: {}, appliedCoupons: [], notices: [] });
    }

    function handleSelectCustomer(customer) {
      setSelectedCustomer(customer);
      setGuestMode(false);
      setCustomerDraft({
        first_name: customer.firstName || '',
        last_name: customer.lastName || '',
        email: customer.email || '',
        phone: customer.phone || ''
      });
    }

    function handleDeselectCustomer() {
      setSelectedCustomer(null);
      setCustomerDraft({ first_name: '', last_name: '', email: '', phone: '' });
    }

    function handleGuestMode() {
      handleDeselectCustomer();
      setCustomerQuery('');
      setGuestMode(true);
    }

    function handleCustomerDraftChange(key, value) {
      setCustomerDraft(function (cur) {
        var patch = {};
        patch[key] = value;
        return Object.assign({}, cur, patch);
      });
    }

    function handleCreateCustomer() {
      startBusy('create-customer');
      request('/customers', { method: 'POST', data: customerDraft })
        .then(function (res) {
          handleSelectCustomer(res.item);
          setFeedback('Customer created and selected.');
          setCustomerQuery(res.item.email || res.item.name || '');
        })
        .catch(function (err) { setFeedback(err.message || 'Customer could not be created.'); })
        .finally(function () { stopBusy('create-customer'); });
    }

    function handleAttributeChange(name, value) {
      setSelectedAttributes(function (cur) {
        var patch = {};
        patch[name] = value;
        return Object.assign({}, cur, patch);
      });
    }

    function handleAddToCart() {
      if (!selectedProduct) return;
      startBusy('add-to-cart');
      request('/cart/items', {
        method: 'POST',
        data: {
          product_id: selectedProduct.id,
          quantity: quantity,
          variation_id: selectedVariation ? selectedVariation.id : 0,
          selected_attributes: selectedAttributes,
          custom_price: priceOverride && customPrice ? parseFloat(customPrice) : 0
        }
      })
        .then(function (res) {
          syncCart(res.cart);
          setFeedback('Product added to the POS cart.');
        })
        .catch(function (err) { setFeedback(err.message || 'Product could not be added to the cart.'); })
        .finally(function () { stopBusy('add-to-cart'); });
    }

    /* Barcode scanner: Enter key in product search field */
    function handleProductSearchKeyDown(event) {
      if (event.key !== 'Enter') return;
      if (products.length !== 1) return;
      var p = products[0];
      if (!p.isSupported || !p.inStock) return;
      event.preventDefault();

      if (p.type === 'simple') {
        // Mark that the upcoming detail load should auto-add.
        autoAddRef.current = true;
      }
      setSelectedProductId(p.id);
    }

    function handleQuantityChange(itemKey, nextQty) {
      request('/cart/items/' + itemKey, { method: 'PATCH', data: { quantity: Number(nextQty) } })
        .then(function (res) { syncCart(res.cart); })
        .catch(function (err) { setFeedback(err.message || 'Cart item could not be updated.'); });
    }

    function handleRemoveCartItem(itemKey) {
      request('/cart/items/' + itemKey, { method: 'DELETE' })
        .then(function (res) { syncCart(res.cart); })
        .catch(function (err) { setFeedback(err.message || 'Cart item could not be removed.'); });
    }

    function handleClearCart() {
      if (!window.confirm('Clear the entire POS cart?')) return;
      startBusy('clear-cart');
      request('/cart', { method: 'DELETE' })
        .then(function (res) { syncCart(res.cart); setFeedback('Cart cleared.'); })
        .catch(function (err) { setFeedback(err.message || 'Cart could not be cleared.'); })
        .finally(function () { stopBusy('clear-cart'); });
    }

    function handleApplyCoupon() {
      var code = couponCode.trim();
      if (!code) return;
      startBusy('apply-coupon');
      request('/cart/coupons', { method: 'POST', data: { code: code } })
        .then(function (res) { syncCart(res.cart); setCouponCode(''); setFeedback('Coupon applied.'); })
        .catch(function (err) { setFeedback(err.message || 'Coupon could not be applied.'); })
        .finally(function () { stopBusy('apply-coupon'); });
    }

    function handleRemoveCoupon(code) {
      request('/cart/coupons/' + encodeURIComponent(code), { method: 'DELETE' })
        .then(function (res) { syncCart(res.cart); setFeedback('Coupon removed.'); })
        .catch(function (err) { setFeedback(err.message || 'Coupon could not be removed.'); });
    }

    function handleHoldCart() {
      var name = window.prompt('Name this held cart (optional):');
      if (name === null) return; // cancelled
      startBusy('hold-cart');
      request('/held-carts', { method: 'POST', data: { name: name || '' } })
        .then(function (res) {
          syncCart(res.cart);
          setFeedback('Cart saved as "' + (res.heldCart && res.heldCart.name) + '".');
          setHeldCarts(function (cur) { return res.heldCart ? [res.heldCart].concat(cur) : cur; });
        })
        .catch(function (err) { setFeedback(err.message || 'Cart could not be held.'); })
        .finally(function () { stopBusy('hold-cart'); });
    }

    function handleRestoreHeldCart(id) {
      var busyKey = 'restore-cart-' + id;
      startBusy(busyKey);
      request('/held-carts/' + encodeURIComponent(id) + '/restore', { method: 'POST' })
        .then(function (res) {
          syncCart(res.cart);
          setHeldCarts(function (cur) { return cur.filter(function (c) { return c.id !== id; }); });
          setViewMode('products');
          setFeedback('Held cart restored.');
        })
        .catch(function (err) { setFeedback(err.message || 'Cart could not be restored.'); })
        .finally(function () { stopBusy(busyKey); });
    }

    function handleDeleteHeldCart(id, name) {
      if (!window.confirm('Delete held cart "' + (name || 'this cart') + '"?')) return;
      request('/held-carts/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(function (res) { setHeldCarts(res.items || []); setFeedback('Held cart deleted.'); })
        .catch(function (err) { setFeedback(err.message || 'Held cart could not be deleted.'); });
    }

    function handleApplyDiscount() {
      var val = parseFloat(discountValue);
      if (isNaN(val) || val <= 0) return;
      startBusy('apply-discount');
      request('/cart/discount', { method: 'POST', data: { type: discountType, value: val } })
        .then(function (res) { syncCart(res.cart); setDiscountValue(''); setFeedback('Discount applied.'); })
        .catch(function (err) { setFeedback(err.message || 'Discount could not be applied.'); })
        .finally(function () { stopBusy('apply-discount'); });
    }

    function handleClearDiscount() {
      startBusy('clear-discount');
      request('/cart/discount', { method: 'DELETE' })
        .then(function (res) { syncCart(res.cart); setFeedback('Discount removed.'); })
        .catch(function (err) { setFeedback(err.message || 'Discount could not be removed.'); })
        .finally(function () { stopBusy('clear-discount'); });
    }

    function buildBillingPayload() {
      // customerDraft is already pre-populated from the selected customer on selection,
      // so edited values always take precedence regardless of guest/account mode.
      return {
        first_name: customerDraft.first_name,
        last_name: customerDraft.last_name,
        email: customerDraft.email,
        phone: customerDraft.phone
      };
    }

    function maybeCopyLink(link) {
      if (!link || !navigator.clipboard || !navigator.clipboard.writeText) return Promise.resolve();
      return navigator.clipboard.writeText(link).catch(function () { return Promise.resolve(); });
    }

    function handleCopyLink(link) {
      maybeCopyLink(link).then(function () { setFeedback('Payment link copied to clipboard.'); });
    }

    function handleCreateOrder(mode, sendEmail) {
      var busyKey = mode + (sendEmail ? '-send' : '-create');
      startBusy(busyKey);
      request('/orders', {
        method: 'POST',
        data: {
          mode: mode,
          send_email: !!sendEmail,
          tender_type: tenderType,
          customer_id: selectedCustomer ? selectedCustomer.id : 0,
          billing: buildBillingPayload(),
          note: orderNote
        }
      })
        .then(function (res) {
          syncCart(res.cart);
          setOrderResult(res.order);
          setOrderNote('');
          if (res.order && res.order.paymentUrl) maybeCopyLink(res.order.paymentUrl);
          if (mode === 'manual_paid') {
            setFeedback('Order #' + res.order.number + ' created and marked paid.');
          } else if (sendEmail) {
            setFeedback('Order #' + res.order.number + ' created. Invoice emailed. Payment link copied.');
          } else {
            setFeedback('Order #' + res.order.number + ' created. Payment link copied.');
          }
        })
        .catch(function (err) { setFeedback(err.message || 'Order could not be created.'); })
        .finally(function () { stopBusy(busyKey); });
    }

    function handleNewTransaction() {
      setOrderResult(null);
      setShowReceipt(false);
      setSelectedCustomer(null);
      setGuestMode(false);
      setSelectedProductId(null);
      setSelectedProduct(null);
      setSelectedAttributes({});
      setQuantity(1);
      setPriceOverride(false);
      setCustomPrice('');
      setCustomerQuery('');
      setCustomerDraft({ first_name: '', last_name: '', email: '', phone: '' });
      setOrderNote('');
      setCouponCode('');
      setDiscountValue('');
      setFeedback('');
    }

    function loadDailyReport(date) {
      setReportLoading(true);
      var url = '/reports/daily' + (date ? '?date=' + encodeURIComponent(date) : '');
      request(url)
        .then(function (res) {
          setReport(res);
          if (res.date) setReportDate(res.date);
        })
        .catch(function (err) { setFeedback(err.message || 'Failed to load report.'); })
        .finally(function () { setReportLoading(false); });
    }

    function handleRefund() {
      if (!refundTarget) return;
      var amount = parseFloat(refundAmount);
      if (isNaN(amount) || amount <= 0) { setFeedback('Enter a valid refund amount.'); return; }
      var capturedId = refundTarget.id;
      var capturedNumber = refundTarget.number;
      startBusy('refund-' + capturedId);
      request('/orders/' + capturedId + '/refund', {
        method: 'POST',
        data: { amount: amount, reason: refundReason }
      })
        .then(function (res) {
          setHistoryOrders(function (cur) {
            return cur.map(function (o) {
              if (o.id === capturedId) return Object.assign({}, o, { status: res.order.status });
              return o;
            });
          });
          setFeedback('Refund processed for order #' + capturedNumber + '.');
          setRefundTarget(null);
          setRefundAmount('');
          setRefundReason('');
        })
        .catch(function (err) { setFeedback(err.message || 'Refund could not be processed.'); })
        .finally(function () { stopBusy('refund-' + capturedId); });
    }

    var tenderOptions = bootstrap && bootstrap.manualTenderTypes && bootstrap.manualTenderTypes.length
      ? bootstrap.manualTenderTypes
      : [{ value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'manual', label: 'Manual' }];

    var activeDiscount = cart && cart.cartDiscount ? cart.cartDiscount : null;

    var filteredHistoryOrders = useMemo(function () {
      if (!historyQuery) return historyOrders;
      var q = historyQuery.toLowerCase();
      return historyOrders.filter(function (o) {
        return (o.customerName || '').toLowerCase().indexOf(q) >= 0 ||
               (o.email || '').toLowerCase().indexOf(q) >= 0 ||
               String(o.number || '').indexOf(q) >= 0;
      });
    }, [historyOrders, historyQuery]);

    var hasCartItems = cart && cart.items && cart.items.length > 0;

    /* ======================================================
       Render
    ====================================================== */

    /* Show a full-page spinner while the initial bootstrap fetch is in flight
       and no data has arrived yet.  Once bootstrap resolves (success or error)
       this condition is false and the normal layout is rendered. */
    if (loading && !bootstrap) {
      return h('div', { className: 'wc-staff-pos-app' },
        h('div', { className: 'wc-staff-pos-loading' },
          h('span', { className: 'wc-staff-pos-spinner' }),
          'Loading Staff POS\u2026'
        )
      );
    }

    return h('div', { className: 'wc-staff-pos-app' },

      /* ---- Header ---- */
      h('header', { className: 'wc-staff-pos-header' },
        h('div', null,
          h('h1', null, config.title || 'Staff POS'),
          bootstrap && bootstrap.currentUser
            ? h('p', null, 'Cashier: ' + bootstrap.currentUser.name)
            : null
        ),
        h('div', { className: 'wc-staff-pos-header-right' },
          h('div', { className: 'wc-staff-pos-status' },
            cart && cart.itemCount ? cart.itemCount + ' item(s) in cart' : 'Empty cart'
          )
        )
      ),

      /* ---- Feedback banner ---- */
      feedback
        ? h('div', { className: 'wc-staff-pos-banner' },
            feedback,
            h('button', { type: 'button', className: 'wc-staff-pos-banner-close', 'aria-label': 'Dismiss message', onClick: function () { setFeedback(''); } }, '\u00d7')
          )
        : null,

      /* ---- Cart notices ---- */
      cart && cart.notices && cart.notices.length
        ? h('div', { className: 'wc-staff-pos-notices' }, cart.notices.map(renderNotice))
        : null,

      /* ---- 3-column grid ---- */
      h('div', { className: 'wc-staff-pos-grid' },

        /* ========== CUSTOMER PANEL ========== */
        h('section', { className: 'wc-staff-pos-panel' },
          h('div', { className: 'wc-staff-pos-panel-header' },
            h('h2', null, 'Customer'),
            h('button', {
              type: 'button',
              className: classNames('button button-small', guestMode ? 'button-primary' : 'button-secondary'),
              onClick: guestMode ? function () { setGuestMode(false); } : handleGuestMode
            }, guestMode ? '\u2713 Guest / Walk-in' : 'Guest / Walk-in')
          ),

          !guestMode
            ? h(element.Fragment, null,
                h('input', {
                  className: 'wc-staff-pos-search',
                  type: 'search',
                  placeholder: 'Search by name, email, or phone',
                  value: customerQuery,
                  onChange: function (e) { setCustomerQuery(e.target.value); }
                }),
                h('div', { className: 'wc-staff-pos-customer-results' },
                  customers.map(function (customer) {
                    return h('button', {
                      key: 'customer-' + customer.id,
                      type: 'button',
                      className: classNames('wc-staff-pos-list-item', selectedCustomer && selectedCustomer.id === customer.id && 'is-active'),
                      onClick: function () { handleSelectCustomer(customer); }
                    },
                      h('strong', null, customer.name),
                      h('span', null, customer.email || 'No email'),
                      h('span', null, customer.phone || 'No phone')
                    );
                  })
                ),
                selectedCustomer
                  ? h('div', { className: 'wc-staff-pos-selected-customer' },
                      h('div', { className: 'wc-staff-pos-selected-customer-header' },
                        h('strong', null, 'Selected'),
                        h('button', {
                          type: 'button',
                          className: 'button button-link-delete wc-staff-pos-deselect-btn',
                          onClick: handleDeselectCustomer
                        }, 'Deselect')
                      ),
                      h('p', null, selectedCustomer.name),
                      h('p', null, selectedCustomer.email || 'No email'),
                      h('p', null, selectedCustomer.phone || 'No phone')
                    )
                  : null
              )
            : h('p', { className: 'wc-staff-pos-guest-notice' }, 'Guest / Walk-in sale \u2014 no customer account linked.'),

          h('h3', null, guestMode ? 'Billing info (optional)' : 'Create customer'),
          h('div', { className: 'wc-staff-pos-form-grid' },
            h(Field, { label: 'First name' }, h('input', { value: customerDraft.first_name, onChange: function (e) { handleCustomerDraftChange('first_name', e.target.value); } })),
            h(Field, { label: 'Last name' }, h('input', { value: customerDraft.last_name, onChange: function (e) { handleCustomerDraftChange('last_name', e.target.value); } })),
            h(Field, { label: 'Email' }, h('input', { type: 'email', value: customerDraft.email, onChange: function (e) { handleCustomerDraftChange('email', e.target.value); } })),
            h(Field, { label: 'Phone' }, h('input', { value: customerDraft.phone, onChange: function (e) { handleCustomerDraftChange('phone', e.target.value); } }))
          ),
          !guestMode
            ? h('button', {
                type: 'button',
                className: 'button button-secondary',
                disabled: isBusy('create-customer'),
                onClick: handleCreateCustomer
              }, isBusy('create-customer') ? 'Creating\u2026' : 'Create customer')
            : null
        ),

        /* ========== PRODUCTS / HISTORY PANEL ========== */
        h('section', { className: 'wc-staff-pos-panel' },

          /* Panel tab bar */
          h('div', { className: 'wc-staff-pos-tab-bar' },
            h('button', {
              type: 'button',
              className: classNames('wc-staff-pos-tab', viewMode === 'products' && 'is-active'),
              onClick: function () { setViewMode('products'); }
            }, 'Products'),
            h('button', {
              type: 'button',
              className: classNames('wc-staff-pos-tab', viewMode === 'history' && 'is-active'),
              onClick: function () { setViewMode('history'); }
            }, 'Recent orders'),
            h('button', {
              type: 'button',
              className: classNames('wc-staff-pos-tab', viewMode === 'held-carts' && 'is-active'),
              onClick: function () { setViewMode('held-carts'); }
            }, heldCarts.length ? 'Held carts (' + heldCarts.length + ')' : 'Held carts'),
            h('button', {
              type: 'button',
              className: classNames('wc-staff-pos-tab', viewMode === 'reports' && 'is-active'),
              onClick: function () { setViewMode('reports'); }
            }, 'Daily report')
          ),

          /* ---- Products view ---- */
          viewMode === 'products'
            ? h(element.Fragment, null,
                /* Category filter chips */
                categories.length > 0
                  ? h('div', { className: 'wc-staff-pos-category-bar' },
                      h('button', {
                        type: 'button',
                        className: classNames('wc-staff-pos-category-chip', selectedCategory === 0 && 'is-active'),
                        onClick: function () { setSelectedCategory(0); }
                      }, 'All'),
                      categories.map(function (cat) {
                        return h('button', {
                          key: 'cat-' + cat.id,
                          type: 'button',
                          className: classNames('wc-staff-pos-category-chip', selectedCategory === cat.id && 'is-active'),
                          onClick: function () { setSelectedCategory(cat.id); }
                        }, cat.name);
                      })
                    )
                  : null,

                h('input', {
                  className: 'wc-staff-pos-search',
                  type: 'search',
                  placeholder: 'Search by name or SKU \u2014 scan barcode here',
                  value: productQuery,
                  onChange: function (e) { setProductQuery(e.target.value); },
                  onKeyDown: handleProductSearchKeyDown
                }),

                h('div', { className: 'wc-staff-pos-product-list' },
                  products.map(function (product) {
                    return h(ProductCard, {
                      key: 'product-' + product.id,
                      product: product,
                      active: selectedProductId === product.id,
                      onSelect: setSelectedProductId
                    });
                  })
                ),

                selectedProduct
                  ? h('div', { className: 'wc-staff-pos-product-detail' },
                      h('h3', null, selectedProduct.name),
                      selectedProduct.sku ? h('p', { className: 'wc-staff-pos-meta' }, 'SKU: ' + selectedProduct.sku) : null,
                      h('p', { className: 'wc-staff-pos-price' }, htmlNode(selectedProduct.priceHtml || '')),
                      selectedProduct.stockQuantity !== null && selectedProduct.stockQuantity !== undefined
                        ? h('p', { className: classNames('wc-staff-pos-meta', !selectedProduct.inStock && 'wc-staff-pos-out-of-stock-text') },
                            selectedProduct.inStock ? 'In stock: ' + selectedProduct.stockQuantity : 'Out of stock'
                          )
                        : (!selectedProduct.inStock ? h('p', { className: 'wc-staff-pos-out-of-stock-text wc-staff-pos-meta' }, 'Out of stock') : null),
                      !selectedProduct.isSupported
                        ? h('p', { className: 'wc-staff-pos-warning' }, selectedProduct.unsupportedReason || config.strings.unsupportedProduct)
                        : null,

                      /* Variable attributes */
                      selectedProduct.attributes && selectedProduct.attributes.length
                        ? selectedProduct.attributes.map(function (attr) {
                            return h(Field, { key: attr.slug, label: attr.name },
                              h('select', {
                                value: selectedAttributes['attribute_' + attr.slug] || '',
                                onChange: function (e) { handleAttributeChange('attribute_' + attr.slug, e.target.value); }
                              },
                                [h('option', { key: attr.slug + '-ph', value: '' }, 'Choose ' + attr.name)].concat(
                                  attr.options.map(function (opt) {
                                    return h('option', { key: attr.slug + '-' + opt.value, value: opt.value }, opt.label);
                                  })
                                )
                              )
                            );
                          })
                        : null,

                      selectedVariation
                        ? h('p', { className: 'wc-staff-pos-meta' }, 'Variation ready \u2013 #' + selectedVariation.id)
                        : (selectedProduct.type === 'variable' ? h('p', { className: 'wc-staff-pos-meta' }, 'Choose all options to add this product.') : null),

                      h(Field, { label: 'Quantity' },
                        h('input', {
                          type: 'number', min: 1, value: quantity,
                          onChange: function (e) { setQuantity(Number(e.target.value) || 1); }
                        })
                      ),

                      /* Price override (shown only to authorised users) */
                      canOverridePrice && selectedProduct.isSupported && selectedProduct.inStock
                        ? h('label', { className: 'wc-staff-pos-price-override-toggle' },
                            h('input', {
                              type: 'checkbox', checked: priceOverride,
                              onChange: function (e) {
                                setPriceOverride(e.target.checked);
                                if (!e.target.checked) setCustomPrice('');
                              }
                            }),
                            ' Override price'
                          )
                        : null,
                      priceOverride
                        ? h(Field, { label: 'Custom price' },
                            h('input', {
                              type: 'number', min: 0, step: '0.01', value: customPrice,
                              placeholder: '0.00',
                              onChange: function (e) { setCustomPrice(e.target.value); }
                            })
                          )
                        : null,

                      h('button', {
                        type: 'button',
                        className: 'button button-primary',
                        disabled: !selectedProduct.isSupported || !selectedProduct.inStock || isBusy('add-to-cart') || (selectedProduct.type === 'variable' && !selectedVariation) || (selectedVariation && !selectedVariation.inStock) || (priceOverride && !customPrice),
                        onClick: handleAddToCart
                      }, isBusy('add-to-cart') ? 'Adding\u2026' : 'Add to cart')
                    )
                  : h('p', { className: 'wc-staff-pos-empty-state' }, loading ? 'Loading\u2026' : 'Select a product to configure it.')
              )
            : null,

          /* ---- History view ---- */
          viewMode === 'history'
            ? h('div', null,
                /* Filter bar */
                h('div', { className: 'wc-staff-pos-history-filters' },
                  h('input', {
                    className: 'wc-staff-pos-search',
                    type: 'search',
                    placeholder: 'Filter by customer name, email, or order #',
                    value: historyQuery,
                    onChange: function (e) { setHistoryQuery(e.target.value); }
                  }),
                  h('div', { className: 'wc-staff-pos-history-filter-row' },
                    h('select', {
                      value: historyStatus,
                      onChange: function (e) { setHistoryStatus(e.target.value); }
                    },
                      h('option', { value: '' }, 'All statuses'),
                      h('option', { value: 'completed' }, 'Completed'),
                      h('option', { value: 'processing' }, 'Processing'),
                      h('option', { value: 'pending' }, 'Pending'),
                      h('option', { value: 'refunded' }, 'Refunded')
                    ),
                    h('select', {
                      value: historyTenderFilter,
                      onChange: function (e) { setHistoryTenderFilter(e.target.value); }
                    },
                      [h('option', { key: 'all-tender', value: '' }, 'All methods')].concat(
                        tenderOptions.map(function (t) {
                          return h('option', { key: t.value, value: t.value }, t.label);
                        })
                      )
                    ),
                    h('input', {
                      type: 'date', value: historyDateFrom, title: 'From date',
                      onChange: function (e) { setHistoryDateFrom(e.target.value); }
                    }),
                    h('input', {
                      type: 'date', value: historyDateTo, title: 'To date',
                      onChange: function (e) { setHistoryDateTo(e.target.value); }
                    })
                  )
                ),
                /* Inline refund form */
                refundTarget
                  ? h(RefundPanel, {
                      order: refundTarget,
                      amount: refundAmount,
                      reason: refundReason,
                      busy: isBusy('refund-' + refundTarget.id),
                      onAmountChange: setRefundAmount,
                      onReasonChange: setRefundReason,
                      onConfirm: handleRefund,
                      onCancel: function () { setRefundTarget(null); setRefundAmount(''); setRefundReason(''); }
                    })
                  : null,
                /* Order list */
                h('div', { className: 'wc-staff-pos-history' },
                  historyLoading
                    ? h('p', { className: 'wc-staff-pos-empty-state' }, 'Loading orders\u2026')
                    : filteredHistoryOrders.length
                      ? filteredHistoryOrders.map(function (o) {
                          return h(OrderRow, {
                            key: 'order-' + o.id,
                            order: o,
                            onRefundClick: function (order) {
                              setRefundTarget(order);
                              setRefundAmount(String(order.total || ''));
                              setRefundReason('');
                            }
                          });
                        })
                      : h('p', { className: 'wc-staff-pos-empty-state' }, 'No POS orders found.')
                )
              )
            : null,

          /* ---- Held carts view ---- */
          viewMode === 'held-carts'
            ? h('div', { className: 'wc-staff-pos-held-carts' },
                heldCartsLoading
                  ? h('p', { className: 'wc-staff-pos-empty-state' }, 'Loading\u2026')
                  : heldCarts.length
                    ? heldCarts.map(function (hc) {
                        return h('div', { key: 'hc-' + hc.id, className: 'wc-staff-pos-held-cart-row' },
                          h('div', { className: 'wc-staff-pos-held-cart-info' },
                            h('strong', null, hc.name),
                            h('span', { className: 'wc-staff-pos-meta' }, hc.itemCount + ' item(s) \u2013 ' + hc.createdAt)
                          ),
                          h('div', { className: 'wc-staff-pos-held-cart-actions' },
                            h('button', {
                              type: 'button', className: 'button button-primary button-small',
                              disabled: anyBusy,
                              onClick: function () { handleRestoreHeldCart(hc.id); }
                            }, isBusy('restore-cart-' + hc.id) ? 'Restoring\u2026' : 'Restore'),
                            h('button', {
                              type: 'button', className: 'button button-link-delete button-small',
                              'aria-label': 'Delete held cart ' + hc.name,
                              onClick: function () { handleDeleteHeldCart(hc.id, hc.name); }
                            }, 'Delete')
                          )
                        );
                      })
                    : h('p', { className: 'wc-staff-pos-empty-state' }, 'No held carts. Use \u201cHold cart\u201d in the cart panel to park a cart and start a new one.')
              )
            : null,

          /* ---- Daily report view ---- */
          viewMode === 'reports'
            ? h('div', { className: 'wc-staff-pos-report-view' },
                h('div', { className: 'wc-staff-pos-history-filter-row' },
                  h('input', {
                    type: 'date', value: reportDate,
                    onChange: function (e) { setReportDate(e.target.value); }
                  }),
                  h('button', {
                    type: 'button', className: 'button button-secondary',
                    disabled: reportLoading,
                    onClick: function () { loadDailyReport(reportDate); }
                  }, reportLoading ? 'Loading\u2026' : 'Load report')
                ),
                reportLoading && !report
                  ? h('p', { className: 'wc-staff-pos-empty-state' }, 'Loading\u2026')
                  : report
                    ? h(DailyReport, { report: report })
                    : h('p', { className: 'wc-staff-pos-empty-state' }, 'Select a date and click \u201cLoad report\u201d.')
              )
            : null
        ),

        /* ========== CART PANEL ========== */
        h('section', { className: 'wc-staff-pos-panel' },
          h('div', { className: 'wc-staff-pos-cart-header' },
            h('h2', null, 'Cart'),
            h('div', { className: 'wc-staff-pos-cart-header-actions' },
              hasCartItems
                ? h('button', {
                    type: 'button',
                    className: 'button button-small button-secondary',
                    disabled: anyBusy,
                    onClick: handleHoldCart
                  }, isBusy('hold-cart') ? 'Holding\u2026' : 'Hold cart')
                : null,
              hasCartItems
                ? h('button', {
                    type: 'button',
                    className: 'button button-small button-link-delete',
                    disabled: anyBusy,
                    onClick: handleClearCart
                  }, isBusy('clear-cart') ? 'Clearing\u2026' : 'Clear cart')
                : null
            )
          ),

          hasCartItems
            ? h('div', { className: 'wc-staff-pos-cart-list' },
                cart.items.map(function (item) {
                  return h(CartItem, { key: item.key, item: item, onQuantityChange: handleQuantityChange, onRemove: handleRemoveCartItem });
                })
              )
            : h('p', { className: 'wc-staff-pos-empty-state' }, 'No items in the POS cart yet.'),

          /* Coupon */
          h('div', { className: 'wc-staff-pos-coupon-row' },
            h('input', {
              className: 'wc-staff-pos-coupon-input',
              type: 'text', placeholder: 'Coupon code', value: couponCode,
              onChange: function (e) { setCouponCode(e.target.value); },
              onKeyDown: function (e) { if (e.key === 'Enter') handleApplyCoupon(); }
            }),
            h('button', {
              type: 'button', className: 'button button-secondary',
              disabled: !couponCode || isBusy('apply-coupon'),
              onClick: handleApplyCoupon
            }, isBusy('apply-coupon') ? 'Applying\u2026' : 'Apply')
          ),
          cart.appliedCoupons && cart.appliedCoupons.length
            ? h('div', { className: 'wc-staff-pos-applied-coupons' },
                cart.appliedCoupons.map(function (code) {
                  return h('span', { key: 'coupon-' + code, className: 'wc-staff-pos-coupon-chip' },
                    code,
                    h('button', { type: 'button', className: 'wc-staff-pos-coupon-remove', 'aria-label': 'Remove coupon ' + code, onClick: function () { handleRemoveCoupon(code); } }, '\u00d7')
                  );
                })
              )
            : null,

          /* Discount */
          activeDiscount
            ? h('div', { className: 'wc-staff-pos-active-discount' },
                h('span', null, activeDiscount.label || 'Discount'),
                h('button', {
                  type: 'button', className: 'wc-staff-pos-coupon-remove',
                  'aria-label': 'Remove discount',
                  disabled: isBusy('clear-discount'),
                  onClick: handleClearDiscount
                }, '\u00d7')
              )
            : h('div', { className: 'wc-staff-pos-discount-row' },
                h('select', {
                  className: 'wc-staff-pos-discount-type',
                  value: discountType,
                  onChange: function (e) { setDiscountType(e.target.value); }
                },
                  h('option', { value: 'percent' }, '%'),
                  h('option', { value: 'fixed' }, get_woocommerce_currency_symbol_js())
                ),
                h('input', {
                  type: 'number', min: 0, step: '0.01',
                  className: 'wc-staff-pos-discount-value',
                  placeholder: discountType === 'percent' ? 'e.g. 10' : 'e.g. 5.00',
                  value: discountValue,
                  onChange: function (e) { setDiscountValue(e.target.value); },
                  onKeyDown: function (e) { if (e.key === 'Enter') handleApplyDiscount(); }
                }),
                h('button', {
                  type: 'button', className: 'button button-secondary',
                  disabled: !discountValue || isBusy('apply-discount'),
                  onClick: handleApplyDiscount
                }, isBusy('apply-discount') ? 'Applying\u2026' : 'Discount')
              ),

          /* Totals */
          h('div', { className: 'wc-staff-pos-totals' },
            h('div', null, h('span', null, 'Subtotal'), htmlNode((cart.totals && cart.totals.subtotalHtml) || '')),
            h('div', null, h('span', null, 'Discount'), htmlNode((cart.totals && cart.totals.discountHtml) || '')),
            h('div', null, h('span', null, 'Tax'), htmlNode((cart.totals && cart.totals.taxHtml) || '')),
            h('div', { className: 'is-total' }, h('span', null, 'Total'), htmlNode((cart.totals && cart.totals.totalHtml) || ''))
          ),

          /* Tender type */
          h(Field, { label: 'Payment method' },
            h('select', { value: tenderType, onChange: function (e) { setTenderType(e.target.value); } },
              tenderOptions.map(function (opt) { return h('option', { key: opt.value, value: opt.value }, opt.label); })
            )
          ),

          /* Staff note */
          h(Field, { label: 'Staff note (optional)' },
            h('textarea', {
              className: 'wc-staff-pos-textarea', rows: 2,
              placeholder: 'Internal note attached to the order\u2026',
              value: orderNote,
              onChange: function (e) { setOrderNote(e.target.value); }
            })
          ),

          /* Actions */
          h('div', { className: 'wc-staff-pos-actions' },
            h('button', {
              type: 'button', className: 'button',
              disabled: !hasCartItems || anyBusy,
              onClick: function () { handleCreateOrder('payment_link', false); }
            }, 'Create order'),
            h('button', {
              type: 'button', className: 'button button-secondary',
              disabled: !hasCartItems || anyBusy,
              onClick: function () { handleCreateOrder('payment_link', true); }
            }, 'Send payment link'),
            h('button', {
              type: 'button', className: 'button button-primary',
              disabled: !hasCartItems || anyBusy,
              onClick: function () { handleCreateOrder('manual_paid', false); }
            }, 'Mark paid')
          ),

          /* Order result */
          orderResult
            ? h('div', { className: 'wc-staff-pos-order-result' },
                h('div', { className: 'wc-staff-pos-order-result-header' },
                  h('strong', null, 'Order #' + orderResult.number),
                  h('span', { className: 'wc-staff-pos-badge wc-staff-pos-status-badge' }, orderResult.status)
                ),
                orderResult.paymentUrl
                  ? h('div', { className: 'wc-staff-pos-order-result-links' },
                      h('a', { href: orderResult.paymentUrl, target: '_blank', rel: 'noreferrer' }, 'Open payment link'),
                      h('button', {
                        type: 'button', className: 'button button-secondary wc-staff-pos-copy-btn',
                        onClick: function () { handleCopyLink(orderResult.paymentUrl); }
                      }, 'Copy link')
                    )
                  : null,
                orderResult.editUrl
                  ? h('div', null, h('a', { href: orderResult.editUrl, target: '_blank', rel: 'noreferrer' }, 'Open in WooCommerce'))
                  : null,
                orderResult.receipt
                  ? h('button', {
                      type: 'button', className: 'button button-secondary',
                      onClick: function () { setShowReceipt(function (v) { return !v; }); }
                    }, showReceipt ? 'Hide receipt' : 'Show receipt')
                  : null,
                showReceipt && orderResult.receipt ? h(Receipt, { receipt: orderResult.receipt }) : null,
                h('button', {
                  type: 'button', className: 'button button-primary wc-staff-pos-new-transaction-btn',
                  onClick: handleNewTransaction
                }, 'New transaction')
              )
            : null
        )
      )
    );
  }

  var root = window.document.getElementById('wc-staff-pos-root');
  if (!root) return;

  try {
    if (element.createRoot) {
      element.createRoot(root).render(h(App));
    } else {
      element.render(h(App), root);
    }
  } catch (err) {
    root.innerHTML =
      '<div class="wc-staff-pos-init-error">' +
      '<strong>Staff POS failed to start.</strong> ' + (err && err.message ? err.message : String(err)) +
      '<br><small>Check the browser console (F12) for more details.</small>' +
      '</div>';
  }
})(window, window.wp, window.wcStaffPosConfig);
