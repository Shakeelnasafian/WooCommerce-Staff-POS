<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WP_REST_Request;
use WP_Term;

final class CategoriesController extends Controller
{
	public function register_routes(): void
	{
		register_rest_route(
			self::NAMESPACE,
			'/categories',
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
		unset($request);

		$terms = get_terms(
			[
				'taxonomy'   => 'product_cat',
				'hide_empty' => true,
				'orderby'    => 'name',
				'order'      => 'ASC',
				'exclude'    => [get_option('default_product_cat')],
			]
		);

		$items = [];

		if (! is_array($terms)) {
			return ['items' => $items];
		}

		foreach ($terms as $term) {
			if (! $term instanceof WP_Term) {
				continue;
			}

			$items[] = [
				'id'    => $term->term_id,
				'name'  => $term->name,
				'slug'  => $term->slug,
				'count' => $term->count,
			];
		}

		return ['items' => $items];
	}
}
