---
order: 90
icon: key
meta:
  title: "Authorization | Gatekeepr"
---

# Authorization

Gatekeepr API uses a token to authorize your request. You received your unique authorization key (named 
within the documentation as `[API_KEY]`) during the onboarding process.

To use the API, include your API key in the headers of all requests to the server, using the key `Authorization`.

## Testing Your Authorization Key

Use the code samples below to verify your authorization key. This request will be sent to the `/ping` endpoint. 

+++ shell
:::code source="../static/samples/ping/ping.sh":::
+++ node.js
:::code source="../static/samples/ping/ping.js":::
+++ php
:::code source="../static/samples/ping/ping.php":::
+++

If everything is set up correctly, you will receive this response:

```json
{ "pong": true }
```