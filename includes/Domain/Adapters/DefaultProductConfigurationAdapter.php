<?php

declare(strict_types=1);

namespace WCStaffPOS\Domain\Adapters;

use WC_Product;
use WC_Product_Variation;
use WP_Error;

final class DefaultProductConfigurationAdapter implements ProductConfigurationAdapterInterface
{
	public function get_supported_types(): array
	{
		return ['simple', 'variable'];
	}

	public function supports(WC_Product $product): bool
	{
		return in_array($product->get_type(), $this->get_supported_types(), true);
	}

	public function normalize_cart_request(WC_Product $product, array $payload): array|WP_Error
	{
		$quantity = max(1, (int) ($payload['quantity'] ?? 1));

		if ($product->is_type('simple')) {
			return [
				'product_id'     => $product->get_id(),
				'quantity'       => $quantity,
				'variation_id'   => 0,
				'attributes'     => [],
				'cart_item_data' => [],
			];
		}

		if (! $product->is_type('variable')) {
			return new WP_Error(
				'wc_staff_pos_unsupported_product',
				__('This product type is not supported in Staff POS yet.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		$variation_id = absint($payload['variation_id'] ?? 0);

		if ($variation_id <= 0) {
			return new WP_Error(
				'wc_staff_pos_variation_required',
				__('Please choose a valid variation.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		$variation = wc_get_product($variation_id);

		if (! $variation instanceof WC_Product_Variation || $variation->get_parent_id() !== $product->get_id()) {
			return new WP_Error(
				'wc_staff_pos_invalid_variation',
				__('The selected variation is invalid.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		$selected_attributes = is_array($payload['selected_attributes'] ?? null)
			? $payload['selected_attributes']
			: [];
		$attributes          = [];

		foreach ($variation->get_attributes() as $attribute_name => $attribute_value) {
			$key   = str_starts_with($attribute_name, 'attribute_') ? $attribute_name : 'attribute_' . $attribute_name;
			$value = isset($selected_attributes[$key])
				? sanitize_text_field((string) $selected_attributes[$key])
				: sanitize_text_field((string) $attribute_value);

			if ('' === $value) {
				return new WP_Error(
					'wc_staff_pos_missing_attribute',
					__('All variation options must be selected.', 'wc-staff-pos'),
					['status' => 400]
				);
			}

			$attributes[$key] = $value;
		}

		return [
			'product_id'     => $product->get_id(),
			'quantity'       => $quantity,
			'variation_id'   => $variation_id,
			'attributes'     => $attributes,
			'cart_item_data' => [],
		];
	}
}
