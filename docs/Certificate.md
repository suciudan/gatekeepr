# Certificate

## Install Certbot

Install Certbot with this command:

```
sudo apt install certbot python3-certbot-nginx
```

## Generate certificate

Use this command to start the interactive flow to generate a certificate:

```
sudo certbot --nginx
```

## Renew certbot

Open crontab and set up a schedule to automatically renew the certificate:

```shell
sudo crontab -e
```

Add this schedule:

```shell
0 12 * * * /usr/bin/certbot renew --quiet
```

## Restrict Dash

After you generate the certificate, open dashboard config:

```shell
sudo nano /etc/nginx/sites-available/dash
```

And remove the comments from the `allow` and `deny` rules from the `location` block.