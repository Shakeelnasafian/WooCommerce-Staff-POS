<?php

declare(strict_types=1);

namespace WCStaffPOS\Admin;

use WCStaffPOS\Domain\Adapters\ProductConfigurationAdapterInterface;

final class Page
{
	private ProductConfigurationAdapterInterface $product_adapter;

	public function __construct(ProductConfigurationAdapterInterface $product_adapter)
	{
		$this->product_adapter = $product_adapter;
	}

	public function register(): void
	{
		add_action('admin_menu', [$this, 'register_menu']);
		add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
	}

	public function register_menu(): void
	{
		// Register as a top-level menu so users who only have wc_staff_pos (not
		// manage_woocommerce) can access it without WordPress re-parenting the item
		// as an orphaned top-level entry when the WooCommerce parent is invisible.
		add_menu_page(
			__('Staff POS', 'wc-staff-pos'),
			__('Staff POS', 'wc-staff-pos'),
			'wc_staff_pos',
			'wc-staff-pos',
			[$this, 'render'],
			'dashicons-store',
			56 // Just after WooCommerce (55) in the admin sidebar.
		);
	}

	public function enqueue_assets(string $hook_suffix): void
	{
		if ('toplevel_page_wc-staff-pos' !== $hook_suffix) {
			return;
		}

		wp_enqueue_style(
			'wc-staff-pos-admin',
			WC_STAFF_POS_URL . 'assets/admin.css',
			[],
			WC_STAFF_POS_VERSION
		);

		wp_enqueue_script(
			'wc-staff-pos-admin',
			WC_STAFF_POS_URL . 'assets/admin.js',
			['wp-api-fetch', 'wp-element'],
			WC_STAFF_POS_VERSION,
			true
		);

		wp_localize_script(
			'wc-staff-pos-admin',
			'wcStaffPosConfig',
			[
				'root'                  => esc_url_raw(rest_url('wc-pos/v1/')),
				'nonce'                 => wp_create_nonce('wp_rest'),
				'title'                 => __('Staff POS', 'wc-staff-pos'),
				'currencySymbol'        => html_entity_decode(get_woocommerce_currency_symbol(), ENT_QUOTES, 'UTF-8'),
				'supportedProductTypes' => $this->product_adapter->get_supported_types(),
				'strings'               => [
					'unsupportedProduct' => __('This product type is not supported in Staff POS yet.', 'wc-staff-pos'),
				],
			]
		);
	}

	public function render(): void
	{
		if (! current_user_can('wc_staff_pos')) {
			wp_die(esc_html__('You are not allowed to access Staff POS.', 'wc-staff-pos'));
		}

		echo '<div class="wrap wc-staff-pos-wrap">';
		echo '<h1 class="screen-reader-text">' . esc_html__('Staff POS', 'wc-staff-pos') . '</h1>';
		echo '<div id="wc-staff-pos-root"></div>';
		echo '</div>';
	}
}
