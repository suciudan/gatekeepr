<?php

namespace Gatekeepr\Laravel;

use Illuminate\Http\Request;

class Gatekeepr
{
	public function __construct(
		protected GatekeeprClient $client,
		protected PayloadExtractor $extractor,
		protected array $config = []
	) {
	}

	public function check(array $payload, array $requestOptions = []): array
	{
		return $this->client->check($payload, $requestOptions);
	}

	public function payloadFromRequest(Request $request, array $options = []): array
	{
		return $this->extractor->fromRequest($request, $this->options($options));
	}

	public function checkRequest(Request $request, array $options = []): GatekeeprDecision
	{
		$options = $this->options($options);
		$payload = $this->extractor->fromRequest($request, $options);

		if (empty($payload['email'])) {
			if (($options['missing_email'] ?? 'allow') === 'block') {
				return GatekeeprDecision::block(
					'missing_email',
					$payload,
					null,
					$this->resolveBlockMessage(['status' => 'missing_email'], $request, $options),
					(int) ($options['block_http_code'] ?? 403),
					(bool) ($options['include_gatekeepr_result'] ?? false)
				);
			}

			return GatekeeprDecision::allow('missing_email', $payload);
		}

		$gatekeepr = $this->client->check($payload);
		$status = (string) ($gatekeepr['status'] ?? 'allow');
		$rejectStatuses = $options['reject_statuses'] ?? ['block'];

		if (in_array($status, $rejectStatuses, true)) {
			return GatekeeprDecision::block(
				$status,
				$payload,
				$gatekeepr,
				$this->resolveBlockMessage($gatekeepr, $request, $options),
				(int) ($options['block_http_code'] ?? 403),
				(bool) ($options['include_gatekeepr_result'] ?? false)
			);
		}

		return GatekeeprDecision::allow($status, $payload, $gatekeepr);
	}

	protected function options(array $options): array
	{
		return array_replace($this->config, $options);
	}

	protected function resolveBlockMessage(array $gatekeepr, Request $request, array $options): string
	{
		$message = $options['block_message'] ?? 'Request blocked by Gatekeepr.';

		if (is_callable($message)) {
			return (string) $message($gatekeepr, $request);
		}

		return (string) $message;
	}
}
