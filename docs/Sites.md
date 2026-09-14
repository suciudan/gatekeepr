# Sites

## API

Create the NGINX site configuration:

```
sudo nano /etc/nginx/sites-available/gatekeepr-api
```

Paste the configuration in the new file:

```
server {

    listen 80;

    index index.html index.htm index.nginx-debian.html;

    server_name api.gatekeepr.io;

    location / {
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Url-Scheme $scheme;
        proxy_set_header Host $http_host;
        proxy_redirect off;
        proxy_pass http://127.0.0.1:3000;
        rewrite ^/(.*)/$ /$1 permanent; # remove trailing slash
    }
   
    location ~ /\.ht {
        deny all;
    }

}
```

Create a symbolic link to `sites-enabled`:

```
sudo ln -s /etc/nginx/sites-available/gatekeepr-api /etc/nginx/sites-enabled/
```

## Dash

Create the nginx configuration file for the service:

```shell
sudo nano /etc/nginx/sites-available/gatekeepr-dash
```

Paste this code inside the editor:

```shell
server {

    listen 80;

    index index.html index.htm index.nginx-debian.html;

    server_name dash.gatekeepr.io;

    location / {
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Url-Scheme $scheme;
        proxy_set_header Host $http_host;
        proxy_redirect off;
        proxy_pass http://127.0.0.1:4000;
        rewrite ^/(.*)/$ /$1 permanent; # remove trailing slash
    }

    location ~ /\.ht {
        deny all;
    }

}
```

Enable the new configuration with this command:

```shell
sudo ln -s /etc/nginx/sites-available/gatekeepr-dash /etc/nginx/sites-enabled/
```

## Docs

### Public Directory

Create the directory:

```shell
mkdir /var/www/html/docs
```

Set the right permissions for it:

```shell
chown www-data:www-data /var/www/html/docs
```

Create the NGINX site config:

```
sudo nano /etc/nginx/sites-available/gatekeepr-docs
```

Paste the configuration in the new file:

```
server {

    listen 80;

    index index.html index.htm index.nginx-debian.html;

    root /var/www/html/docs;

    server_name docs.gatekeepr.io;

    location / {
        try_files $uri $uri/ =404;
    }
    
    location ~ /\.ht {
        deny all;
    }

}
```

Enable the site configuration with this command:

```shell
sudo ln -s /etc/nginx/sites-available/gatekeepr-docs /etc/nginx/sites-enabled/
```

## Site

Create the nginx configuration file for the service:

```shell
sudo nano /etc/nginx/sites-available/gatekeepr-site
```

Paste this code inside the editor:

```shell
server {

    listen 80;

    index index.html index.htm index.nginx-debian.html;

    server_name www.gatekeepr.io gatekeepr.io;

    location / {
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Url-Scheme $scheme;
        proxy_set_header Host $http_host;
        proxy_redirect off;
        proxy_pass http://127.0.0.1:9999;
        rewrite ^/(.*)/$ /$1 permanent; # remove trailing slash
    }

    location ~ /\.ht {
        deny all;
    }

}
```

Enable the new configuration with this command:

```shell
sudo ln -s /etc/nginx/sites-available/gatekeepr-site /etc/nginx/sites-enabled/
```

## Apply configuration

Use this command to enable the new sites:

```
sudo service nginx restart
```
