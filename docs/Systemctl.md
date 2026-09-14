# Systemctl


Copy the units from the `./docs/units` to the `/etc/systemd/system` folder.

Reload the daemon list with this command:

```shell
sudo systemctl daemon-reload
```

Enable the units:

```shell
sudo systemctl enable gatekeepr-api
sudo systemctl enable gatekeepr-dash
sudo systemctl enable gatekeepr-site
```