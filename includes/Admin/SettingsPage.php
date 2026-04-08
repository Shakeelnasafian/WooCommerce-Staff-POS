<?php

declare(strict_types=1);

namespace WCStaffPOS\Admin;

/**
 * WP Settings API page for Staff POS.
 *
 * Registers a sub-menu under the Staff POS top-level item and provides UI for:
 *  - Which roles can access the POS (`wc_staff_pos_access_roles`)
 *  - Which roles can override prices (`wc_staff_pos_price_override_roles`)
 *  - Custom tender types (`wc_staff_pos_tender_types`)
 */
final class SettingsPage
{
	public function register(): void
	{
		add_action('admin_menu', [$this, 'register_menu']);
		add_action('admin_init', [$this, 'register_settings']);
	}

	public function register_menu(): void
	{
		add_submenu_page(
			'wc-staff-pos',
			__('Staff POS Settings', 'wc-staff-pos'),
			__('Settings', 'wc-staff-pos'),
			'manage_options',
			'wc-staff-pos-settings',
			[$this, 'render']
		);
	}

	public function register_settings(): void
	{
		register_setting(
			'wc_staff_pos_settings',
			'wc_staff_pos_access_roles',
			[
				'type'              => 'array',
				'sanitize_callback' => [$this, 'sanitize_roles'],
				'default'           => ['administrator', 'shop_manager'],
			]
		);

		register_setting(
			'wc_staff_pos_settings',
			'wc_staff_pos_price_override_roles',
			[
				'type'              => 'array',
				'sanitize_callback' => [$this, 'sanitize_roles'],
				'default'           => ['administrator', 'shop_manager'],
			]
		);

		register_setting(
			'wc_staff_pos_settings',
			'wc_staff_pos_tender_types',
			[
				'type'              => 'string',
				'sanitize_callback' => [$this, 'sanitize_tender_types'],
				'default'           => '',
			]
		);

		add_settings_section('wc_staff_pos_access', __('Access Control', 'wc-staff-pos'), '__return_false', 'wc_staff_pos_settings');
		add_settings_section('wc_staff_pos_payment', __('Payment Settings', 'wc-staff-pos'), '__return_false', 'wc_staff_pos_settings');

		add_settings_field(
			'wc_staff_pos_access_roles',
			__('POS Access', 'wc-staff-pos'),
			[$this, 'render_roles_field'],
			'wc_staff_pos_settings',
			'wc_staff_pos_access',
			['option' => 'wc_staff_pos_access_roles', 'description' => __('Roles that can open the Staff POS terminal.', 'wc-staff-pos')]
		);

		add_settings_field(
			'wc_staff_pos_price_override_roles',
			__('Price Override', 'wc-staff-pos'),
			[$this, 'render_roles_field'],
			'wc_staff_pos_settings',
			'wc_staff_pos_access',
			['option' => 'wc_staff_pos_price_override_roles', 'description' => __('Roles that can set a custom price per line item.', 'wc-staff-pos')]
		);

		add_settings_field(
			'wc_staff_pos_tender_types',
			__('Tender Types', 'wc-staff-pos'),
			[$this, 'render_tender_types_field'],
			'wc_staff_pos_settings',
			'wc_staff_pos_payment'
		);
	}

	public function sanitize_roles(mixed $value): array
	{
		if (! is_array($value)) {
			return [];
		}

		$valid = array_keys(wp_roles()->get_names());

		return array_values(array_filter(array_map('sanitize_key', $value), static fn ($r) => in_array($r, $valid, true)));
	}

	/**
	 * Expects a JSON string — already sanitised via sanitize_text_field on each entry.
	 */
	public function sanitize_tender_types(mixed $value): string
	{
		$decoded = json_decode((string) $value, true);

		if (! is_array($decoded)) {
			return '';
		}

		$clean = [];

		foreach ($decoded as $entry) {
			$v = sanitize_key((string) ($entry['value'] ?? ''));
			$l = sanitize_text_field((string) ($entry['label'] ?? ''));

			if ('' !== $v && '' !== $l) {
				$clean[] = ['value' => $v, 'label' => $l];
			}
		}

		return wp_json_encode($clean) ?: '';
	}

	public function render_roles_field(array $args): void
	{
		$option  = $args['option'];
		$current = (array) get_option($option, ['administrator', 'shop_manager']);
		$roles   = wp_roles()->get_names();
		$desc    = $args['description'] ?? '';

		echo '<fieldset>';

		foreach ($roles as $slug => $name) {
			$checked = in_array($slug, $current, true) ? 'checked' : '';
			printf(
				'<label style="display:block;margin-bottom:4px"><input type="checkbox" name="%s[]" value="%s" %s> %s</label>',
				esc_attr($option),
				esc_attr($slug),
				esc_attr($checked),
				esc_html(translate_user_role($name))
			);
		}

		if ($desc) {
			echo '<p class="description">' . esc_html($desc) . '</p>';
		}

		echo '</fieldset>';
	}

