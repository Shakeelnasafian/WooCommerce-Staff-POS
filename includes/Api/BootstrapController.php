<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WCStaffPOS\Domain\Adapters\ProductConfigurationAdapterInterface;
use WCStaffPOS\Domain\PosCartContext;
use WP_REST_Request;

final class BootstrapController extends Controller
{
	private PosCartContext $cart_context;

	private ProductConfigurationAdapterInterface $product_adapter;

	public function __construct(PosCartContext $cart_context, ProductConfigurationAdapterInterface $product_adapter)
	{
		$this->cart_context    = $cart_context;
		$this->product_adapter = $product_adapter;
	}

	public function register_routes(): void
	{
		register_rest_route(
			self::NAMESPACE,
			'/bootstrap',
			[
				[
					'methods'             => 'GET',
					'callback'            => [$this, 'get_bootstrap'],
					'permission_callback' => [$this, 'permissions_check'],
				],
			]
		);
	}

	public function get_bootstrap(WP_REST_Request $request): array
	{
		unset($request);

		return [
			'currentUser'           => [
				'id'    => get_current_user_id(),
				'name'  => wp_get_current_user()->display_name,
				'email' => wp_get_current_user()->user_email,
			],
			'capabilities'          => [
				'manage_woocommerce'         => current_user_can('manage_woocommerce'),
				'wc_staff_pos'               => current_user_can('wc_staff_pos'),
				'wc_staff_pos_price_override' => current_user_can('wc_staff_pos_price_override'),
			],
			'supportedProductTypes' => $this->product_adapter->get_supported_types(),
			'cart'                  => $this->cart_context->run(
				fn (): array => $this->cart_context->get_snapshot()
			),
			'manualTenderTypes'     => [
				['value' => 'cash', 'label' => __('Cash', 'wc-staff-pos')],
				['value' => 'manual', 'label' => __('Manual', 'wc-staff-pos')],
				['value' => 'card', 'label' => __('Card', 'wc-staff-pos')],
				['value' => 'cheque', 'label' => __('Cheque', 'wc-staff-pos')],
			],
		];
	}
}
