<?php

declare(strict_types=1);

namespace WCStaffPOS;

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

		$this->booted = true;
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
