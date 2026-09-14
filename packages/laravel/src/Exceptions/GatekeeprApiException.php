<?php

namespace Gatekeepr\Laravel\Exceptions;

use RuntimeException;

class GatekeeprApiException extends RuntimeException
{
	public function __construct(
		string $message,
		protected ?int $status = null,
		protected mixed $body = null
	) {
		parent::__construct($message);
	}

	public function status(): ?int
	{
		return $this->status;
	}

	public function body(): mixed
	{
		return $this->body;
	}
}
