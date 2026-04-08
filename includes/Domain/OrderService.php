<?php

declare(strict_types=1);

namespace WCStaffPOS\Domain;

use WC_Customer;
use WC_Email_Customer_Invoice;
use WC_Order;
use WC_Order_Item_Fee;
use WCStaffPOS\Domain\Adapters\ManualTenderRecorderInterface;
use WP_Error;

final class OrderService
{
	private ManualTenderRecorderInterface $manual_tender_recorder;

	public function __construct(ManualTenderRecorderInterface $manual_tender_recorder)
	{
		$this->manual_tender_recorder = $manual_tender_recorder;
	}

	/**
	 * @param array<string, mixed> $payload
	 */
	public function create_order(array $payload): array|WP_Error
	{
		$mode = (string) ($payload['mode'] ?? '');

		if (! in_array($mode, ['payment_link', 'manual_paid'], true)) {
			return new WP_Error(
				'wc_staff_pos_invalid_order_mode',
				__('The selected order mode is invalid.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		if (0 === WC()->cart->get_cart_contents_count()) {
			return new WP_Error(
				'wc_staff_pos_empty_cart',
				__('Add at least one product before creating an order.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		$customer_id = absint($payload['customer_id'] ?? 0);
		$billing     = $this->build_billing_payload((array) ($payload['billing'] ?? []), $customer_id);

		if ('payment_link' === $mode && empty($billing['billing_email'])) {
			return new WP_Error(
				'wc_staff_pos_missing_billing_email',
				__('Payment link orders require a customer email address.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		// Build the order directly from the cart, bypassing WC checkout hooks/validation.
		$order = $this->build_order_from_cart($customer_id);

		if (is_wp_error($order)) {
			return $order;
		}

		$order->set_created_via('staff-pos');
		$order->update_meta_data('_wc_staff_pos_source', 'staff_pos');
		$order->update_meta_data('_wc_staff_pos_cashier_user_id', get_current_user_id());

		$this->apply_billing_to_order($order, $billing);

		$note = sanitize_textarea_field((string) ($payload['note'] ?? ''));

		if ('' !== $note) {
			$order->add_order_note($note, 0, true);
		}

		// Finalize order data before triggering any side effects (emails, payment
		// state changes) so that all side-effect hooks operate on a complete order.
		$order->calculate_totals(true);
		$order->save();

		if ('payment_link' === $mode) {
			// Set meta before update_status() so the internal save persists it even
			// when send_email is false and there is no subsequent explicit save().
			$order->update_meta_data('_wc_staff_pos_payment_link_generated_at', current_time('mysql', true));
			$order->update_status('pending', __('Payment link prepared by Staff POS.', 'wc-staff-pos'));

			if (! empty($payload['send_email'])) {
				$this->send_customer_invoice($order);
				$order->update_meta_data('_wc_staff_pos_payment_link_sent_at', current_time('mysql', true));
				$order->save();
			}
		}

		$tender_type = '';

		if ('manual_paid' === $mode) {
			$tender_type = sanitize_key((string) ($payload['tender_type'] ?? 'cash')) ?: 'cash';
			$this->manual_tender_recorder->record($order, $tender_type, get_current_user_id());
			$order->set_payment_method('staff_pos_manual');
			$order->set_payment_method_title(__('Staff POS Manual Payment', 'wc-staff-pos'));
			$order->payment_complete();
		}

		// Capture receipt data before emptying the cart.
		$receipt = 'manual_paid' === $mode ? $this->build_receipt($order, $tender_type) : null;

		WC()->cart->empty_cart();

		return [
			'order' => [
				'id'         => $order->get_id(),
				'number'     => $order->get_order_number(),
				'status'     => $order->get_status(),
				'editUrl'    => $order->get_edit_order_url(),
				'paymentUrl' => $order->needs_payment() ? $order->get_checkout_payment_url() : '',
				'receipt'    => $receipt,
			],
			'cart'  => [
				'items'          => [],
				'itemCount'      => 0,
				'appliedCoupons' => [],
				'totals'         => [
					'currencyCode' => get_woocommerce_currency(),
					'subtotal'     => 0,
					'subtotalHtml' => wc_price(0),
					'discount'     => 0,
					'discountHtml' => wc_price(0),
					'tax'          => 0,
					'taxHtml'      => wc_price(0),
					'total'        => 0,
					'totalHtml'    => wc_price(0),
				],
				'notices'        => [],
			],
		];
	}

	/**
	 * Create a WC_Order directly from the current WC cart, without going through
	 * WC_Checkout::create_order() and its validation/hook pipeline.
	 */
	private function build_order_from_cart(int $customer_id): WC_Order|WP_Error
	{
		try {
			$order = wc_create_order(['customer_id' => $customer_id, 'created_via' => 'staff-pos']);
		} catch (\Throwable $throwable) {
			wc_get_logger()->error(
				'Staff POS order creation failed: ' . $throwable->getMessage(),
				['source' => 'wc-staff-pos']
			);

			return new WP_Error(
				'wc_staff_pos_order_creation_exception',
				__('The order could not be created. Please try again.', 'wc-staff-pos'),
				['status' => 500]
			);
		}

		if (is_wp_error($order)) {
			return $order;
		}

		// Add cart line items.
		foreach (WC()->cart->get_cart() as $cart_item) {
			$order->add_product(
				$cart_item['data'],
				$cart_item['quantity'],
				[
					'variation' => $cart_item['variation'] ?? [],
					'totals'    => [
						'subtotal'     => $cart_item['line_subtotal'],
						'subtotal_tax' => $cart_item['line_subtotal_tax'],
						'total'        => $cart_item['line_total'],
						'tax'          => $cart_item['line_tax'],
						'tax_data'     => $cart_item['line_tax_data'],
					],
				]
			);
		}

		// Apply coupons — roll back and abort if any coupon is rejected.
		foreach (WC()->cart->get_applied_coupons() as $code) {
			$result = $order->apply_coupon($code);

			if (is_wp_error($result)) {
				$order->delete(true);

				return new WP_Error(
					'wc_staff_pos_coupon_error',
					sprintf(
					/* translators: %1$s: coupon code, %2$s: error message */
						__('Coupon "%1$s" could not be applied: %2$s', 'wc-staff-pos'),
						esc_html($code),
						$result->get_error_message()
					),
					['status' => 422]
				);
			}
		}

		// Add cart fees (e.g. surcharges added by third-party plugins).
		foreach (WC()->cart->get_fees() as $fee) {
			$item = new WC_Order_Item_Fee();
			$item->set_name($fee->name);
			$item->set_total($fee->total);
			$item->set_total_tax($fee->tax);

			if (! empty($fee->tax_data)) {
				$item->set_taxes(['total' => $fee->tax_data]);
			}

			$order->add_item($item);
		}

		$order->set_cart_hash(WC()->cart->get_cart_hash());

		return $order;
	}

	/**
	 * @param array<string, mixed> $billing
	 * @return array<string, string>
	 */
	private function build_billing_payload(array $billing, int $customer_id): array
	{
		$defaults = [
			'billing_first_name' => '',
			'billing_last_name'  => '',
			'billing_email'      => '',
			'billing_phone'      => '',
		];

		if ($customer_id > 0) {
			$customer = new WC_Customer($customer_id);
			$defaults = [
				'billing_first_name' => $customer->get_billing_first_name() ?: $customer->get_first_name(),
				'billing_last_name'  => $customer->get_billing_last_name() ?: $customer->get_last_name(),
				'billing_email'      => $customer->get_billing_email() ?: $customer->get_email(),
				'billing_phone'      => $customer->get_billing_phone(),
			];
		}

		return [
			'billing_first_name' => sanitize_text_field((string) ($billing['first_name'] ?? $defaults['billing_first_name'])),
			'billing_last_name'  => sanitize_text_field((string) ($billing['last_name'] ?? $defaults['billing_last_name'])),
			'billing_email'      => sanitize_email((string) ($billing['email'] ?? $defaults['billing_email'])),
			'billing_phone'      => sanitize_text_field((string) ($billing['phone'] ?? $defaults['billing_phone'])),
		];
	}

	/**
	 * @param array<string, string> $billing
	 */
	private function apply_billing_to_order(WC_Order $order, array $billing): void
	{
		$order->set_billing_first_name($billing['billing_first_name'] ?? '');
		$order->set_billing_last_name($billing['billing_last_name'] ?? '');
		$order->set_billing_email($billing['billing_email'] ?? '');
		$order->set_billing_phone($billing['billing_phone'] ?? '');
	}

	/**
	 * Build a receipt data structure for a completed manual_paid order.
	 *
	 * @return array<string, mixed>
	 */
	private function build_receipt(WC_Order $order, string $tender_type): array
	{
		$items = [];

		foreach ($order->get_items() as $item) {
			$items[] = [
				'name'        => $item->get_name(),
				'quantity'    => $item->get_quantity(),
				'totalHtml'   => wc_price((float) $item->get_total()),
			];
		}

		$tender_labels = [];
		$stored        = get_option('wc_staff_pos_tender_types', '');

		if ('' !== $stored) {
			$decoded = json_decode($stored, true);

			if (is_array($decoded)) {
				foreach ($decoded as $t) {
					$tender_labels[$t['value']] = $t['label'];
				}
			}
		}

		$tender_labels += ['cash' => 'Cash', 'card' => 'Card', 'cheque' => 'Cheque'];

		// POS discounts are applied as negative fee items, not order coupons.
		// Sum them separately so the receipt shows the full discount.
		$fee_discount = 0.0;

		foreach ($order->get_fees() as $fee) {
			if ((float) $fee->get_total() < 0) {
				$fee_discount += abs((float) $fee->get_total());
			}
		}

		$discount_total = (float) $order->get_total_discount() + $fee_discount;

		return [
			'storeName'    => get_bloginfo('name'),
			'orderNumber'  => $order->get_order_number(),
			'date'         => $order->get_date_created() ? $order->get_date_created()->date_i18n(get_option('date_format') . ' ' . get_option('time_format')) : '',
			'cashier'      => wp_get_current_user()->display_name,
			'customerName' => trim($order->get_formatted_billing_full_name()) ?: __('Guest', 'wc-staff-pos'),
			'items'        => $items,
			'subtotalHtml' => wc_price((float) $order->get_subtotal()),
			'discountHtml' => $discount_total > 0 ? wc_price($discount_total) : '',
			'taxHtml'      => wc_price((float) $order->get_total_tax()),
			'totalHtml'    => wc_price((float) $order->get_total()),
			'tenderType'   => $tender_labels[$tender_type] ?? $tender_type,
		];
	}

	private function send_customer_invoice(WC_Order $order): void
	{
		$mailer = WC()->mailer();
		$emails = $mailer ? $mailer->get_emails() : [];

		foreach ($emails as $email) {
			if ($email instanceof WC_Email_Customer_Invoice) {
				$email->trigger($order->get_id(), $order);
				break;
			}
		}
	}
}
