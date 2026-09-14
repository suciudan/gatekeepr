# gatekeepr/laravel

Laravel middleware and client helpers for checking signup and login requests with Gatekeepr before accounts, credits, or sessions are created.

## Install

```sh
composer require gatekeepr/laravel
```

Publish the config when you want to customize defaults:

```sh
php artisan vendor:publish --tag=gatekeepr-config
```

Set your API key:

```env
GATEKEEPR_API_KEY=your_gatekeepr_api_key
```

## Middleware

The package registers a `gatekeepr` middleware alias. Put it before the code that creates users or sessions.

```php
use App\Http\Controllers\Auth\RegisteredUserController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [RegisteredUserController::class, 'store'])
	->middleware('gatekeepr');
```

By default, only Gatekeepr `block` decisions are rejected. To reject challenges too:

```php
Route::post('/login', [AuthenticatedSessionController::class, 'store'])
	->middleware('gatekeepr:block,challenge');
```

Blocked requests return JSON like:

```json
{
	"error": "gatekeepr_blocked",
	"message": "Request blocked by Gatekeepr.",
	"status": "block",
	"threats": ["email_disposable"]
}
```

## Manual Checks

```php
use Gatekeepr\Laravel\Facades\Gatekeepr;
use Illuminate\Http\Request;

Route::post('/register', function (Request $request) {
	$decision = Gatekeepr::checkRequest($request);

	if ($decision->blocked()) {
		return response()->json($decision->responseBody(), $decision->responseStatus());
	}

	// Create the user.
});
```

## Payload Extraction

The package sends:

- `email` from request input fields `email`, `username`, or `user.email`, then route params, then the authenticated user.
- `ip` from common proxy headers, then Laravel's `$request->ip()`.
- `user_agent` from `$request->userAgent()`.

Customize extraction in `config/gatekeepr.php`:

```php
'email_fields' => ['email', 'login'],
'email_sources' => ['input'],
'reject_statuses' => ['block', 'challenge'],
'block_message' => 'Signup blocked by Gatekeepr.',
```

For one-off calls:

```php
$decision = Gatekeepr::checkRequest($request, [
	'get_email' => fn (Request $request) => $request->input('account.email'),
	'get_ip' => fn (Request $request) => $request->ip(),
	'get_user_agent' => fn (Request $request) => $request->userAgent(),
]);
```

## Direct Client

```php
use Gatekeepr\Laravel\GatekeeprClient;

$client = new GatekeeprClient(config('gatekeepr.api_key'));

$result = $client->check([
	'email' => 'user@example.com',
	'ip' => request()->ip(),
	'user_agent' => request()->userAgent(),
]);
```

## Testing

```sh
composer install
composer test
```
