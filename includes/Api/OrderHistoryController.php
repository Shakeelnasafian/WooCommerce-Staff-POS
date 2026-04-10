<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WC_Order;
use WP_REST_Request;

final class OrderHistoryController extends Controller
{
	public function register_routes(): void
	{
		register_rest_route(
			self::NAMESPACE,
			'/orders',
			[
				[
					'methods'             => 'GET',
					'callback'            => [$this, 'get_items'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);
	}

	public function get_items(WP_REST_Request $request): array
	{
		$limit       = max(1, min(100, (int) ($request->get_param('limit') ?: 50)));
		$cashier_id  = absint($request->get_param('cashier_id'));
		$status      = sanitize_key((string) ($request->get_param('status') ?: ''));
		$tender_type = sanitize_key((string) ($request->get_param('tender_type') ?: ''));
		$date_from   = sanitize_text_field((string) ($request->get_param('date_from') ?: ''));
		$date_to     = sanitize_text_field((string) ($request->get_param('date_to') ?: ''));

		$query_args = [
			'limit'      => $limit,
			'orderby'    => 'date',
			'order'      => 'DESC',
			'meta_query' => [
				[
					'key'   => '_wc_staff_pos_source',
					'value' => 'staff_pos',
				],
			],
		];

		// Optionally narrow to orders created by the requesting cashier.
		if ($cashier_id > 0) {
			$query_args['meta_query'][] = [
				'key'   => '_wc_staff_pos_cashier_user_id',
				'value' => (string) $cashier_id,
			];
		}

		// Status filter — validated against registered WC statuses.
		if ('' !== $status) {
			$valid_statuses = array_keys(wc_get_order_statuses());

			if (in_array('wc-' . $status, $valid_statuses, true)) {
				$query_args['status'] = $status;
			}
		}

		// Tender type filter.
		if ('' !== $tender_type) {
			$query_args['meta_query'][] = [
				'key'   => '_wc_staff_pos_tender_type',
				'value' => $tender_type,
			];
		}

		// Date range filter (site-timezone dates, WC resolves the range).
		if ('' !== $date_from && '' !== $date_to) {
			$query_args['date_created'] = $date_from . '...' . $date_to;
		} elseif ('' !== $date_from) {
			$query_args['date_created'] = '>=' . $date_from;
		} elseif ('' !== $date_to) {
			$query_args['date_created'] = '<=' . $date_to;
		}

		$orders = wc_get_orders($query_args);
		$items  = [];

		foreach ($orders as $order) {
			if (! $order instanceof WC_Order) {
				continue;
			}

			$first = $order->get_billing_first_name();
			$last  = $order->get_billing_last_name();

			$items[] = [
				'id'           => $order->get_id(),
				'number'       => $order->get_order_number(),
				'status'       => $order->get_status(),
				'customerName' => trim($first . ' ' . $last) ?: __('Guest', 'wc-staff-pos'),
				'email'        => $order->get_billing_email(),
				'total'        => (float) $order->get_total(),
				'totalHtml'    => wc_price($order->get_total()),
				'date'         => $order->get_date_created()
					? $order->get_date_created()->date_i18n(get_option('date_format') . ' ' . get_option('time_format'))
					: '',
				'tenderType'   => (string) $order->get_meta('_wc_staff_pos_tender_type'),
				'editUrl'      => $order->get_edit_order_url(),
				'paymentUrl'   => $order->needs_payment() ? $order->get_checkout_payment_url() : '',
			];
		}

		return ['items' => $items];
	}
}
