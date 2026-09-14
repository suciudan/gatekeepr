<?php

namespace Gatekeepr\Laravel;

use Illuminate\Http\Request;

class PayloadExtractor
{
	public const DEFAULT_EMAIL_FIELDS = ['email', 'username', 'user.email'];
	public const DEFAULT_EMAIL_SOURCES = ['input', 'route', 'user'];

	public function __construct(protected array $ipHeaders = [])
	{
		$this->ipHeaders = $this->ipHeaders ?: [
			'cf-connecting-ip',
			'true-client-ip',
			'x-real-ip',
			'x-vercel-forwarded-for',
			'x-forwarded-for',
			'forwarded',
		];
	}

	public function fromRequest(Request $request, array $options = []): array
	{
		$payload = [
			'email' => $options['email'] ?? $this->resolveEmail($request, $options),
			'ip' => $options['ip'] ?? $this->resolveIp($request, $options),
			'user_agent' => $options['user_agent'] ?? $options['userAgent'] ?? $this->resolveUserAgent($request, $options),
		];

		return GatekeeprClient::cleanPayload($payload);
	}

	public function resolveEmail(Request $request, array $options = []): ?string
	{
		if (isset($options['get_email']) && is_callable($options['get_email'])) {
			$value = $options['get_email']($request);
			return $value === null ? null : (string) $value;
		}

		$fields = $this->listOption($options['email_fields'] ?? self::DEFAULT_EMAIL_FIELDS);
		$sources = $this->listOption($options['email_sources'] ?? self::DEFAULT_EMAIL_SOURCES);

		foreach ($sources as $source) {
			foreach ($fields as $field) {
				$value = $this->valueFromSource($request, $source, $field);

				if (! empty($value)) {
					return (string) $value;
				}
			}
		}

		return null;
	}

	public function resolveIp(Request $request, array $options = []): ?string
	{
		if (isset($options['get_ip']) && is_callable($options['get_ip'])) {
			$value = $options['get_ip']($request);
			return $value === null ? null : (string) $value;
		}

		foreach ($options['ip_headers'] ?? $this->ipHeaders as $header) {
			$ip = $this->parseForwardedIp($request->headers->get($header), $header);

			if ($ip !== null) {
				return $ip;
			}
		}

		return $request->ip();
	}

	public function resolveUserAgent(Request $request, array $options = []): ?string
	{
		if (isset($options['get_user_agent']) && is_callable($options['get_user_agent'])) {
			$value = $options['get_user_agent']($request);
			return $value === null ? null : (string) $value;
		}

		return $request->userAgent();
	}

	public function parseForwardedIp(?string $value, string $headerName = ''): ?string
	{
		if ($value === null || trim($value) === '') {
			return null;
		}

		$first = trim(explode(',', $value)[0]);

		if ($first === '') {
			return null;
		}

		if (strtolower($headerName) === 'forwarded') {
			preg_match('/(?:^|;)\s*for=(?:"?\[?)([^;\]"]+)/i', $first, $matches);
			return $this->stripPort($matches[1] ?? null);
		}

		return $this->stripPort($first);
	}

	protected function valueFromSource(Request $request, string $source, string $field): mixed
	{
		return match ($source) {
			'input', 'request' => $request->input($field),
			'route' => $this->routeValue($request, $field),
			'user' => $request->user() === null ? null : data_get($request->user(), $field),
			default => data_get($request->{$source} ?? null, $field),
		};
	}

	protected function routeValue(Request $request, string $field): mixed
	{
		$route = $request->route();

		if (is_object($route) && method_exists($route, 'parameters')) {
			return data_get($route->parameters(), $field);
		}

		if (is_array($route)) {
			return data_get($route, $field);
		}

		return null;
	}

	protected function listOption(string|array $value): array
	{
		return is_array($value) ? $value : [$value];
	}

	protected function stripPort(?string $value): ?string
	{
		if ($value === null || trim($value) === '') {
			return null;
		}

		$clean = trim($value, " \t\n\r\0\x0B\"");

		if (str_starts_with($clean, '[')) {
			return explode(']', substr($clean, 1))[0];
		}

		if (substr_count($clean, ':') === 1 && preg_match('/:\d+$/', $clean) === 1) {
			return preg_replace('/:\d+$/', '', $clean);
		}

		return $clean;
	}
}
