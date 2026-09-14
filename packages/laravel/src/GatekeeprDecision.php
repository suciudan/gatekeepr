<?php

namespace Gatekeepr\Laravel;

class GatekeeprDecision
{
	public function __construct(
		protected bool $allowed,
		protected string $status,
		protected array $payload = [],
		protected ?array $gatekeepr = null,
		protected ?int $responseStatus = null,
		protected ?array $responseBody = null
	) {
	}

	public static function allow(string $status, array $payload = [], ?array $gatekeepr = null): self
	{
		return new self(true, $status, $payload, $gatekeepr);
	}

	public static function block(
		string $status,
		array $payload = [],
		?array $gatekeepr = null,
		string $message = 'Request blocked by Gatekeepr.',
		int $httpCode = 403,
		bool $includeGatekeeprResult = false
	): self {
		$body = [
			'error' => 'gatekeepr_blocked',
			'message' => $message,
			'status' => $status,
		];

		if (isset($gatekeepr['threats'])) {
			$body['threats'] = $gatekeepr['threats'];
		}

		if ($includeGatekeeprResult && $gatekeepr !== null) {
			$body['gatekeepr'] = $gatekeepr;
		}

		return new self(false, $status, $payload, $gatekeepr, $httpCode, $body);
	}

	public function allowed(): bool
	{
		return $this->allowed;
	}

	public function blocked(): bool
	{
		return ! $this->allowed;
	}

	public function status(): string
	{
		return $this->status;
	}

	public function payload(): array
	{
		return $this->payload;
	}

	public function gatekeepr(): ?array
	{
		return $this->gatekeepr;
	}

	public function responseStatus(): ?int
	{
		return $this->responseStatus;
	}

	public function responseBody(): ?array
	{
		return $this->responseBody;
	}

	public function toArray(): array
	{
		return [
			'allowed' => $this->allowed,
			'status' => $this->status,
			'gatekeepr' => $this->gatekeepr,
			'payload' => $this->payload,
			'response' => $this->responseStatus === null ? null : [
				'status' => $this->responseStatus,
				'body' => $this->responseBody,
			],
		];
	}
}
