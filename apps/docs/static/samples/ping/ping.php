<?php

$apiUrl = "https://api.gatekeepr.io/ping";
$apiKey = "[API_KEY]";

try {
    $ch = curl_init($apiUrl);

    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: $apiKey",
        "Content-Type: application/json"
    ]);

    $response = curl_exec($ch);

    if(curl_errno($ch)) {
        throw new Exception(curl_error($ch));
    }

    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if($httpCode !== 200) {
        throw new Exception("Request failed with status code: $httpCode");
    }

    $json = json_decode($response, true);
    print_r($json);
} catch(Exception $e) {
    echo "Error: " . $e->getMessage();
}