---
order: 80
icon: broadcast
meta:
  title: "IP Address | Gatekeepr"
---

# IP Address

## RFC 5735 Check

This check verifies whether the IP address belongs to a reserved or special-use range defined by 
[RFC 5735](https://www.rfc-editor.org/rfc/rfc5735) (e.g., private networks, loopback addresses, or multicast ranges). 
These IPs are not routable on the public internet and should never appear in legitimate customer requests. Any address 
in these ranges is flagged as invalid or suspicious.

Here are some examples of IPs which will fail this check:

{.compact}
IP   | Reason
---    | ---
`127.0.0.1` | Loopback
`10.0.5.1` | Private network
`192.168.1.100` | Private network
`224.0.0.5` | Multicast
`169.254.10.20` | Link-local

## Tor Exit Node

This check determines whether the IP address is associated with a known Tor exit node. Tor is often used to anonymize 
traffic and can be leveraged to create multiple accounts or evade bans. The system compares the IP against regularly 
updated lists of Tor exit nodes and flags any matches as high-risk or suspicious.

We refresh the list every 30 minutes to keep it up to date.

Here are some examples of IPs which will fail this check:

- `185.220.101.1`
- `199.249.230.83`
- `37.218.245.14`
- `154.35.175.225`
- `204.13.164.118`

## ASN Type

This check identifies whether the IP address originates from a residential ISP or a commercial datacenter. Datacenter 
IPs are frequently used by bots, proxies, or bulk registration scripts, while residential IPs are more likely to 
represent real end users. The system queries IP reputation and ownership databases to classify the address and flags 
datacenter or hosting provider ranges as higher risk.

We refresh the list twice a day to keep it accurate.

Here are some examples of IPs which will fail this check:

{.compact}
IP   | Reason
---    | ---
`104.244.79.2` | Datacenter hosting provider
`185.163.45.10` | Cloud VPS
`45.33.32.156` | Known server hosting
`198.51.100.23` | Test datacenter IP
`149.28.76.150` | Commercial hosting provider

## Spamhaus Drop List

This check determines whether the IP address appears on the 
[Spamhaus DROP (Don't Route Or Peer) Lists](https://www.spamhaus.org/blocklists/do-not-route-or-peer/), which are 
authoritative lists of known malicious or hijacked IP address blocks. These IPs are typically controlled by criminal 
organizations, involved in spam, phishing, malware distribution, or other abusive activity.

The service queries both IPv4 and IPv6 address spaces against the DROP lists to assess risk.

We refresh the list twice a day to keep it up to date.

Here are some examples of IPs which will fail this check:

{.compact}
IP   | Reason
---    | ---
`45.129.0.1` | Listed on Spamhaus DROP
`162.247.74.200` | Drop-listed for abuse origin
`23.154.177.4` | Part of a criminal allocation
`222.186.30.50` | Blackhat botnet infrastructure

## Blocklist Net UA

This check verifies whether the IP address is listed in the 
[Blocklist Net UA database](https://blocklist.net.ua/providers/), a Ukrainian-based threat intelligence service focused 
on identifying abusive hosts and networks. The list is curated to help Internet service providers and hosting companies 
protect their infrastructure and subscribers from malicious activity, including spam campaigns, botnets, and hacking 
attempts.

By identifying IPs involved in parasitic or abusive behavior, Blocklist Net UA enables service providers to reduce 
server load and network congestion, freeing up resources to better serve legitimate users.

We update the list every 20 minutes to keep it accurate.

Here are some examples of IPs which will fail this check:

{.compact}
IP   | Reason
---    | ---
`185.107.56.248` | Listed for spam and brute-force attacks
`193.124.177.18` | Part of known abuse network
`194.67.207.74` | Involved in phishing infrastructure
`185.244.25.37` | Detected in malware delivery campaigns
`31.43.191.129` | Blocklisted for repeated harmful traffic

## iCloud Private Relay

This check verifies whether an IP address belongs to Apple's iCloud Private Relay service. The list is publicly 
available [here](https://mask-api.icloud.com/egress-ip-ranges.csv).

iCloud Private Relay is a privacy feature that routes user traffic through Apple's relay servers, masking the original 
IP address. When a request comes from Private Relay, the true client IP cannot be determined. On its own, this signal
pushes the final decision toward `challenge`, not an automatic `block`.

We refresh the list twice a day to keep it accurate.

Here are some examples of IPs which will be flagged by this check:

{.compact}
IP   | Reason
---    | ---
`146.75.232.124` | Belongs to the Relay, located in Tampa
`146.75.232.222` | Belongs to the Relay, located in Portland

## Amazon Web Services (AWS)

This check verifies whether an IP address belongs to Amazon Web Services (AWS). The list is publicly available 
[here](https://ip-ranges.amazonaws.com/ip-ranges.json).

AWS operates one of the largest cloud infrastructures in the world. Many legitimate websites and applications run on 
AWS, but bad actors also use AWS resources for abusive activities such as spam, brute-force attacks, or automated 
scraping. By identifying traffic from AWS ranges, you can decide whether to allow, challenge, or block a request.
On its own, this signal pushes the final decision toward `challenge`.

We refresh the list once a day to ensure accuracy.

Here are some examples of IPs which will be flagged by this check:

{.compact}
IP   | Reason
---    | ---
`54.239.28.85` | Belongs to AWS, us-east-1 region (Virginia)
`52.95.110.1` | Belongs to AWS, eu-west-1 region (Ireland)
`3.5.140.0` | Belongs to AWS, ap-northeast-2 (Seoul)

## Cloudflare

This check verifies whether an IP address belongs to Cloudflare's network. The list is publicly available 
[here](https://www.cloudflare.com/ips-v4) for IPv4 and [here](https://www.cloudflare.com/ips-v6) for IPv6. 

Cloudflare operates a global content delivery and security network that sits in front of millions of websites. While 
most Cloudflare traffic is legitimate, abusive actors may also use Cloudflare-protected infrastructure to hide their 
origin servers. Identifying Cloudflare IP ranges helps you decide whether to allow, challenge, or block a request.
On its own, this signal pushes the final decision toward `challenge`.

We refresh the list once a day to keep it up to date.

Here are some examples of IPs which will be flagged by this check:

{.compact}
IP   | Reason
---    | ---
`173.245.48.12` | Belongs to Cloudflare, located in North America
`103.21.244.5` | Belongs to Cloudflare, located in Asia
`141.101.64.15` | Belongs to Cloudflare, located in Europe
