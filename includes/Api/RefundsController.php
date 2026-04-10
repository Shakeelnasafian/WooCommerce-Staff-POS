<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WP_REST_Request;
use WP_Error;

final class RefundsController extends Controller
{
	public function register_routes(): void
	{
		register_rest_route(
			self::NAMESPACE,
			'/orders/(?P<id>\d+)/refund',
			[
				[
					'methods'             => 'POST',
					'callback'            => [$this, 'create_refund'],
					'permission_callback' => [$this, 'permissions_check'],
					'args'                => [
						'id' => [
							'required'          => true,
							'sanitize_callback' => 'absint',
						],
					],
				],
			]
		);
	}

	public function create_refund(WP_REST_Request $request): array|WP_Error
	{
		$order_id = absint($request->get_param('id'));
		$order    = wc_get_order($order_id);

		if (! $order) {
			return new WP_Error(
				'wc_staff_pos_not_found',
				__('Order not found.', 'wc-staff-pos'),
				['status' => 404]
			);
		}

		// Only allow refunding POS orders.
		if ('staff_pos' !== $order->get_meta('_wc_staff_pos_source')) {
			return new WP_Error(
				'wc_staff_pos_not_pos_order',
				__('This order was not created via Staff POS.', 'wc-staff-pos'),
				['status' => 403]
			);
		}

		$max_refundable = (float) wc_format_decimal($order->get_total() - $order->get_total_refunded());

		if ($max_refundable <= 0) {
			return new WP_Error(
				'wc_staff_pos_already_refunded',
				__('This order has already been fully refunded.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		$raw_amount = $request->get_param('amount');
		$amount     = $raw_amount !== null
			? min((float) $raw_amount, $max_refundable)
			: $max_refundable;

		if ($amount <= 0) {
			return new WP_Error(
				'wc_staff_pos_invalid_refund_amount',
				__('Refund amount must be greater than zero.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		$reason = sanitize_textarea_field((string) ($request->get_param('reason') ?? ''));

		$refund = wc_create_refund([
			'amount'         => $amount,
			'reason'         => $reason,
			'order_id'       => $order_id,
			'line_items'     => [],
			'refund_payment' => false,
			'restock_items'  => false,
		]);

		if (is_wp_error($refund)) {
			wc_get_logger()->error(
				'Staff POS refund failed for order ' . $order_id . ': ' . $refund->get_error_message(),
				['source' => 'wc-staff-pos']
			);

			return new WP_Error(
				'wc_staff_pos_refund_failed',
				__('The refund could not be processed. Please try again.', 'wc-staff-pos'),
				['status' => 500]
			);
		}

		// Reload the order to reflect updated status and totals.
		$order = wc_get_order($order_id);

		return [
			'refund' => [
				'id'         => $refund->get_id(),
				'amountHtml' => wc_price($amount),
				'reason'     => $reason,
			],
			'order'  => [
				'id'     => $order->get_id(),
				'number' => $order->get_order_number(),
				'status' => $order->get_status(),
			],
		];
	}
}
