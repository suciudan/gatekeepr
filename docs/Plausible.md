# Plausible

Create the NGINX site configuration:

```
sudo nano /etc/nginx/sites-available/plausible
```

Paste the configuration in the new file:

```
server {
    server_name plausible.gatekeepr.io;

    listen 80;
    listen [::]:80;

    location / {
        proxy_pass http://127.0.0.1:8888;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /live/websocket {
        proxy_pass http://127.0.0.1:8888;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
    }
}
```

Create a symbolic link to `sites-enabled`:

```
sudo ln -s /etc/nginx/sites-available/plausible /etc/nginx/sites-enabled/
```

Reload the NGINX configuration:

```shell
nginx -s reload
```