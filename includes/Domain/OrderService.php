<?php

declare(strict_types=1);

namespace WCStaffPOS\Domain;

use WC_Customer;
use WC_Email_Customer_Invoice;
use WC_Order;
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

		$checkout_data = array_merge(
			$billing,
			[
				'createaccount'             => false,
				'ship_to_different_address' => false,
			]
		);

		if ('manual_paid' === $mode) {
			$checkout_data['payment_method']       = 'staff_pos_manual';
			$checkout_data['payment_method_title'] = __('Staff POS Manual Payment', 'wc-staff-pos');
		}

		try {
			$order_id = WC()->checkout()->create_order($checkout_data);
		} catch (\Throwable $throwable) {
			return new WP_Error(
				'wc_staff_pos_order_creation_exception',
				$throwable->getMessage(),
				['status' => 500]
			);
		}

		if (is_wp_error($order_id)) {
			return $order_id;
		}

		$order = wc_get_order($order_id);

		if (! $order instanceof WC_Order) {
			return new WP_Error(
				'wc_staff_pos_order_not_found',
				__('Order could not be loaded after creation.', 'wc-staff-pos'),
				['status' => 500]
			);
		}

		$order->set_created_via('staff-pos');
		$order->update_meta_data('_wc_staff_pos_source', 'staff_pos');
		$order->update_meta_data('_wc_staff_pos_cashier_user_id', get_current_user_id());

		if ($customer_id > 0) {
			$order->set_customer_id($customer_id);
		}

		$this->apply_billing_to_order($order, $billing);

		if ('payment_link' === $mode) {
			$order->update_status('pending', __('Payment link prepared by Staff POS.', 'wc-staff-pos'));
			$order->update_meta_data('_wc_staff_pos_payment_link_generated_at', current_time('mysql', true));

			if (! empty($payload['send_email'])) {
				$this->send_customer_invoice($order);
				$order->update_meta_data('_wc_staff_pos_payment_link_sent_at', current_time('mysql', true));
			}
		}

		if ('manual_paid' === $mode) {
			$tender_type = sanitize_key((string) ($payload['tender_type'] ?? 'cash')) ?: 'cash';
			$this->manual_tender_recorder->record($order, $tender_type, get_current_user_id());
			$order->set_payment_method('staff_pos_manual');
			$order->set_payment_method_title(__('Staff POS Manual Payment', 'wc-staff-pos'));
			$order->payment_complete();
		}

		$order->calculate_totals(true);
		$order->save();
		WC()->cart->empty_cart();

		return [
			'order' => [
				'id'         => $order->get_id(),
				'number'     => $order->get_order_number(),
				'status'     => $order->get_status(),
				'editUrl'    => admin_url('post.php?post=' . $order->get_id() . '&action=edit'),
				'paymentUrl' => $order->needs_payment() ? $order->get_checkout_payment_url() : '',
			],
			'cart'  => [
				'items'     => [],
				'itemCount' => 0,
				'coupons'   => [],
				'totals'    => [
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
				'notices'   => [],
			],
		];
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
