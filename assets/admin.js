(function (window, wp, config) {
  if (!window || !wp || !config) {
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
          type: 'number', min: 0, value: item.quantity,
          onChange: function (e) { props.onQuantityChange(item.key, e.target.value); }
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
            : null
        )
      )
    );
  }

  function App() {
    // Core
    var _a = useState(null), bootstrap = _a[0], setBootstrap = _a[1];
    var _b = useState({ items: [], itemCount: 0, totals: {}, appliedCoupons: [], notices: [] }), cart = _b[0], setCart = _b[1];
    var _p = useState(false), loading = _p[0], setLoading = _p[1];
    var _q = useState(''), busyAction = _q[0], setBusyAction = _q[1];
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

    // Ref to trigger auto-add after product details load (barcode scanner flow)
    var autoAddRef = useRef(false);

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
      request('/bootstrap')
        .then(function (res) {
          setBootstrap(res);
          setCart(res.cart || { items: [], itemCount: 0, totals: {}, appliedCoupons: [], notices: [] });
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
            setBusyAction('add-to-cart');
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
              .finally(function () { setBusyAction(''); });
          } else {
            autoAddRef.current = false;
          }
        })
        .catch(function (err) { setFeedback(err.message || 'Failed to load product details.'); });
    }, [selectedProductId]);

    /* ---- Load order history when panel switches ---- */
    useEffect(function () {
      if (viewMode !== 'history') return;
      setHistoryLoading(true);
      request('/orders?limit=30')
        .then(function (res) { setHistoryOrders(res.items || []); })
        .catch(function (err) { setFeedback(err.message || 'Failed to load order history.'); })
        .finally(function () { setHistoryLoading(false); });
    }, [viewMode]);

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
      setBusyAction('create-customer');
      request('/customers', { method: 'POST', data: customerDraft })
        .then(function (res) {
          handleSelectCustomer(res.item);
          setFeedback('Customer created and selected.');
          setCustomerQuery(res.item.email || res.item.name || '');
        })
        .catch(function (err) { setFeedback(err.message || 'Customer could not be created.'); })
        .finally(function () { setBusyAction(''); });
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
      setBusyAction('add-to-cart');
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
        .finally(function () { setBusyAction(''); });
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
      setBusyAction('clear-cart');
      request('/cart', { method: 'DELETE' })
        .then(function (res) { syncCart(res.cart); setFeedback('Cart cleared.'); })
        .catch(function (err) { setFeedback(err.message || 'Cart could not be cleared.'); })
        .finally(function () { setBusyAction(''); });
    }

    function handleApplyCoupon() {
      if (!couponCode) return;
      setBusyAction('apply-coupon');
      request('/cart/coupons', { method: 'POST', data: { code: couponCode } })
        .then(function (res) { syncCart(res.cart); setCouponCode(''); setFeedback('Coupon applied.'); })
        .catch(function (err) { setFeedback(err.message || 'Coupon could not be applied.'); })
        .finally(function () { setBusyAction(''); });
    }

    function handleRemoveCoupon(code) {
      request('/cart/coupons/' + encodeURIComponent(code), { method: 'DELETE' })
        .then(function (res) { syncCart(res.cart); setFeedback('Coupon removed.'); })
        .catch(function (err) { setFeedback(err.message || 'Coupon could not be removed.'); });
    }

    function buildBillingPayload() {
      return {
        first_name: customerDraft.first_name,
        last_name: customerDraft.last_name,
        email: selectedCustomer ? (selectedCustomer.email || customerDraft.email) : customerDraft.email,
        phone: selectedCustomer ? (selectedCustomer.phone || customerDraft.phone) : customerDraft.phone
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
      setBusyAction(mode + (sendEmail ? '-send' : '-create'));
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
        .finally(function () { setBusyAction(''); });
    }

    function handleNewTransaction() {
      setOrderResult(null);
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
      setFeedback('');
    }

    var tenderOptions = bootstrap && bootstrap.manualTenderTypes && bootstrap.manualTenderTypes.length
      ? bootstrap.manualTenderTypes
      : [{ value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'manual', label: 'Manual' }];

    var hasCartItems = cart && cart.items && cart.items.length > 0;

    /* ======================================================
       Render
    ====================================================== */
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
            h('button', { type: 'button', className: 'wc-staff-pos-banner-close', onClick: function () { setFeedback(''); } }, '\u00d7')
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
            ? h(null, null,
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
                disabled: busyAction === 'create-customer',
                onClick: handleCreateCustomer
              }, busyAction === 'create-customer' ? 'Creating\u2026' : 'Create customer')
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
            }, 'Recent orders')
          ),

          /* ---- Products view ---- */
          viewMode === 'products'
            ? h(null, null,
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
                        disabled: !selectedProduct.isSupported || !selectedProduct.inStock || busyAction === 'add-to-cart' || (selectedProduct.type === 'variable' && !selectedVariation) || (priceOverride && !customPrice),
                        onClick: handleAddToCart
                      }, busyAction === 'add-to-cart' ? 'Adding\u2026' : 'Add to cart')
                    )
                  : h('p', { className: 'wc-staff-pos-empty-state' }, loading ? 'Loading\u2026' : 'Select a product to configure it.')
              )
            : null,

          /* ---- History view ---- */
          viewMode === 'history'
            ? h('div', { className: 'wc-staff-pos-history' },
                historyLoading
                  ? h('p', { className: 'wc-staff-pos-empty-state' }, 'Loading orders\u2026')
                  : historyOrders.length
                    ? historyOrders.map(function (o) { return h(OrderRow, { key: 'order-' + o.id, order: o }); })
                    : h('p', { className: 'wc-staff-pos-empty-state' }, 'No POS orders found.')
              )
            : null
        ),

        /* ========== CART PANEL ========== */
        h('section', { className: 'wc-staff-pos-panel' },
          h('div', { className: 'wc-staff-pos-cart-header' },
            h('h2', null, 'Cart'),
            hasCartItems
              ? h('button', {
                  type: 'button',
                  className: 'button button-link-delete',
                  disabled: !!busyAction,
                  onClick: handleClearCart
                }, busyAction === 'clear-cart' ? 'Clearing\u2026' : 'Clear cart')
              : null
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
              disabled: !couponCode || busyAction === 'apply-coupon',
              onClick: handleApplyCoupon
            }, busyAction === 'apply-coupon' ? 'Applying\u2026' : 'Apply')
          ),
          cart.appliedCoupons && cart.appliedCoupons.length
            ? h('div', { className: 'wc-staff-pos-applied-coupons' },
                cart.appliedCoupons.map(function (code) {
                  return h('span', { key: 'coupon-' + code, className: 'wc-staff-pos-coupon-chip' },
                    code,
                    h('button', { type: 'button', className: 'wc-staff-pos-coupon-remove', title: 'Remove', onClick: function () { handleRemoveCoupon(code); } }, '\u00d7')
                  );
                })
              )
            : null,

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
              disabled: !hasCartItems || !!busyAction,
              onClick: function () { handleCreateOrder('payment_link', false); }
            }, 'Create order'),
            h('button', {
              type: 'button', className: 'button button-secondary',
              disabled: !hasCartItems || !!busyAction,
              onClick: function () { handleCreateOrder('payment_link', true); }
            }, 'Send payment link'),
            h('button', {
              type: 'button', className: 'button button-primary',
              disabled: !hasCartItems || !!busyAction,
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

  if (element.createRoot) {
    element.createRoot(root).render(h(App));
  } else {
    element.render(h(App), root);
  }
})(window, window.wp, window.wcStaffPosConfig);
