<?php

return [
	'api_key' => env('GATEKEEPR_API_KEY'),
	'base_url' => env('GATEKEEPR_BASE_URL', 'https://api.gatekeepr.io'),
	'timeout' => (float) env('GATEKEEPR_TIMEOUT', 4),

	'reject_statuses' => ['block'],
	'missing_email' => 'allow',

	'block_http_code' => 403,
	'block_message' => 'Request blocked by Gatekeepr.',
	'include_gatekeepr_result' => false,

	'email_fields' => ['email', 'username', 'user.email'],
	'email_sources' => ['input', 'route', 'user'],

	'ip_headers' => [
		'cf-connecting-ip',
		'true-client-ip',
		'x-real-ip',
		'x-vercel-forwarded-for',
		'x-forwarded-for',
		'forwarded',
	],
];
