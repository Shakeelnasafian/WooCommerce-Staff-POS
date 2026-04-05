<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WC_Order;
use WCStaffPOS\Domain\OrderService;
use WCStaffPOS\Domain\PosCartContext;
use WP_Error;
use WP_REST_Request;

final class OrdersController extends Controller
{
	private PosCartContext $cart_context;

	private OrderService $order_service;

	public function __construct(PosCartContext $cart_context, OrderService $order_service)
	{
		$this->cart_context  = $cart_context;
		$this->order_service = $order_service;
	}

	public function register_routes(): void
	{
		register_rest_route(
			self::NAMESPACE,
			'/orders',
			[
				[
					'methods'             => 'POST',
					'callback'            => [$this, 'create_item'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/orders/(?P<id>\d+)/payment-link',
			[
				[
					'methods'             => 'GET',
					'callback'            => [$this, 'get_payment_link'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);
	}

	public function create_item(WP_REST_Request $request): array|WP_Error
	{
		return $this->cart_context->run(
			fn (): array|WP_Error => $this->order_service->create_order(
				[
					'mode'        => (string) $request->get_param('mode'),
					'send_email'  => rest_sanitize_boolean($request->get_param('send_email')),
					'tender_type' => sanitize_text_field((string) $request->get_param('tender_type')),
					'customer_id' => (int) $request->get_param('customer_id'),
					'billing'     => (array) ($request->get_param('billing') ?: []),
					'note'        => sanitize_textarea_field((string) ($request->get_param('note') ?: '')),
				]
			)
		);
	}

	public function get_payment_link(WP_REST_Request $request): array|WP_Error
	{
		$order = wc_get_order((int) $request['id']);

		if (! $order instanceof WC_Order) {
			return new WP_Error(
				'wc_staff_pos_order_not_found',
				__('Order not found.', 'wc-staff-pos'),
				['status' => 404]
			);
		}

		return [
			'paymentUrl' => $order->get_checkout_payment_url(),
			'orderId'    => $order->get_id(),
		];
	}
}