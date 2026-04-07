<?php

declare(strict_types=1);

namespace WCStaffPOS;

use WC_Cart;
use WCStaffPOS\Admin\Page;
use WCStaffPOS\Api\Router;
use WCStaffPOS\Domain\Adapters\DefaultCurrencyContextAdapter;
use WCStaffPOS\Domain\Adapters\DefaultManualTenderRecorder;
use WCStaffPOS\Domain\Adapters\DefaultProductConfigurationAdapter;
use WCStaffPOS\Domain\OrderService;
use WCStaffPOS\Domain\PosCartContext;

final class Plugin
{
	private static ?self $instance = null;

	private bool $booted = false;

	private function __construct()
	{
	}

	public static function instance(): self
	{
		if (null === self::$instance) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	public function boot(): void
	{
		if ($this->booted) {
			return;
		}

		if (! class_exists('WooCommerce')) {
			add_action('admin_notices', [$this, 'render_woocommerce_notice']);
			return;
		}

		$product_adapter = new DefaultProductConfigurationAdapter();
		$cart_context    = new PosCartContext(
			new DefaultCurrencyContextAdapter(),
			$product_adapter
		);
		$order_service   = new OrderService(new DefaultManualTenderRecorder());

		(new Page($product_adapter))->register();
		(new Router($cart_context, $order_service, $product_adapter))->register();

		// Sync the wc_staff_pos capability to the configured roles.
		add_action('init', [$this, 'sync_pos_capability']);

		// Apply any per-line custom price stored in cart item data.
		add_action(
			'woocommerce_before_calculate_totals',
			static function (WC_Cart $cart): void {
				foreach ($cart->get_cart() as $item) {
					if (! empty($item['_wc_pos_custom_price'])) {
						$item['data']->set_price((float) $item['_wc_pos_custom_price']);
					}
				}
			}
		);

		$this->booted = true;
	}

	/**
	 * Keep the wc_staff_pos capability in sync with the roles stored in the
	 * wc_staff_pos_access_roles option. Defaults to administrator + shop_manager.
	 * Only writes to the DB when the capability is actually missing or needs removing.
	 */
	public function sync_pos_capability(): void
	{
		$allowed_roles          = (array) get_option('wc_staff_pos_access_roles', ['administrator', 'shop_manager']);
		$price_override_roles   = (array) get_option('wc_staff_pos_price_override_roles', ['administrator', 'shop_manager']);

		foreach (wp_roles()->get_names() as $role_slug => $role_name) {
			$role = get_role($role_slug);

			if (! $role) {
				continue;
			}

			// Main POS access capability.
			$should_have = in_array($role_slug, $allowed_roles, true);
			$has         = ! empty($role->capabilities['wc_staff_pos']);

			if ($should_have && ! $has) {
				$role->add_cap('wc_staff_pos');
			} elseif (! $should_have && $has) {
				$role->remove_cap('wc_staff_pos');
			}

			// Price override capability.
			$should_override = in_array($role_slug, $price_override_roles, true);
			$has_override    = ! empty($role->capabilities['wc_staff_pos_price_override']);

			if ($should_override && ! $has_override) {
				$role->add_cap('wc_staff_pos_price_override');
			} elseif (! $should_override && $has_override) {
				$role->remove_cap('wc_staff_pos_price_override');
			}
		}
	}

	public function render_woocommerce_notice(): void
	{
		if (! current_user_can('activate_plugins')) {
			return;
		}

		echo '<div class="notice notice-error"><p>';
		echo esc_html__('WooCommerce Staff POS requires WooCommerce to be active.', 'wc-staff-pos');
		echo '</p></div>';
	}
}
