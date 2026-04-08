<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WCStaffPOS\Domain\PosCartContext;
use WP_Error;
use WP_REST_Request;

/**
 * Held / parked cart slots.
 *
 * GET    /held-carts          — list saved carts for the current cashier
 * POST   /held-carts          — save the current POS cart under a name
 * POST   /held-carts/{id}/restore — swap the current cart for a held one
 * DELETE /held-carts/{id}     — discard a held cart slot
 */
final class HeldCartsController extends Controller
{
	private PosCartContext $cart_context;

	public function __construct(PosCartContext $cart_context)
	{
		$this->cart_context = $cart_context;
	}

	public function register_routes(): void
	{
		register_rest_route(
			self::NAMESPACE,
			'/held-carts',
			[
				[
					'methods'             => 'GET',
					'callback'            => [$this, 'list_items'],
					'permission_callback' => [$this, 'permissions_check'],
				],
				[
					'methods'             => 'POST',
					'callback'            => [$this, 'create_item'],
					'permission_callback' => [$this, 'permissions_check'],
					'args'                => [
						'name' => [
							'required'          => false,
							'type'              => 'string',
							'sanitize_callback' => 'sanitize_text_field',
							'default'           => '',
						],
					],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/held-carts/(?P<id>[a-zA-Z0-9_.]+)/restore',
			[
				[
					'methods'             => 'POST',
					'callback'            => [$this, 'restore_item'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);

		register_rest_route(
			self::NAMESPACE,
			'/held-carts/(?P<id>[a-zA-Z0-9_.]+)',
			[
				[
					'methods'             => 'DELETE',
					'callback'            => [$this, 'delete_item'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);
	}

	public function list_items(WP_REST_Request $request): array
	{
		unset($request);

		return ['items' => $this->cart_context->list_held_carts()];
	}

	public function create_item(WP_REST_Request $request): array
	{
		$name = (string) ($request->get_param('name') ?: '');

		if ('' === $name) {
			$name = sprintf(
			/* translators: %s: current date/time */
				__('Cart saved %s', 'wc-staff-pos'),
				wp_date(get_option('time_format') ?: 'H:i')
			);
		}

		return $this->cart_context->run(
			function () use ($name): array {
				$entry = $this->cart_context->hold_cart($name);

				return [
					'heldCart' => $entry,
					'cart'     => $this->cart_context->get_snapshot(),
				];
			}
		);
	}

	public function restore_item(WP_REST_Request $request): array|WP_Error
	{
		$id = (string) $request['id'];

		return $this->cart_context->run(
			function () use ($id): array|WP_Error {
				$ok = $this->cart_context->restore_held_cart($id);

				if (! $ok) {
					return new WP_Error(
						'wc_staff_pos_held_cart_not_found',
						__('Held cart not found.', 'wc-staff-pos'),
						['status' => 404]
					);
				}

				// Remove the slot after restoring so it cannot be restored twice.
				$this->cart_context->delete_held_cart($id);

				return ['cart' => $this->cart_context->get_snapshot()];
			}
		);
	}

	public function delete_item(WP_REST_Request $request): array
	{
		$id = (string) $request['id'];
		$this->cart_context->delete_held_cart($id);

		return ['deleted' => true, 'items' => $this->cart_context->list_held_carts()];
	}
}
