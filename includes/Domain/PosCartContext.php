<?php

declare(strict_types=1);

namespace WCStaffPOS\Domain;

use WC_Cart;
use WCStaffPOS\Domain\Adapters\CurrencyContextAdapterInterface;
use WCStaffPOS\Domain\Adapters\ProductConfigurationAdapterInterface;

final class PosCartContext
{
	private const STORAGE_PREFIX = 'wc_staff_pos_state_';

	private const CART_SESSION_KEYS = [
		'cart',
		'cart_totals',
		'applied_coupons',
		'coupon_discount_totals',
		'coupon_discount_tax_totals',
		'removed_cart_contents',
		'order_awaiting_payment',
		'chosen_shipping_methods',
		'shipping_for_package_0',
	];

	private CurrencyContextAdapterInterface $currency_adapter;

	private ProductConfigurationAdapterInterface $product_adapter;

	/**
	 * @var array<string, mixed>
	 */
	private array $original_session = [];

	public function __construct(
		CurrencyContextAdapterInterface $currency_adapter,
		ProductConfigurationAdapterInterface $product_adapter
	) {
		$this->currency_adapter = $currency_adapter;
		$this->product_adapter  = $product_adapter;
	}

	/**
	 * @template T
	 * @param callable():T $callback
	 * @return T
	 */
	public function run(callable $callback)
	{
		$this->ensure_woocommerce();
		$this->currency_adapter->bootstrap();
		$this->original_session = $this->capture_cart_session();

		$existing_notices = function_exists('wc_get_notices') ? wc_get_notices() : [];

		if (function_exists('wc_clear_notices')) {
			wc_clear_notices();
		}

		$this->hydrate_pos_session();

		try {
			$result = $callback();
			$this->persist_pos_session();

			return $result;
		} finally {
			$this->restore_cart_session($this->original_session);

			if (function_exists('wc_clear_notices')) {
				wc_clear_notices();
			}

			if (! empty($existing_notices) && function_exists('wc_set_notices')) {
				wc_set_notices($existing_notices);
			}

			$this->currency_adapter->restore();
		}
	}

	public function get_snapshot(): array
	{
		$items = [];

		foreach (WC()->cart->get_cart() as $key => $item) {
			$product = $item['data'] ?? null;

			if (! $product) {
				continue;
			}

			$items[] = [
				'key'              => $key,
				'productId'        => (int) ($item['product_id'] ?? 0),
				'variationId'      => (int) ($item['variation_id'] ?? 0),
				'name'             => $product->get_name(),
				'type'             => $product->get_type(),
				'quantity'         => (int) ($item['quantity'] ?? 0),
				'price'            => (float) wc_get_price_to_display($product),
				'priceHtml'        => wc_price((float) wc_get_price_to_display($product)),
				'lineSubtotal'     => (float) ($item['line_subtotal'] ?? 0),
				'lineTotal'        => (float) ($item['line_total'] ?? 0),
				'lineSubtotalHtml' => wc_price((float) ($item['line_subtotal'] ?? 0)),
				'lineTotalHtml'    => wc_price((float) ($item['line_total'] ?? 0)),
				'attributes'       => $this->format_attributes((array) ($item['variation'] ?? [])),
			];
		}

		return [
			'items'          => $items,
			'itemCount'      => WC()->cart->get_cart_contents_count(),
			'supportedTypes' => $this->product_adapter->get_supported_types(),
			'appliedCoupons' => WC()->cart->get_applied_coupons(),
			'totals'         => [
				'currencyCode' => get_woocommerce_currency(),
				'subtotal'     => (float) WC()->cart->get_subtotal(),
				'subtotalHtml' => wc_price((float) WC()->cart->get_subtotal()),
				'discount'     => (float) WC()->cart->get_discount_total(),
				'discountHtml' => wc_price((float) WC()->cart->get_discount_total()),
				'tax'          => (float) WC()->cart->get_total_tax(),
				'taxHtml'      => wc_price((float) WC()->cart->get_total_tax()),
				'total'        => (float) WC()->cart->get_total('edit'),
				'totalHtml'    => WC()->cart->get_total(),
			],
			'notices'        => $this->drain_notices(),
		];
	}

	public function drain_notices(): array
	{
		$messages = [];
		$notices  = function_exists('wc_get_notices') ? wc_get_notices() : [];

		foreach ($notices as $type => $entries) {
			foreach ($entries as $entry) {
				$messages[] = [
					'type'    => $type,
					'message' => wp_strip_all_tags((string) ($entry['notice'] ?? '')),
				];
			}
		}

		if (function_exists('wc_clear_notices')) {
			wc_clear_notices();
		}

		return $messages;
	}

	private function ensure_woocommerce(): void
	{
		if (! function_exists('WC') || ! WC()) {
			throw new \RuntimeException('WooCommerce is not available.');
		}

		if (function_exists('wc_load_cart')) {
			wc_load_cart();
		}

		if (! WC()->session && method_exists(WC(), 'initialize_session')) {
			WC()->initialize_session();
		}

		if (! WC()->customer) {
			WC()->customer = new \WC_Customer(get_current_user_id(), true);
		}

		if (! WC()->cart instanceof WC_Cart) {
			WC()->cart = new WC_Cart();
		}
	}

	/**
	 * @return array<string, mixed>
	 */
	private function capture_cart_session(): array
	{
		$session_data = method_exists(WC()->session, 'get_session_data')
			? (array) WC()->session->get_session_data()
			: [];
		$slice        = [];

		foreach (self::CART_SESSION_KEYS as $key) {
			if (array_key_exists($key, $session_data)) {
				$slice[$key] = $session_data[$key];
			}
		}

		return $slice;
	}

	private function hydrate_pos_session(): void
	{
		$stored = WC()->session->get($this->get_storage_key(), []);

		foreach (self::CART_SESSION_KEYS as $key) {
			if (is_array($stored) && array_key_exists($key, $stored)) {
				WC()->session->set($key, $stored[$key]);
			} else {
				WC()->session->__unset($key);
			}
		}

		WC()->cart = new WC_Cart();
		WC()->cart->calculate_totals();
	}

	private function persist_pos_session(): void
	{
		WC()->cart->calculate_totals();
		WC()->session->set($this->get_storage_key(), $this->capture_cart_session());
	}

	/**
	 * @param array<string, mixed> $session_data
	 */
	private function restore_cart_session(array $session_data): void
	{
		foreach (self::CART_SESSION_KEYS as $key) {
			if (array_key_exists($key, $session_data)) {
				WC()->session->set($key, $session_data[$key]);
			} else {
				WC()->session->__unset($key);
			}
		}

		WC()->cart = new WC_Cart();
		WC()->cart->calculate_totals();
	}

	private function get_storage_key(): string
	{
		return self::STORAGE_PREFIX . get_current_user_id();
	}

	/**
	 * @param array<string, string> $attributes
	 * @return array<int, array<string, string>>
	 */
	private function format_attributes(array $attributes): array
	{
		$formatted = [];

		foreach ($attributes as $name => $value) {
			if ('' === $value) {
				continue;
			}

			$label       = str_replace('attribute_', '', $name);
			$formatted[] = [
				'name'  => wc_attribute_label($label),
				'value' => wc_clean((string) $value),
			];
		}

		return $formatted;
	}
}