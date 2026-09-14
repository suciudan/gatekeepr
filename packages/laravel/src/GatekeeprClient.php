<?php

namespace Gatekeepr\Laravel;

use Gatekeepr\Laravel\Exceptions\GatekeeprApiException;
use Illuminate\Http\Client\Factory as HttpFactory;
use InvalidArgumentException;

class GatekeeprClient
{
	public function __construct(
		protected string $apiKey,
		protected string $baseUrl = 'https://api.gatekeepr.io',
		protected float|int $timeout = 4,
		protected ?HttpFactory $http = null
	) {
		if ($this->apiKey === '') {
			throw new InvalidArgumentException('apiKey is required');
		}

		$this->baseUrl = rtrim($this->baseUrl, '/');
		$this->http ??= new HttpFactory();
	}

	public function check(array $payload, array $requestOptions = []): array
	{
		$response = $this->http
			->timeout($this->timeout)
			->withHeaders(array_merge([
				'Authorization' => $this->apiKey,
				'Content-Type' => 'application/json',
			], $requestOptions['headers'] ?? []))
			->post($this->baseUrl, self::cleanPayload($payload));

		$body = $response->json();
		$body = is_array($body) ? $body : [];

		if ($response->failed()) {
			throw new GatekeeprApiException('Gatekeepr request failed', $response->status(), $body);
		}

		return $body;
	}

	public static function cleanPayload(array $payload): array
	{
		$clean = [];

		if (! empty($payload['email'])) {
			$clean['email'] = trim((string) $payload['email']);
		}

		if (! empty($payload['ip'])) {
			$clean['ip'] = trim((string) $payload['ip']);
		}

		if (! empty($payload['user_agent'])) {
			$clean['user_agent'] = trim((string) $payload['user_agent']);
		}

		if (! empty($payload['userAgent'])) {
			$clean['user_agent'] = trim((string) $payload['userAgent']);
		}

		return $clean;
	}
}
