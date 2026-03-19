<?php

declare(strict_types=1);

namespace WCStaffPOS\Domain\Adapters;

use WC_Order;

interface ManualTenderRecorderInterface
{
	public function record(WC_Order $order, string $tender_type, int $cashier_user_id): void;
}
