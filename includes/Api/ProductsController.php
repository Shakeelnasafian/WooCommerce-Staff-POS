<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WC_Product;
use WC_Product_Attribute;
use WC_Product_Variable;
use WCStaffPOS\Domain\Adapters\ProductConfigurationAdapterInterface;
use WP_Error;
use WP_REST_Request;

final class ProductsController extends Controller
{
	private ProductConfigurationAdapterInterface $product_adapter;

	public function __construct(ProductConfigurationAdapterInterface $product_adapter)
	{
		$this->product_adapter = $product_adapter;
	}

	public function register_routes(): void
	{
		register_rest_route(
			self::NAMESPACE,
			'/products',
			[
				[
					'methods'             => 'GET',
					'callback'            => [$this, 'get_items'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/products/(?P<id>\d+)',
			[
				[
					'methods'             => 'GET',
					'callback'            => [$this, 'get_item'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);
	}

	public function get_items(WP_REST_Request $request): array
	{
		$query = sanitize_text_field((string) $request->get_param('q'));
		$limit = max(1, min(50, (int) ($request->get_param('limit') ?: 20)));

		$posts = get_posts(
			[
				'post_type'      => 'product',
				'post_status'    => 'publish',
				'posts_per_page' => $limit,
				's'              => $query,
				'orderby'        => 'date',
				'order'          => 'DESC',
				'fields'         => 'ids',
			]
		);

		$items = [];

		foreach ($posts as $product_id) {
			$product = wc_get_product($product_id);

			if (! $product instanceof WC_Product) {
				continue;
			}

			$items[] = $this->map_product_summary($product);
		}

		return ['items' => $items];
	}

	public function get_item(WP_REST_Request $request): array|WP_Error
	{
		$product = wc_get_product((int) $request['id']);

		if (! $product instanceof WC_Product) {
			return new WP_Error(
				'wc_staff_pos_product_not_found',
				__('Product not found.', 'wc-staff-pos'),
				['status' => 404]
			);
		}

		return ['item' => $this->map_product_detail($product)];
	}

	private function map_product_summary(WC_Product $product): array
	{
		return [
			'id'          => $product->get_id(),
			'name'        => $product->get_name(),
			'type'        => $product->get_type(),
			'sku'         => $product->get_sku(),
			'price'       => (float) wc_get_price_to_display($product),
			'priceHtml'   => $product->get_price_html(),
			'stockStatus' => $product->get_stock_status(),
			'manageStock' => $product->managing_stock(),
			'inStock'     => $product->is_in_stock(),
			'isSupported' => $this->product_adapter->supports($product),
			'hasOptions'  => $product->is_type('variable'),
			'image'       => wp_get_attachment_image_url((int) $product->get_image_id(), 'thumbnail') ?: '',
			'description' => wp_strip_all_tags($product->get_short_description()),
		];
	}

	private function map_product_detail(WC_Product $product): array
	{
		$detail = $this->map_product_summary($product);

		$detail['unsupportedReason'] = $this->product_adapter->supports($product)
			? ''
			: __('This product type is not supported in Staff POS yet.', 'wc-staff-pos');
		$detail['attributes']        = [];
		$detail['variations']        = [];

		if ($product instanceof WC_Product_Variable) {
			$detail['attributes'] = array_values(
				array_map(
					fn (WC_Product_Attribute $attribute): array => $this->map_attribute($attribute, $product->get_id()),
					$product->get_attributes()
				)
			);

			$detail['variations'] = array_values(
				array_map(
					static fn (array $variation): array => [
						'id'         => (int) $variation['variation_id'],
						'attributes' => (array) ($variation['attributes'] ?? []),
						'price'      => isset($variation['display_price']) ? (float) $variation['display_price'] : 0.0,
						'priceHtml'  => (string) ($variation['price_html'] ?? ''),
						'inStock'    => ! empty($variation['is_in_stock']),
					],
					$product->get_available_variations()
				)
			);
		}

		return $detail;
	}

	private function map_attribute(WC_Product_Attribute $attribute, int $product_id): array
	{
		$options = [];

		if ($attribute->is_taxonomy()) {
			$terms = wc_get_product_terms($product_id, $attribute->get_name(), ['fields' => 'all']);

			foreach ($terms as $term) {
				$options[] = [
					'value' => $term->slug,
					'label' => $term->name,
				];
			}
		} else {
			foreach ($attribute->get_options() as $option) {
				$options[] = [
					'value' => (string) $option,
					'label' => (string) $option,
				];
			}
		}

		return [
			'name'      => wc_attribute_label($attribute->get_name()),
			'slug'      => $attribute->get_name(),
			'isVariant' => $attribute->get_variation(),
			'options'   => $options,
		];
	}
}
