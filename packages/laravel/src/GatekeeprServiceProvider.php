<?php

namespace Gatekeepr\Laravel;

use Gatekeepr\Laravel\Http\Middleware\GatekeeprMiddleware;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Support\ServiceProvider;

class GatekeeprServiceProvider extends ServiceProvider
{
	public function register(): void
	{
		$this->mergeConfigFrom(__DIR__ . '/../config/gatekeepr.php', 'gatekeepr');

		$this->app->singleton(GatekeeprClient::class, function ($app) {
			$config = $app['config']->get('gatekeepr', []);

			return new GatekeeprClient(
				(string) ($config['api_key'] ?? ''),
				(string) ($config['base_url'] ?? 'https://api.gatekeepr.io'),
				$config['timeout'] ?? 4,
				$app->make(HttpFactory::class)
			);
		});

		$this->app->singleton(PayloadExtractor::class, function ($app) {
			return new PayloadExtractor($app['config']->get('gatekeepr.ip_headers', []));
		});

		$this->app->singleton(Gatekeepr::class, function ($app) {
			return new Gatekeepr(
				$app->make(GatekeeprClient::class),
				$app->make(PayloadExtractor::class),
				$app['config']->get('gatekeepr', [])
			);
		});

		$this->app->alias(Gatekeepr::class, 'gatekeepr');
	}

	public function boot(): void
	{
		$this->publishes([
			__DIR__ . '/../config/gatekeepr.php' => config_path('gatekeepr.php'),
		], 'gatekeepr-config');

		if ($this->app->bound('router')) {
			$this->app['router']->aliasMiddleware('gatekeepr', GatekeeprMiddleware::class);
		}
	}
}
