<?php

declare(strict_types=1);

namespace WCStaffPOS\Domain\Adapters;

use WC_Product;
use WP_Error;

interface ProductConfigurationAdapterInterface
{
	/**
	 * @return string[]
	 */
	public function get_supported_types(): array;

	public function supports(WC_Product $product): bool;

	/**
	 * @param array<string, mixed> $payload
	 * @return array<string, mixed>|WP_Error
	 */
	public function normalize_cart_request(WC_Product $product, array $payload): array|WP_Error;
}
