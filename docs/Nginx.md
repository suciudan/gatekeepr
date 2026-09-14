# Nginx

Use the following command to install NGINX:

```
sudo apt install nginx
```

### Hide Version

This is a good practice in securing the NGINX installation.

Open the NGINX config file with this command:

```
sudo nano /etc/nginx/nginx.conf
```

Uncomment the `server_tokens` line (or set the value to off). Once you change this, restart the server wit this command:

Because the sites will run behind Cloudflare (reverse proxy), you need to add this to the config file:

```shell
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
```