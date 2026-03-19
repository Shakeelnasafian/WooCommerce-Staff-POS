(function (window, wp, config) {
  if (!window || !wp || !config) {
    return;
  }

  var element = wp.element;
  var apiFetch = wp.apiFetch;
  var h = element.createElement;
  var useEffect = element.useEffect;
  var useMemo = element.useMemo;
  var useState = element.useState;

  if (apiFetch && apiFetch.createNonceMiddleware) {
    apiFetch.use(apiFetch.createNonceMiddleware(config.nonce));
  }

  function request(path, options) {
    var base = {
      path: '/wc-pos/v1' + path,
      method: 'GET'
    };

    return apiFetch(Object.assign(base, options || {}));
  }

  function classNames() {
    return Array.prototype.slice.call(arguments).filter(Boolean).join(' ');
  }

  function htmlNode(html) {
    return h('span', { dangerouslySetInnerHTML: { __html: html || '' } });
  }

  function renderNotice(notice, index) {
    return h(
      'div',
      {
        key: 'notice-' + index,
        className: classNames('wc-staff-pos-notice', notice.type)
      },
      notice.message
    );
  }

  function findVariation(product, selectedAttributes) {
    if (!product || !product.variations || !product.variations.length) {
      return null;
    }

    return product.variations.find(function (variation) {
      var keys = Object.keys(variation.attributes || {});
      if (!keys.length) {
        return false;
      }

      return keys.every(function (key) {
        return (selectedAttributes[key] || '') === (variation.attributes[key] || '');
      });
    }) || null;
  }

  function Field(props) {
    return h(
      'label',
      { className: 'wc-staff-pos-field' },
      h('span', { className: 'wc-staff-pos-field-label' }, props.label),
      props.children
    );
  }

  function ProductCard(props) {
    return h(
      'button',
      {
        type: 'button',
        className: classNames('wc-staff-pos-product-card', props.active && 'is-active'),
        onClick: function () {
          props.onSelect(props.product.id);
        }
      },
      h('strong', null, props.product.name),
      h('span', { className: 'wc-staff-pos-meta' }, props.product.type),
      h('span', { className: 'wc-staff-pos-price' }, htmlNode(props.product.priceHtml || '')),
      !props.product.isSupported
        ? h('span', { className: 'wc-staff-pos-badge is-warning' }, 'Unsupported')
        : null
    );
  }

  function CartItem(props) {
    var item = props.item;
    return h(
      'div',
      { className: 'wc-staff-pos-cart-item' },
      h(
        'div',
        { className: 'wc-staff-pos-cart-item-main' },
        h('strong', null, item.name),
        item.attributes && item.attributes.length
          ? h(
              'div',
              { className: 'wc-staff-pos-cart-attributes' },
              item.attributes.map(function (attribute, index) {
                return h(
                  'span',
                  { key: item.key + '-attr-' + index },
                  attribute.name + ': ' + attribute.value
                );
              })
            )
          : null
      ),
      h(
        'div',
        { className: 'wc-staff-pos-cart-item-controls' },
        h('input', {
          type: 'number',
          min: 0,
          value: item.quantity,
          onChange: function (event) {
            props.onQuantityChange(item.key, event.target.value);
          }
        }),
        h('span', { className: 'wc-staff-pos-price' }, htmlNode(item.lineTotalHtml || '')),
        h(
          'button',
          {
            type: 'button',
            className: 'button button-link-delete',
            onClick: function () {
              props.onRemove(item.key);
            }
          },
          'Remove'
        )
      )
    );
  }

  function App() {
    var _a = useState(null),
      bootstrap = _a[0],
      setBootstrap = _a[1];
    var _b = useState({ items: [], itemCount: 0, totals: {}, notices: [] }),
      cart = _b[0],
      setCart = _b[1];
    var _c = useState([]),
      products = _c[0],
      setProducts = _c[1];
    var _d = useState(''),
      productQuery = _d[0],
      setProductQuery = _d[1];
    var _e = useState(null),
      selectedProductId = _e[0],
      setSelectedProductId = _e[1];
    var _f = useState(null),
      selectedProduct = _f[0],
      setSelectedProduct = _f[1];
    var _g = useState({}),
      selectedAttributes = _g[0],
      setSelectedAttributes = _g[1];
    var _h = useState(1),
      quantity = _h[0],
      setQuantity = _h[1];
    var _i = useState([]),
      customers = _i[0],
      setCustomers = _i[1];
    var _j = useState(''),
      customerQuery = _j[0],
      setCustomerQuery = _j[1];
    var _k = useState(null),
      selectedCustomer = _k[0],
      setSelectedCustomer = _k[1];
    var _l = useState({ first_name: '', last_name: '', email: '', phone: '' }),
      customerDraft = _l[0],
      setCustomerDraft = _l[1];
    var _m = useState('cash'),
      tenderType = _m[0],
      setTenderType = _m[1];
    var _n = useState(''),
      feedback = _n[0],
      setFeedback = _n[1];
    var _o = useState(null),
      orderResult = _o[0],
      setOrderResult = _o[1];
    var _p = useState(false),
      loading = _p[0],
      setLoading = _p[1];
    var _q = useState(''),
      busyAction = _q[0],
      setBusyAction = _q[1];

    var selectedVariation = useMemo(function () {
      return findVariation(selectedProduct, selectedAttributes);
    }, [selectedProduct, selectedAttributes]);

    useEffect(function () {
      setLoading(true);
      request('/bootstrap')
        .then(function (response) {
          setBootstrap(response);
          setCart(response.cart || { items: [], itemCount: 0, totals: {}, notices: [] });
        })
        .catch(function (error) {
          setFeedback(error.message || 'Failed to load Staff POS.');
        })
        .finally(function () {
          setLoading(false);
        });
    }, []);

    useEffect(function () {
      var timeout = window.setTimeout(function () {
        request('/products?q=' + encodeURIComponent(productQuery || ''))
          .then(function (response) {
            setProducts(response.items || []);
          })
          .catch(function (error) {
            setFeedback(error.message || 'Failed to load products.');
          });
      }, 250);

      return function () {
        window.clearTimeout(timeout);
      };
    }, [productQuery]);

    useEffect(function () {
      var timeout = window.setTimeout(function () {
        request('/customers?q=' + encodeURIComponent(customerQuery || ''))
          .then(function (response) {
            setCustomers(response.items || []);
          })
          .catch(function (error) {
            setFeedback(error.message || 'Failed to load customers.');
          });
      }, 250);

      return function () {
        window.clearTimeout(timeout);
      };
    }, [customerQuery]);

    useEffect(function () {
      if (!selectedProductId) {
        setSelectedProduct(null);
        setSelectedAttributes({});
        return;
      }

      request('/products/' + selectedProductId)
        .then(function (response) {
          setSelectedProduct(response.item || null);
          setSelectedAttributes({});
          setQuantity(1);
        })
        .catch(function (error) {
          setFeedback(error.message || 'Failed to load product details.');
        });
    }, [selectedProductId]);

    function syncCart(nextCart) {
      setCart(nextCart || { items: [], itemCount: 0, totals: {}, notices: [] });
    }

    function handleCustomerDraftChange(key, value) {
      setCustomerDraft(function (current) {
        return Object.assign({}, current, (function () {
          var patch = {};
          patch[key] = value;
          return patch;
        })());
      });
    }

    function handleCreateCustomer() {
      setBusyAction('create-customer');
      request('/customers', {
        method: 'POST',
        data: customerDraft
      })
        .then(function (response) {
          setSelectedCustomer(response.item);
          setFeedback('Customer created and selected.');
          setCustomerQuery(response.item.email || response.item.name || '');
        })
        .catch(function (error) {
          setFeedback(error.message || 'Customer could not be created.');
        })
        .finally(function () {
          setBusyAction('');
        });
    }

    function handleAttributeChange(name, value) {
      setSelectedAttributes(function (current) {
        return Object.assign({}, current, (function () {
          var patch = {};
          patch[name] = value;
          return patch;
        })());
      });
    }

    function handleAddToCart() {
      if (!selectedProduct) {
        return;
      }

      setBusyAction('add-to-cart');
      request('/cart/items', {
        method: 'POST',
        data: {
          product_id: selectedProduct.id,
          quantity: quantity,
          variation_id: selectedVariation ? selectedVariation.id : 0,
          selected_attributes: selectedAttributes
        }
      })
        .then(function (response) {
          syncCart(response.cart);
          setFeedback('Product added to the POS cart.');
        })
        .catch(function (error) {
          setFeedback(error.message || 'Product could not be added to the cart.');
        })
        .finally(function () {
          setBusyAction('');
        });
    }

    function handleQuantityChange(itemKey, nextQuantity) {
      request('/cart/items/' + itemKey, {
        method: 'PATCH',
        data: { quantity: Number(nextQuantity) }
      })
        .then(function (response) {
          syncCart(response.cart);
        })
        .catch(function (error) {
          setFeedback(error.message || 'Cart item could not be updated.');
        });
    }

    function handleRemoveCartItem(itemKey) {
      request('/cart/items/' + itemKey, { method: 'DELETE' })
        .then(function (response) {
          syncCart(response.cart);
        })
        .catch(function (error) {
          setFeedback(error.message || 'Cart item could not be removed.');
        });
    }

    function buildBillingPayload() {
      if (selectedCustomer) {
        return {
          first_name: customerDraft.first_name,
          last_name: customerDraft.last_name,
          email: selectedCustomer.email || customerDraft.email,
          phone: selectedCustomer.phone || customerDraft.phone
        };
      }

      return customerDraft;
    }

    function maybeCopyLink(link) {
      if (!link || !navigator.clipboard || !navigator.clipboard.writeText) {
        return Promise.resolve();
      }

      return navigator.clipboard.writeText(link).catch(function () {
        return Promise.resolve();
      });
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
          billing: buildBillingPayload()
        }
      })
        .then(function (response) {
          syncCart(response.cart);
          setOrderResult(response.order);
          if (response.order && response.order.paymentUrl) {
            maybeCopyLink(response.order.paymentUrl);
          }
          if (mode === 'manual_paid') {
            setFeedback('Order created and marked paid.');
          } else if (sendEmail) {
            setFeedback('Order created and WooCommerce customer invoice email triggered. Payment link copied when possible.');
          } else {
            setFeedback('Pending order created. Payment link copied when possible.');
          }
        })
        .catch(function (error) {
          setFeedback(error.message || 'Order could not be created.');
        })
        .finally(function () {
          setBusyAction('');
        });
    }

    return h(
      'div',
      { className: 'wc-staff-pos-app' },
      h(
        'header',
        { className: 'wc-staff-pos-header' },
        h('div', null, h('h1', null, config.title || 'Staff POS'), bootstrap && bootstrap.currentUser ? h('p', null, 'Cashier: ' + bootstrap.currentUser.name) : null),
        h('div', { className: 'wc-staff-pos-status' }, cart && cart.itemCount ? cart.itemCount + ' item(s)' : 'Empty cart')
      ),
      feedback ? h('div', { className: 'wc-staff-pos-banner' }, feedback) : null,
      cart && cart.notices && cart.notices.length ? h('div', { className: 'wc-staff-pos-notices' }, cart.notices.map(renderNotice)) : null,
      h(
        'div',
        { className: 'wc-staff-pos-grid' },
        h(
          'section',
          { className: 'wc-staff-pos-panel' },
          h('h2', null, 'Customers'),
          h('input', {
            className: 'wc-staff-pos-search',
            type: 'search',
            placeholder: 'Search customers by name, email, or phone',
            value: customerQuery,
            onChange: function (event) {
              setCustomerQuery(event.target.value);
            }
          }),
          h(
            'div',
            { className: 'wc-staff-pos-customer-results' },
            customers.map(function (customer) {
              return h(
                'button',
                {
                  key: 'customer-' + customer.id,
                  type: 'button',
                  className: classNames('wc-staff-pos-list-item', selectedCustomer && selectedCustomer.id === customer.id && 'is-active'),
                  onClick: function () {
                    setSelectedCustomer(customer);
                    setCustomerDraft(function (current) {
                      return Object.assign({}, current, {
                        email: customer.email || current.email,
                        phone: customer.phone || current.phone
                      });
                    });
                  }
                },
                h('strong', null, customer.name),
                h('span', null, customer.email || 'No email'),
                h('span', null, customer.phone || 'No phone')
              );
            })
          ),
          selectedCustomer
            ? h(
                'div',
                { className: 'wc-staff-pos-selected-customer' },
                h('strong', null, 'Selected customer'),
                h('p', null, selectedCustomer.name),
                h('p', null, selectedCustomer.email || 'No email'),
                h('p', null, selectedCustomer.phone || 'No phone')
              )
            : null,
          h('h3', null, 'Create customer'),
          h(
            'div',
            { className: 'wc-staff-pos-form-grid' },
            h(Field, { label: 'First name' }, h('input', { value: customerDraft.first_name, onChange: function (event) { handleCustomerDraftChange('first_name', event.target.value); } })),
            h(Field, { label: 'Last name' }, h('input', { value: customerDraft.last_name, onChange: function (event) { handleCustomerDraftChange('last_name', event.target.value); } })),
            h(Field, { label: 'Email' }, h('input', { type: 'email', value: customerDraft.email, onChange: function (event) { handleCustomerDraftChange('email', event.target.value); } })),
            h(Field, { label: 'Phone' }, h('input', { value: customerDraft.phone, onChange: function (event) { handleCustomerDraftChange('phone', event.target.value); } }))
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'button button-secondary',
              disabled: busyAction === 'create-customer',
              onClick: handleCreateCustomer
            },
            busyAction === 'create-customer' ? 'Creating...' : 'Create customer'
          )
        ),
        h(
          'section',
          { className: 'wc-staff-pos-panel' },
          h('h2', null, 'Products'),
          h('input', {
            className: 'wc-staff-pos-search',
            type: 'search',
            placeholder: 'Search products',
            value: productQuery,
            onChange: function (event) {
              setProductQuery(event.target.value);
            }
          }),
          h(
            'div',
            { className: 'wc-staff-pos-product-list' },
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
            ? h(
                'div',
                { className: 'wc-staff-pos-product-detail' },
                h('h3', null, selectedProduct.name),
                h('p', { className: 'wc-staff-pos-price' }, htmlNode(selectedProduct.priceHtml || '')),
                selectedProduct.isSupported
                  ? null
                  : h('p', { className: 'wc-staff-pos-warning' }, selectedProduct.unsupportedReason || config.strings.unsupportedProduct),
                selectedProduct.attributes && selectedProduct.attributes.length
                  ? selectedProduct.attributes.map(function (attribute) {
                      return h(
                        Field,
                        { key: attribute.slug, label: attribute.name },
                        h(
                          'select',
                          {
                            value: selectedAttributes['attribute_' + attribute.slug] || '',
                            onChange: function (event) {
                              handleAttributeChange('attribute_' + attribute.slug, event.target.value);
                            }
                          },
                          [h('option', { key: attribute.slug + '-placeholder', value: '' }, 'Choose ' + attribute.name)].concat(
                            attribute.options.map(function (option) {
                              return h('option', { key: attribute.slug + '-' + option.value, value: option.value }, option.label);
                            })
                          )
                        )
                      );
                    })
                  : null,
                selectedVariation
                  ? h('p', { className: 'wc-staff-pos-meta' }, 'Variation ready: #' + selectedVariation.id)
                  : selectedProduct.type === 'variable'
                    ? h('p', { className: 'wc-staff-pos-meta' }, 'Choose all options to add this product.')
                    : null,
                h(
                  Field,
                  { label: 'Quantity' },
                  h('input', {
                    type: 'number',
                    min: 1,
                    value: quantity,
                    onChange: function (event) {
                      setQuantity(Number(event.target.value) || 1);
                    }
                  })
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'button button-primary',
                    disabled: !selectedProduct.isSupported || busyAction === 'add-to-cart' || (selectedProduct.type === 'variable' && !selectedVariation),
                    onClick: handleAddToCart
                  },
                  busyAction === 'add-to-cart' ? 'Adding...' : 'Add to cart'
                )
              )
            : h('p', { className: 'wc-staff-pos-empty-state' }, loading ? 'Loading...' : 'Select a product to configure it.')
        ),
        h(
          'section',
          { className: 'wc-staff-pos-panel' },
          h('h2', null, 'Cart'),
          cart && cart.items && cart.items.length
            ? h(
                'div',
                { className: 'wc-staff-pos-cart-list' },
                cart.items.map(function (item) {
                  return h(CartItem, {
                    key: item.key,
                    item: item,
                    onQuantityChange: handleQuantityChange,
                    onRemove: handleRemoveCartItem
                  });
                })
              )
            : h('p', { className: 'wc-staff-pos-empty-state' }, 'No items in the POS cart yet.'),
          h(
            'div',
            { className: 'wc-staff-pos-totals' },
            h('div', null, h('span', null, 'Subtotal'), htmlNode((cart.totals && cart.totals.subtotalHtml) || '')),
            h('div', null, h('span', null, 'Discount'), htmlNode((cart.totals && cart.totals.discountHtml) || '')),
            h('div', null, h('span', null, 'Tax'), htmlNode((cart.totals && cart.totals.taxHtml) || '')),
            h('div', { className: 'is-total' }, h('span', null, 'Total'), htmlNode((cart.totals && cart.totals.totalHtml) || ''))
          ),
          h(
            Field,
            { label: 'Manual tender type' },
            h(
              'select',
              {
                value: tenderType,
                onChange: function (event) {
                  setTenderType(event.target.value);
                }
              },
              [
                h('option', { key: 'cash', value: 'cash' }, 'Cash'),
                h('option', { key: 'manual', value: 'manual' }, 'Manual')
              ]
            )
          ),
          h(
            'div',
            { className: 'wc-staff-pos-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'button',
                disabled: !cart.items || !cart.items.length || !!busyAction,
                onClick: function () {
                  handleCreateOrder('payment_link', false);
                }
              },
              'Create order'
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'button button-secondary',
                disabled: !cart.items || !cart.items.length || !!busyAction,
                onClick: function () {
                  handleCreateOrder('payment_link', true);
                }
              },
              'Send payment link'
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'button button-primary',
                disabled: !cart.items || !cart.items.length || !!busyAction,
                onClick: function () {
                  handleCreateOrder('manual_paid', false);
                }
              },
              'Mark paid'
            )
          ),
          orderResult
            ? h(
                'div',
                { className: 'wc-staff-pos-order-result' },
                h('strong', null, 'Last order #' + orderResult.number),
                h('p', null, 'Status: ' + orderResult.status),
                orderResult.paymentUrl ? h('p', null, h('a', { href: orderResult.paymentUrl, target: '_blank', rel: 'noreferrer' }, 'Open payment link')) : null,
                orderResult.editUrl ? h('p', null, h('a', { href: orderResult.editUrl }, 'Open order in WooCommerce')) : null
              )
            : null
        )
      )
    );
  }

  var root = window.document.getElementById('wc-staff-pos-root');
  if (!root) {
    return;
  }

  if (element.createRoot) {
    element.createRoot(root).render(h(App));
  } else {
    element.render(h(App), root);
  }
})(window, window.wp, window.wcStaffPosConfig);