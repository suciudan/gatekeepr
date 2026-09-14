<?php

namespace Gatekeepr\Laravel\Tests;

use Gatekeepr\Laravel\Gatekeepr;
use Gatekeepr\Laravel\GatekeeprClient;
use Gatekeepr\Laravel\PayloadExtractor;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;

class GatekeeprTest extends TestCase
{
	public function testItBuildsPayloadFromLaravelRequest(): void
	{
		$request = Request::create('/signup', 'POST', [
			'email' => ' user@example.com ',
		], server: [
			'HTTP_X_FORWARDED_FOR' => '1.2.3.4, 5.6.7.8',
			'HTTP_USER_AGENT' => 'Mozilla/5.0',
		]);

		$payload = (new PayloadExtractor())->fromRequest($request);

		$this->assertSame([
			'email' => 'user@example.com',
			'ip' => '1.2.3.4',
			'user_agent' => 'Mozilla/5.0',
		], $payload);
	}

	public function testItFallsBackThroughCommonEmailFields(): void
	{
		$extractor = new PayloadExtractor();

		$this->assertSame([
			'email' => 'username@example.com',
		], $extractor->fromRequest(Request::create('/login', 'POST', [
			'username' => 'username@example.com',
		]), [
			'get_ip' => fn (Request $request) => null,
			'get_user_agent' => fn (Request $request) => null,
		]));

		$this->assertSame([
			'email' => 'nested@example.com',
		], $extractor->fromRequest(Request::create('/login', 'POST', [
			'user' => [
				'email' => 'nested@example.com',
			],
		]), [
			'get_ip' => fn (Request $request) => null,
			'get_user_agent' => fn (Request $request) => null,
		]));
	}

	public function testItAllowsGatekeeprAllowDecisions(): void
	{
		$gatekeepr = new Gatekeepr(
			new FakeGatekeeprClient(['status' => 'allow', 'threats' => []]),
			new PayloadExtractor(),
			[]
		);

		$decision = $gatekeepr->checkRequest(Request::create('/signup', 'POST', [
			'email' => 'user@example.com',
		]));

		$this->assertTrue($decision->allowed());
		$this->assertSame('allow', $decision->status());
		$this->assertNull($decision->responseBody());
	}

	public function testItBlocksGatekeeprBlockDecisions(): void
	{
		$gatekeepr = new Gatekeepr(
			new FakeGatekeeprClient(['status' => 'block', 'threats' => ['email_disposable']]),
			new PayloadExtractor(),
			[
				'block_message' => fn (array $gatekeepr) => 'Blocked: ' . $gatekeepr['threats'][0],
			]
		);

		$decision = $gatekeepr->checkRequest(Request::create('/signup', 'POST', [
			'email' => 'bot@example.com',
		]));

		$this->assertTrue($decision->blocked());
		$this->assertSame(403, $decision->responseStatus());
		$this->assertSame([
			'error' => 'gatekeepr_blocked',
			'message' => 'Blocked: email_disposable',
			'status' => 'block',
			'threats' => ['email_disposable'],
		], $decision->responseBody());
	}

	public function testItCanRejectChallengeDecisions(): void
	{
		$gatekeepr = new Gatekeepr(
			new FakeGatekeeprClient(['status' => 'challenge', 'threats' => ['ip_hosting']]),
			new PayloadExtractor(),
			[
				'reject_statuses' => ['block', 'challenge'],
			]
		);

		$decision = $gatekeepr->checkRequest(Request::create('/signup', 'POST', [
			'email' => 'user@example.com',
		]));

		$this->assertTrue($decision->blocked());
		$this->assertSame('challenge', $decision->status());
	}

	public function testItAllowsMissingEmailByDefault(): void
	{
		$gatekeepr = new Gatekeepr(
			new FakeGatekeeprClient(['status' => 'block']),
			new PayloadExtractor(),
			[]
		);

		$decision = $gatekeepr->checkRequest(Request::create('/signup', 'POST'));

		$this->assertTrue($decision->allowed());
		$this->assertSame('missing_email', $decision->status());
	}
}

class FakeGatekeeprClient extends GatekeeprClient
{
	public function __construct(protected array $result)
	{
	}

	public function check(array $payload, array $requestOptions = []): array
	{
		return $this->result;
	}
}
