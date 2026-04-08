<?php

declare(strict_types=1);

namespace WCStaffPOS\Api;

use WCStaffPOS\Domain\Adapters\ProductConfigurationAdapterInterface;
use WCStaffPOS\Domain\OrderService;
use WCStaffPOS\Domain\PosCartContext;

final class Router
{
	private PosCartContext $cart_context;

	private OrderService $order_service;

	private ProductConfigurationAdapterInterface $product_adapter;

	public function __construct(
		PosCartContext $cart_context,
		OrderService $order_service,
		ProductConfigurationAdapterInterface $product_adapter
	) {
		$this->cart_context    = $cart_context;
		$this->order_service   = $order_service;
		$this->product_adapter = $product_adapter;
	}

	public function register(): void
	{
		add_action('rest_api_init', [$this, 'register_routes']);
	}

	public function register_routes(): void
	{
		$controllers = [
			new BootstrapController($this->cart_context, $this->product_adapter),
			new ProductsController($this->product_adapter),
			new CategoriesController(),
			new CustomersController(),
			new CartController($this->cart_context, $this->product_adapter),
			new CouponsController($this->cart_context),
			new CartDiscountController($this->cart_context),
			new HeldCartsController($this->cart_context),
			new OrdersController($this->cart_context, $this->order_service),
			new OrderHistoryController(),
		];

		foreach ($controllers as $controller) {
			$controller->register_routes();
		}
	}
}
