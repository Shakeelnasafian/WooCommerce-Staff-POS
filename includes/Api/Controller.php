<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WP_Error;
use WP_REST_Request;

abstract class Controller
{
	protected const NAMESPACE = 'wc-pos/v1';

	abstract public function register_routes(): void;

	public function permissions_check(WP_REST_Request $request): bool|WP_Error
	{
		unset($request);

		if (current_user_can('wc_staff_pos')) {
			return true;
		}

		return new WP_Error(
			'wc_staff_pos_forbidden',
			__('You are not allowed to use Staff POS.', 'wc-staff-pos'),
			['status' => 403]
		);
	}
}
