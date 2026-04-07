<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WC_Product;
use WCStaffPOS\Domain\Adapters\ProductConfigurationAdapterInterface;
use WCStaffPOS\Domain\PosCartContext;
use WP_Error;
use WP_REST_Request;

final class CartController extends Controller
{
	private PosCartContext $cart_context;

	private ProductConfigurationAdapterInterface $product_adapter;

	public function __construct(PosCartContext $cart_context, ProductConfigurationAdapterInterface $product_adapter)
	{
		$this->cart_context    = $cart_context;
		$this->product_adapter = $product_adapter;
	}

	public function register_routes(): void
	{
		register_rest_route(
			self::NAMESPACE,
			'/cart',
			[
				[
					'methods'             => 'GET',
					'callback'            => [$this, 'get_cart'],
					'permission_callback' => [$this, 'permissions_check'],
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [$this, 'clear_cart'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/cart/items',
			[
				[
					'methods'             => 'POST',
					'callback'            => [$this, 'add_item'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/cart/items/(?P<key>[a-zA-Z0-9]+)',
			[
				[
					'methods'             => 'PATCH',
					'callback'            => [$this, 'update_item'],
					'permission_callback' => [$this, 'permissions_check'],
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [$this, 'delete_item'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/cart/coupons',
			[
				[
					'methods'             => 'POST',
					'callback'            => [$this, 'apply_coupon'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/cart/coupons/(?P<code>[^/]+)',
			[
				[
					'methods'             => 'DELETE',
					'callback'            => [$this, 'remove_coupon'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);
	}

	public function get_cart(WP_REST_Request $request): array
	{
		unset($request);

		return [
			'cart' => $this->cart_context->run(
				fn (): array => $this->cart_context->get_snapshot()
			),
		];
	}

	public function add_item(WP_REST_Request $request): array|WP_Error
	{
		$product = wc_get_product((int) $request->get_param('product_id'));

		if (! $product instanceof WC_Product) {
			return new WP_Error(
				'wc_staff_pos_product_not_found',
				__('Product not found.', 'wc-staff-pos'),
				['status' => 404]
			);
		}

		if (! $this->product_adapter->supports($product)) {
			return new WP_Error(
				'wc_staff_pos_unsupported_product',
				__('This product type is not supported in Staff POS yet.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		$payload = $this->product_adapter->normalize_cart_request(
			$product,
			[
				'quantity'            => $request->get_param('quantity'),
				'variation_id'        => $request->get_param('variation_id'),
				'selected_attributes' => $request->get_param('selected_attributes'),
			]
		);

		if (is_wp_error($payload)) {
			return $payload;
		}

		// Optional staff price override (requires wc_staff_pos_price_override cap).
		$custom_price = (float) $request->get_param('custom_price');

		if ($custom_price > 0 && current_user_can('wc_staff_pos_price_override')) {
			$payload['cart_item_data']['_wc_pos_custom_price'] = $custom_price;
		}

		return $this->cart_context->run(
			function () use ($payload): array|WP_Error {
				$result = WC()->cart->add_to_cart(
					(int) $payload['product_id'],
					(int) $payload['quantity'],
					(int) $payload['variation_id'],
					(array) $payload['attributes'],
					(array) $payload['cart_item_data']
				);

				if (! $result) {
					$messages = $this->cart_context->drain_notices();

					return new WP_Error(
						'wc_staff_pos_add_to_cart_failed',
						$messages[0]['message'] ?? __('The product could not be added to the cart.', 'wc-staff-pos'),
						[
							'status'  => 400,
							'notices' => $messages,
						]
					);
				}

				WC()->cart->calculate_totals();

				return ['cart' => $this->cart_context->get_snapshot()];
			}
		);
	}

	public function update_item(WP_REST_Request $request): array|WP_Error
	{
		$key      = sanitize_text_field((string) $request['key']);
		$quantity = max(0, (int) $request->get_param('quantity'));

		return $this->cart_context->run(
			function () use ($key, $quantity): array|WP_Error {
				$updated = WC()->cart->set_quantity($key, $quantity, true);

				if (! $updated) {
					return new WP_Error(
						'wc_staff_pos_cart_item_update_failed',
						__('The cart item could not be updated.', 'wc-staff-pos'),
						['status' => 400]
					);
				}

				WC()->cart->calculate_totals();

				return ['cart' => $this->cart_context->get_snapshot()];
			}
		);
	}

	public function delete_item(WP_REST_Request $request): array|WP_Error
	{
		$key = sanitize_text_field((string) $request['key']);

		return $this->cart_context->run(
			function () use ($key): array|WP_Error {
				$removed = WC()->cart->remove_cart_item($key);

				if (! $removed) {
					return new WP_Error(
						'wc_staff_pos_cart_item_remove_failed',
						__('The cart item could not be removed.', 'wc-staff-pos'),
						['status' => 400]
					);
				}

				WC()->cart->calculate_totals();

				return ['cart' => $this->cart_context->get_snapshot()];
			}
		);
	}

	public function clear_cart(WP_REST_Request $request): array
	{
		unset($request);

		return $this->cart_context->run(
			function (): array {
				WC()->cart->empty_cart();

				return ['cart' => $this->cart_context->get_snapshot()];
			}
		);
	}

	public function apply_coupon(WP_REST_Request $request): array|WP_Error
	{
		$code = wc_format_coupon_code((string) $request->get_param('code'));

		if ('' === $code) {
			return new WP_Error(
				'wc_staff_pos_invalid_coupon_code',
				__('A coupon code is required.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		return $this->cart_context->run(
			function () use ($code): array|WP_Error {
				$applied = WC()->cart->apply_coupon($code);

				if (! $applied) {
					$messages = $this->cart_context->drain_notices();

					return new WP_Error(
						'wc_staff_pos_coupon_apply_failed',
						$messages[0]['message'] ?? __('The coupon could not be applied.', 'wc-staff-pos'),
						[
							'status'  => 400,
							'notices' => $messages,
						]
					);
				}

				WC()->cart->calculate_totals();

				return ['cart' => $this->cart_context->get_snapshot()];
			}
		);
	}

	public function remove_coupon(WP_REST_Request $request): array
	{
		$code = wc_format_coupon_code((string) $request['code']);

		return $this->cart_context->run(
			function () use ($code): array {
				WC()->cart->remove_coupon($code);
				WC()->cart->calculate_totals();

				return ['cart' => $this->cart_context->get_snapshot()];
			}
		);
	}
}