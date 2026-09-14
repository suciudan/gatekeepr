curl -X POST "https://api.gatekeepr.io" \
     -H "Authorization: [API_KEY]" \
     -H "Content-Type: application/json" \
     -d '{
           "email": "john@gmail.com",
           "ip": "0.0.0.0",
           "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0"
         }'