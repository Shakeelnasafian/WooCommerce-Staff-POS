<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WC_Order;
use WP_REST_Request;

final class ReportsController extends Controller
{
	public function register_routes(): void
	{
		register_rest_route(
			self::NAMESPACE,
			'/reports/daily',
			[
				[
					'methods'             => 'GET',
					'callback'            => [$this, 'get_daily_report'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);
	}

	public function get_daily_report(WP_REST_Request $request): array
	{
		$date = sanitize_text_field((string) ($request->get_param('date') ?: current_time('Y-m-d')));

		// Validate and normalise the date string.
		if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
			$date = current_time('Y-m-d');
		}

		$orders = wc_get_orders([
			'limit'        => -1,
			'date_created' => $date . '...' . $date,
			'meta_query'   => [
				[
					'key'   => '_wc_staff_pos_source',
					'value' => 'staff_pos',
				],
			],
		]);

		$order_count    = 0;
		$total_revenue  = 0.0;
		$tender_totals  = [];
		$cashier_totals = [];

		$paid_statuses = ['completed', 'processing'];

		foreach ($orders as $order) {
			if (! $order instanceof WC_Order) {
				continue;
			}

			$order_count++;
			$status      = $order->get_status();
			$is_paid     = in_array($status, $paid_statuses, true);
			$order_total = (float) $order->get_total();

			if ($is_paid) {
				$total_revenue += $order_total;
			}

			$tender = (string) $order->get_meta('_wc_staff_pos_tender_type');

			if ('' === $tender) {
				$tender = 'other';
			}

			if (! isset($tender_totals[$tender])) {
				$tender_totals[$tender] = ['count' => 0, 'total' => 0.0];
			}

			if ($is_paid) {
				$tender_totals[$tender]['count']++;
				$tender_totals[$tender]['total'] += $order_total;
			}

			$cashier_id = (int) $order->get_meta('_wc_staff_pos_cashier_user_id');

			if ($cashier_id > 0 && $is_paid) {
				if (! isset($cashier_totals[$cashier_id])) {
					$user = get_userdata($cashier_id);
					$cashier_totals[$cashier_id] = [
						'name'  => $user ? $user->display_name : __('Unknown', 'wc-staff-pos'),
						'count' => 0,
						'total' => 0.0,
					];
				}

				$cashier_totals[$cashier_id]['count']++;
				$cashier_totals[$cashier_id]['total'] += $order_total;
			}
		}

		$tender_breakdown = [];

		foreach ($tender_totals as $type => $data) {
			$tender_breakdown[] = [
				'tenderType' => $type,
				'label'      => ucfirst($type),
				'count'      => $data['count'],
				'total'      => $data['total'],
				'totalHtml'  => wc_price($data['total']),
			];
		}

		$cashier_breakdown = [];

		foreach ($cashier_totals as $data) {
			$cashier_breakdown[] = [
				'name'      => $data['name'],
				'count'     => $data['count'],
				'total'     => $data['total'],
				'totalHtml' => wc_price($data['total']),
			];
		}

		return [
			'date'             => $date,
			'orderCount'       => $order_count,
			'totalRevenue'     => $total_revenue,
			'totalRevenueHtml' => wc_price($total_revenue),
			'tenderBreakdown'  => array_values($tender_breakdown),
			'cashierBreakdown' => array_values($cashier_breakdown),
		];
	}
}
