<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WC_Customer;
use WP_Error;
use WP_REST_Request;
use WP_User;
use WP_User_Query;

final class CustomersController extends Controller
{
	public function register_routes(): void
	{
		register_rest_route(
			self::NAMESPACE,
			'/customers',
			[
				[
					'methods'             => 'GET',
					'callback'            => [$this, 'get_items'],
					'permission_callback' => [$this, 'permissions_check'],
				],
				[
					'methods'             => 'POST',
					'callback'            => [$this, 'create_item'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);
	}

	public function get_items(WP_REST_Request $request): array
	{
		$query = sanitize_text_field((string) $request->get_param('q'));
		$limit = max(1, min(25, (int) ($request->get_param('limit') ?: 10)));
		$users = [];

		$user_query = new WP_User_Query(
			[
				'number'         => $limit,
				'orderby'        => 'display_name',
				'order'          => 'ASC',
				'search'         => $query ? '*' . $query . '*' : '',
				'search_columns' => ['user_email', 'display_name', 'user_login'],
			]
		);

		foreach ($user_query->get_results() as $user) {
			if ($user instanceof WP_User) {
				$users[$user->ID] = $user;
			}
		}

		if ($query) {
			$phone_matches = get_users(
				[
					'number'       => $limit,
					'meta_key'     => 'billing_phone',
					'meta_value'   => $query,
					'meta_compare' => 'LIKE',
				]
			);

			foreach ($phone_matches as $user) {
				if ($user instanceof WP_User) {
					$users[$user->ID] = $user;
				}
			}
		}

		return [
			'items' => array_values(
				array_map(
					fn (WP_User $user): array => $this->map_customer($user),
					array_slice($users, 0, $limit)
				)
			),
		];
	}

	public function create_item(WP_REST_Request $request): array|WP_Error
	{
		$email      = sanitize_email((string) $request->get_param('email'));
		$first_name = sanitize_text_field((string) $request->get_param('first_name'));
		$last_name  = sanitize_text_field((string) $request->get_param('last_name'));
		$phone      = sanitize_text_field((string) $request->get_param('phone'));

		if (! is_email($email)) {
			return new WP_Error(
				'wc_staff_pos_invalid_email',
				__('A valid email address is required.', 'wc-staff-pos'),
				['status' => 400]
			);
		}

		$username = sanitize_user(strtok($email, '@') ?: $email, true);

		if ('' === $username) {
			$username = 'customer';
		}

		$customer_id = wc_create_new_customer($email, $username, wp_generate_password(24, true));

		if (is_wp_error($customer_id)) {
			return $customer_id;
		}

		wp_update_user(
			[
				'ID'           => $customer_id,
				'first_name'   => $first_name,
				'last_name'    => $last_name,
				'display_name' => trim($first_name . ' ' . $last_name) ?: $email,
			]
		);

		$customer = new WC_Customer($customer_id);
		$customer->set_first_name($first_name);
		$customer->set_last_name($last_name);
		$customer->set_billing_first_name($first_name);
		$customer->set_billing_last_name($last_name);
		$customer->set_billing_email($email);
		$customer->set_billing_phone($phone);
		$customer->save();

		$user = get_user_by('id', $customer_id);

		if (! $user instanceof WP_User) {
			return new WP_Error(
				'wc_staff_pos_customer_creation_failed',
				__('Customer could not be loaded after creation.', 'wc-staff-pos'),
				['status' => 500]
			);
		}

		return ['item' => $this->map_customer($user)];
	}

	private function map_customer(WP_User $user): array
	{
		$name = trim($user->first_name . ' ' . $user->last_name);

		return [
			'id'    => $user->ID,
			'name'  => $name ?: $user->display_name,
			'email' => $user->user_email,
			'phone' => (string) get_user_meta($user->ID, 'billing_phone', true),
		];
	}
}
