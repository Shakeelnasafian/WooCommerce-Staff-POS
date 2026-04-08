<?php

declare(strict_types=1);

namespace WCStaffPOS\Domain;

use WC_Cart;
use WCStaffPOS\Domain\Adapters\CurrencyContextAdapterInterface;
use WCStaffPOS\Domain\Adapters\ProductConfigurationAdapterInterface;

final class PosCartContext
{
	private const STORAGE_PREFIX = 'wc_staff_pos_state_';

	/** Maximum number of parked carts per user; oldest entry evicted when exceeded. */
	private const MAX_HELD_CARTS = 10;

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
		'wc_pos_cart_discount',
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
				'customPrice'      => isset($item['_wc_pos_custom_price']) ? (float) $item['_wc_pos_custom_price'] : null,
				'attributes'       => $this->format_attributes((array) ($item['variation'] ?? [])),
			];
		}

		return [
			'items'          => $items,
			'itemCount'      => WC()->cart->get_cart_contents_count(),
			'supportedTypes' => $this->product_adapter->get_supported_types(),
			'appliedCoupons' => WC()->cart->get_applied_coupons(),
			'cartDiscount'   => $this->get_cart_discount(),
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

	/* =========================================================
	   Held carts
	========================================================= */

	/**
	 * Save the current POS cart as a named held slot.
	 * Must be called within a run() callback.
	 *
	 * @return array{id: string, name: string, createdAt: string, itemCount: int, totalHtml: string}
	 */
	public function hold_cart(string $name): array
	{
		$id      = uniqid('held_', true);
		$session = $this->capture_cart_session();
		$entry   = [
			'id'        => $id,
			'name'      => $name,
			'createdAt' => current_time('c'),
			'session'   => $session,
			'itemCount' => WC()->cart->get_cart_contents_count(),
			'totalHtml' => WC()->cart->get_total(),
		];

		$held      = $this->get_held_carts_meta();
		$held[$id] = $entry;

		// Evict oldest entries when the per-user cap is exceeded.
		if (count($held) > self::MAX_HELD_CARTS) {
			$held = array_slice($held, -self::MAX_HELD_CARTS, null, true);
		}

		update_user_meta(get_current_user_id(), 'wc_staff_pos_held_carts', $held);

		return $this->map_held_entry($entry);
	}

	/**
	 * Restore a held cart into the active POS session, replacing the current cart.
	 * Must be called within a run() callback.
	 */
	public function restore_held_cart(string $held_id): bool
	{
		$held = $this->get_held_carts_meta();

		if (! isset($held[$held_id])) {
			return false;
		}

		$session_data = (array) ($held[$held_id]['session'] ?? []);

		foreach (self::CART_SESSION_KEYS as $key) {
			if (array_key_exists($key, $session_data)) {
				WC()->session->set($key, $session_data[$key]);
			} else {
				WC()->session->__unset($key);
			}
		}

		WC()->cart = new WC_Cart();
		WC()->cart->calculate_totals();

		return true;
	}

	/**
	 * Delete a held cart slot.
	 */
	public function delete_held_cart(string $held_id): void
	{
		$held = $this->get_held_carts_meta();
		unset($held[$held_id]);
		update_user_meta(get_current_user_id(), 'wc_staff_pos_held_carts', $held);
	}

	/**
	 * @return array<int, array{id: string, name: string, createdAt: string, itemCount: int, totalHtml: string}>
	 */
	public function list_held_carts(): array
	{
		return array_values(
			array_map([$this, 'map_held_entry'], $this->get_held_carts_meta())
		);
	}

	/**
	 * @return array<string, mixed>
	 */
	private function get_held_carts_meta(): array
	{
		$meta = get_user_meta(get_current_user_id(), 'wc_staff_pos_held_carts', true);

		return is_array($meta) ? $meta : [];
	}

	/**
	 * @param array<string, mixed> $entry
	 * @return array{id: string, name: string, createdAt: string, itemCount: int, totalHtml: string}
	 */
	private function map_held_entry(array $entry): array
	{
		return [
			'id'        => (string) ($entry['id'] ?? ''),
			'name'      => (string) ($entry['name'] ?? ''),
			'createdAt' => (string) ($entry['createdAt'] ?? ''),
			'itemCount' => (int) ($entry['itemCount'] ?? 0),
			'totalHtml' => (string) ($entry['totalHtml'] ?? ''),
		];
	}

	/* =========================================================
	   Cart discount helpers (used by CartDiscountController)
	========================================================= */

	/**
	 * Store a discount on the POS session so it survives across requests.
	 * Must be called within a run() callback.
	 *
	 * @param array{type: string, value: float, label: string}|null $discount null to clear
	 */
	public function set_cart_discount(?array $discount): void
	{
		WC()->session->set('wc_pos_cart_discount', $discount);
	}

	/**
	 * @return array{type: string, value: float, label: string}|null
	 */
	public function get_cart_discount(): ?array
	{
		$v = WC()->session->get('wc_pos_cart_discount', null);

		return is_array($v) ? $v : null;
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
