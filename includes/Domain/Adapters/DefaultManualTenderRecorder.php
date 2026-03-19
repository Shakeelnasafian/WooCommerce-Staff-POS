<?php

declare(strict_types=1);

namespace WCStaffPOS\Domain\Adapters;

use WC_Order;

final class DefaultManualTenderRecorder implements ManualTenderRecorderInterface
{
	public function record(WC_Order $order, string $tender_type, int $cashier_user_id): void
	{
		$cashier_name = '';
		$cashier      = get_user_by('id', $cashier_user_id);

		if ($cashier) {
			$cashier_name = $cashier->display_name;
		}

		$order->update_meta_data('_wc_staff_pos_tender_type', $tender_type);
		$order->add_order_note(
			sprintf(
				/* translators: 1: tender type, 2: cashier name */
				__('Marked paid in Staff POS using %1$s by %2$s.', 'wc-staff-pos'),
				$tender_type,
				$cashier_name ?: __('staff', 'wc-staff-pos')
			)
		);
	}
}
