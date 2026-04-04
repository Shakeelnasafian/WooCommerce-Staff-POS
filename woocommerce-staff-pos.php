<?php
/**
 * Plugin Name: WooCommerce Staff POS
 * Description: Staff-facing assisted checkout for WooCommerce with a dedicated POS cart, customer lookup, and payment link/manual payment order flows.
 * Version: 0.1.0
 * Author: Shakeel Ahmad
 * Requires Plugins: woocommerce
 * Requires at least: 6.4
 * Requires PHP: 8.1
 * Text Domain: wc-staff-pos
 */

declare(strict_types=1);

defined('ABSPATH') || exit;

define('WC_STAFF_POS_FILE', __FILE__);
define('WC_STAFF_POS_PATH', plugin_dir_path(__FILE__));
define('WC_STAFF_POS_URL', plugin_dir_url(__FILE__));
define('WC_STAFF_POS_VERSION', '0.1.0');

// Declare WooCommerce feature compatibility before WooCommerce initialises.
add_action(
	'before_woocommerce_init',
	static function (): void {
		if (class_exists('\Automattic\WooCommerce\Utilities\FeaturesUtil')) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('cart_checkout_blocks', __FILE__, false);
		}
	}
);

spl_autoload_register(
	static function (string $class_name): void {
		$prefix = 'WCStaffPOS\\';

		if (! str_starts_with($class_name, $prefix)) {
			return;
		}

		$relative_class = substr($class_name, strlen($prefix));
		$path           = WC_STAFF_POS_PATH . 'includes/' . str_replace('\\', '/', $relative_class) . '.php';

		if (is_readable($path)) {
			require_once $path;
		}
	}
);

add_action(
	'plugins_loaded',
	static function (): void {
		\WCStaffPOS\Plugin::instance()->boot();
	},
	20
);
