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

		// Distinguish "not signed in" (cookie/nonce rejected, common with
		// security or caching plugins) from "signed in but lacks capability"
		// — same WP_Error otherwise makes debugging near-impossible.
		if (! is_user_logged_in()) {
			return new WP_Error(
				'wc_staff_pos_not_authenticated',
				__('Staff POS could not authenticate your session. A security or caching plugin may be blocking the REST nonce cookie.', 'wc-staff-pos'),
				['status' => 401]
			);
		}

		return new WP_Error(
			'wc_staff_pos_forbidden',
			__('You are not allowed to use Staff POS.', 'wc-staff-pos'),
			['status' => 403]
		);
	}
}