	public function render_tender_types_field(): void
	{
		$stored = get_option('wc_staff_pos_tender_types', '');
		$types  = [];

		if ('' !== $stored) {
			$decoded = json_decode($stored, true);

			if (is_array($decoded)) {
				$types = $decoded;
			}
		}

		if (empty($types)) {
			$types = [
				['value' => 'cash', 'label' => 'Cash'],
				['value' => 'card', 'label' => 'Card'],
				['value' => 'cheque', 'label' => 'Cheque'],
			];
		}

		echo '<div id="wc-pos-tender-types">';

		foreach ($types as $i => $type) {
			$this->render_tender_row((int) $i, $type['value'], $type['label']);
		}

		echo '</div>';
		echo '<button type="button" class="button button-secondary" id="wc-pos-add-tender" style="margin-top:8px">' . esc_html__('+ Add tender type', 'wc-staff-pos') . '</button>';
		echo '<p class="description">' . esc_html__('Tender types available to cashiers when marking an order as manually paid.', 'wc-staff-pos') . '</p>';
		echo '<input type="hidden" name="wc_staff_pos_tender_types" id="wc-pos-tender-json" value="' . esc_attr(wp_json_encode($types) ?: '') . '">';

		// Inline JS for the dynamic row editor.
		?>
		<script>
		(function(){
			var container = document.getElementById('wc-pos-tender-types');
			var hidden    = document.getElementById('wc-pos-tender-json');
			var addBtn    = document.getElementById('wc-pos-add-tender');
			var idx       = container ? container.children.length : 0;

			function update() {
				var rows = container.querySelectorAll('.wc-pos-tender-row');
				var data = [];
				rows.forEach(function(row){
					var v = row.querySelector('.wc-pos-tender-value').value.trim();
					var l = row.querySelector('.wc-pos-tender-label').value.trim();
					if (v && l) data.push({value: v, label: l});
				});
				hidden.value = JSON.stringify(data);
			}

			function makeRow(i, value, label) {
				var row = document.createElement('div');
				row.className = 'wc-pos-tender-row';
				row.style.cssText = 'display:flex;gap:8px;margin-bottom:6px;align-items:center';
				row.innerHTML =
					'<input class="wc-pos-tender-value regular-text" placeholder="<?php echo esc_js(__('Key (e.g. cash)', 'wc-staff-pos')); ?>" value="' + (value||'') + '" style="width:120px">' +
					'<input class="wc-pos-tender-label regular-text" placeholder="<?php echo esc_js(__('Label (e.g. Cash)', 'wc-staff-pos')); ?>" value="' + (label||'') + '">' +
					'<button type="button" class="button button-link-delete wc-pos-tender-remove" aria-label="<?php echo esc_attr(__('Remove', 'wc-staff-pos')); ?>">&times;</button>';
				row.querySelector('.wc-pos-tender-value').addEventListener('input', update);
				row.querySelector('.wc-pos-tender-label').addEventListener('input', update);
				row.querySelector('.wc-pos-tender-remove').addEventListener('click', function(){
					row.remove();
					update();
				});
				return row;
			}

			if (container) {
				container.innerHTML = '';
				<?php foreach ($types as $i => $type): ?>
				container.appendChild(makeRow(<?php echo (int) $i; ?>, <?php echo wp_json_encode($type['value']); ?>, <?php echo wp_json_encode($type['label']); ?>));
				<?php endforeach; ?>
			}

			if (addBtn) {
				addBtn.addEventListener('click', function(){
					container.appendChild(makeRow(idx++, '', ''));
					update();
				});
			}

			update();
		})();
		</script>
		<?php
	}

	public function render(): void
	{
		if (! current_user_can('manage_options')) {
			wp_die(esc_html__('You are not allowed to manage Staff POS settings.', 'wc-staff-pos'));
		}

		?>
		<div class="wrap">
			<h1><?php esc_html_e('Staff POS Settings', 'wc-staff-pos'); ?></h1>

			<?php if (isset($_GET['settings-updated'])): ?>
				<div class="notice notice-success is-dismissible">
					<p><?php esc_html_e('Settings saved. Role capabilities will be updated on next page load.', 'wc-staff-pos'); ?></p>
				</div>
			<?php endif; ?>

			<form method="post" action="options.php">
				<?php
				settings_fields('wc_staff_pos_settings');
				do_settings_sections('wc_staff_pos_settings');
				submit_button();
				?>
			</form>
		</div>
		<?php
	}
}
