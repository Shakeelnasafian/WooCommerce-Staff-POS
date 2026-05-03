<?php

declare(strict_types=1);

namespace WCStaffPOS\Admin;

use WCStaffPOS\Domain\Adapters\ProductConfigurationAdapterInterface;

final class Page
{
	private ProductConfigurationAdapterInterface $product_adapter;

	/**
	 * Hook suffix returned by add_menu_page(). Captured so enqueue_assets()
	 * isn't brittle when admin-menu / role-manager plugins filter the slug,
	 * title, or parent — a hardcoded "toplevel_page_wc-staff-pos" would
	 * silently miss the match and the POS page would never enqueue its
	 * assets, leaving the user staring at the loading spinner forever.
	 */
	private string $hook_suffix = '';

	/**
	 * Set to true when enqueue_assets() detects a missing JS dependency
	 * (wp-element / wp-api-fetch), so render() can emit an on-page error
	 * instead of an infinite "Loading…" placeholder.
	 */
	private bool $missing_dependencies = false;

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
		$this->hook_suffix = (string) add_menu_page(
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
		// Compare against the hook suffix actually returned by add_menu_page()
		// rather than a hardcoded string, so menu filters from other plugins
		// cannot silently mis-match and skip the enqueue.
		if ('' === $this->hook_suffix || $hook_suffix !== $this->hook_suffix) {
			return;
		}

		wp_enqueue_style(
			'wc-staff-pos-admin',
			WC_STAFF_POS_URL . 'assets/admin.css',
			[],
			WC_STAFF_POS_VERSION
		);

		// If another plugin has deregistered wp-element or wp-api-fetch
		// (common with aggressive "disable Gutenberg" / optimisation plugins),
		// WordPress will quietly skip emitting our <script> tag. Detect it
		// up front so render() can surface a clear error on the page.
		$scripts = wp_scripts();
		$missing = [];

		foreach (['wp-element', 'wp-api-fetch'] as $handle) {
			if (! isset($scripts->registered[$handle])) {
				$missing[] = $handle;
			}
		}

		if (! empty($missing)) {
			$this->missing_dependencies = true;
			// Admin-wide notice in case the user lands elsewhere first.
			add_action('admin_notices', function () use ($missing): void {
				echo '<div class="notice notice-error"><p>';
				echo esc_html(sprintf(
					/* translators: %s: comma separated list of missing script handles */
					__('Staff POS cannot load its UI because another plugin has removed required WordPress scripts: %s. Try deactivating optimisation or "disable Gutenberg" plugins on the admin side.', 'wc-staff-pos'),
					implode(', ', $missing)
				));
				echo '</p></div>';
			});
			return;
		}

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
		echo '<div id="wc-staff-pos-root">';

		if ($this->missing_dependencies) {
			// Dependency failure detected during enqueue — render a clear
			// on-page error instead of a forever-loading spinner.
			echo '<div class="wc-staff-pos-init-error">';
			echo '<strong>' . esc_html__('Staff POS could not load.', 'wc-staff-pos') . '</strong> ';
			echo esc_html__('Required WordPress scripts (wp-element / wp-api-fetch) are not registered on this page. Another plugin is likely disabling them. Check the admin notice above.', 'wc-staff-pos');
			echo '</div>';
		} else {
			// Shown only until the React app mounts and replaces this content.
			echo '<div class="wc-staff-pos-loading">';
			echo '<span class="wc-staff-pos-spinner"></span>';
			echo esc_html__('Loading Staff POS…', 'wc-staff-pos');
			echo '</div>';
		}

		echo '</div>';
		echo '</div>';

		if (! $this->missing_dependencies) {
			$this->print_watchdog();
		}
	}

	/**
	 * Inline watchdog: independent of the main script bundle, so it runs even
	 * if admin.js was never emitted (dependency skipped, concat/minify broke
	 * the IIFE, caching plugin stripped it, etc.). Gives the user a concrete
	 * diagnosis instead of a silent stuck-loading screen.
	 */
	private function print_watchdog(): void
	{
		$message = esc_js(__('Staff POS did not finish loading. This is usually caused by another admin plugin breaking WordPress scripts. Missing: ', 'wc-staff-pos'));
		$hint    = esc_js(__('Open the browser console (F12) for the exact error, and try disabling admin optimisation/minify plugins.', 'wc-staff-pos'));
		?>
		<script>
		(function () {
			setTimeout(function () {
				var root = document.getElementById('wc-staff-pos-root');
				if (!root || root.querySelector('.wc-staff-pos-init-error')) {
					return;
				}
				var stillLoading = !!root.querySelector('.wc-staff-pos-loading');
				if (!stillLoading) {
					return;
				}
				var missing = [];
				if (!window.wp) { missing.push('window.wp'); }
				else {
					if (!window.wp.element) { missing.push('wp.element'); }
					if (!window.wp.apiFetch) { missing.push('wp.apiFetch'); }
				}
				if (!window.wcStaffPosConfig) { missing.push('wcStaffPosConfig'); }
				root.innerHTML =
					'<div class="wc-staff-pos-init-error">' +
					'<strong><?php echo $message; // phpcs:ignore WordPress.Security.EscapeOutput ?></strong> ' +
					(missing.length ? missing.join(', ') : '<?php echo esc_js(__('(main script did not execute)', 'wc-staff-pos')); ?>') +
					'<br><small><?php echo $hint; // phpcs:ignore WordPress.Security.EscapeOutput ?></small>' +
					'</div>';
			}, 4000);
		})();
		</script>
		<?php
	}
}
