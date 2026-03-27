<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WCStaffPOS\Domain\PosCartContext;
use WP_Error;
use WP_REST_Request;

final class CouponsController extends Controller
{
	private PosCartContext $cart_context;

	public function __construct(PosCartContext $cart_context)
	{
		$this->cart_context = $cart_context;
	}

	public function register_routes(): void
	{
		register_rest_route(
			self::NAMESPACE,
			'/cart/coupons',
			[
				[
					'methods'             => 'POST',
					'callback'            => [$this, 'apply_coupon'],
					'permission_callback' => [$this, 'permissions_check'],
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [$this, 'remove_coupon'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);
	}

	public function apply_coupon(WP_REST_Request $request): array|WP_Error
	{
		$code = $this->get_coupon_code($request);

		if ('' === $code) {
			return new WP_Error(
				'wc_staff_pos_coupon_required',
				__('Enter a coupon code.', 'wc-staff-pos'),
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

	public function remove_coupon(WP_REST_Request $request): array|WP_Error
	{
		$code = $this->get_coupon_code($request);

		if ('' === $code) {
			return new WP_Error(
				'wc_staff_pos_coupon_required',
				__('Enter a coupon code.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		return $this->cart_context->run(
			function () use ($code): array|WP_Error {
				if (! WC()->cart->has_discount($code)) {
					return new WP_Error(
						'wc_staff_pos_coupon_not_found',
						__('That coupon is not applied to the POS cart.', 'wc-staff-pos'),
						['status' => 404]
					);
				}

				WC()->cart->remove_coupon($code);
				WC()->cart->calculate_totals();

				return ['cart' => $this->cart_context->get_snapshot()];
			}
		);
	}

	private function get_coupon_code(WP_REST_Request $request): string
	{
		return function_exists('wc_format_coupon_code')
			? wc_format_coupon_code((string) $request->get_param('code'))
			: sanitize_text_field((string) $request->get_param('code'));
	}
}
