<?php

namespace Gatekeepr\Laravel\Http\Middleware;

use Closure;
use Gatekeepr\Laravel\Gatekeepr;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GatekeeprMiddleware
{
	public function __construct(protected Gatekeepr $gatekeepr)
	{
	}

	public function handle(Request $request, Closure $next, string ...$rejectStatuses): mixed
	{
		$options = [];

		if ($rejectStatuses !== []) {
			$options['reject_statuses'] = $rejectStatuses;
		}

		$decision = $this->gatekeepr->checkRequest($request, $options);

		if ($decision->allowed()) {
			return $next($request);
		}

		return new JsonResponse($decision->responseBody(), $decision->responseStatus() ?? 403);
	}
}
