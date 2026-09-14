<?php

namespace Gatekeepr\Laravel\Facades;

use Illuminate\Support\Facades\Facade;

class Gatekeepr extends Facade
{
	protected static function getFacadeAccessor(): string
	{
		return 'gatekeepr';
	}
}
