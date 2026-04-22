<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WCStaffPOS\Domain\PosCartContext;
use WP_Error;
use WP_REST_Request;

/**
 * Whole-cart discount.
 *
 * POST   /cart/discount  — set a percentage or fixed discount
 * DELETE /cart/discount  — clear the active discount
 */
final class CartDiscountController extends Controller
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
			'/cart/discount',
			[
				[
					'methods'             => 'POST',
					'callback'            => [$this, 'set_discount'],
					'permission_callback' => [$this, 'permissions_check'],
					'args'                => [
						'type'  => [
							'required' => true,
							'type'     => 'string',
							'enum'     => ['percent', 'fixed'],
						],
						'value' => [
							'required' => true,
							'type'     => 'number',
							'minimum'  => 0,
						],
						'label' => [
							'required'          => false,
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
							'default'           => '',
						],
					],
				],
				[
					'methods'             => 'DELETE',
					'callback'            => [$this, 'clear_discount'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);
	}

	public function set_discount(WP_REST_Request $request): array|WP_Error
	{
		$type  = sanitize_key((string) $request->get_param('type'));
		$value = (float) $request->get_param('value');
		$label = (string) ($request->get_param('label') ?: '');

		if ('' === $label) {
			$label = 'percent' === $type
				? sprintf(__('%s%% Discount', 'wc-staff-pos'), number_format_i18n($value, 0))
				: sprintf(__('%s Discount', 'wc-staff-pos'), wp_strip_all_tags(wc_price($value)));
		}

		return $this->cart_context->run(
			function () use ($type, $value, $label): array {
				$this->cart_context->set_cart_discount(['type' => $type, 'value' => $value, 'label' => $label]);

				return ['cart' => $this->cart_context->get_snapshot()];
			}
		);
	}

	public function clear_discount(WP_REST_Request $request): array|WP_Error
	{
		unset($request);

		return $this->cart_context->run(
			function (): array {
				$this->cart_context->set_cart_discount(null);

				return ['cart' => $this->cart_context->get_snapshot()];
			}
		);
	}
}
