<?php

declare(strict_types=1);

namespace WCStaffPOS\Domain\Adapters;

interface CurrencyContextAdapterInterface
{
	public function bootstrap(): void;

	public function restore(): void;
}
