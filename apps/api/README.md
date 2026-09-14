# Gatekeepr API

Email, IP and User Agent verification against abusers.

## Resources

### Emails

- [Disposable email domains](https://github.com/disposable-email-domains/disposable-email-domains)
- [Email exposed in data breach](https://api.xposedornot.com/v1/check-email/)
- [Known Yahoo Mail Domain Names](https://docs.google.com/spreadsheets/d/1D2222IlCnSoo0_MVMkdsQ5sHVIVLLold3sHeS9NLlpc/edit?gid=1536936899#gid=1536936899)

### IP Abuse
- ✅ [Spamhaus Drop List](https://www.spamhaus.org/drop/drop.txt) (~12 hours)
  - https://www.spamhaus.org/blocklists/do-not-route-or-peer/
- ✅ [blocklist_net_ua](https://blocklist.net.ua/blocklist.csv) (~10 min)
  - https://blocklist.net.ua/
- [botscout](https://botscout.com/last_caught_cache.htm) (~30 min)
  - https://botscout.com/api.htm
- [cleantalk](https://iplists.firehol.org/?ipset=cleantalk) (~1 min)
- [cleantalk_1d](https://iplists.firehol.org/?ipset=cleantalk_1d) (~1 min)
- [cleantalk_7d](https://iplists.firehol.org/?ipset=cleantalk_7d) (~1 min)
- [cleantalk_30d](https://iplists.firehol.org/?ipset=cleantalk_30d) (~1 min)
- [cleantalk_top20](https://cleantalk.org/blacklists/top20) (~ 1day)
- [myip.ms IPs identified as web bots in the last 10 days](https://myip.ms/files/blacklist/csf/latest_blacklist.txt) (~1 day)
- [sblam.com IPs used by web form spammers, during the last month](https://sblam.com/blacklist.txt) (~ 1day)
- [StopForumSpam.com Banned IPs used by forum spammers](http://www.stopforumspam.com/downloads/bannedips.zip) (~1 day)
- ❌[Feodo by Abuse.ch](https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.txt)
- ❌[Abuse.ch SSL Blacklist](https://sslbl.abuse.ch/blacklist/sslipblacklist.csv)
- ❌[Abuse.ch Zeus tracker](https://zeustracker.abuse.ch/blocklist.php?download=badips)

### IP Anonymizers

- [dan.me.uk dynamic list of TOR nodes](https://www.dan.me.uk/torlist/) (~30 min)
- [EmergingThreats.net TOR list of TOR network IPs](http://rules.emergingthreats.net/blockrules/emerging-tor.rules) (~12 hours)
- [The Onion Router IP addresses](https://iplists.firehol.org/files/iblocklist_onion_router.netset) (~12 hours)
- [Firehol Proxies](https://iplists.firehol.org/files/firehol_proxies.netset) (~1 min)
- [TorProject.org list of all current TOR exit points](https://iplists.firehol.org/files/tor_exits.ipset) (~5 min)
- [TorProject.org list of all current TOR exit points 1d](https://iplists.firehol.org/files/tor_exits_1d.ipset) (~1 day)
- [TorProject.org list of all current TOR exit points 7d](https://iplists.firehol.org/files/tor_exits_7d.ipset) (~1 min)
- [TorProject.org list of all current TOR exit points 30d](https://iplists.firehol.org/files/tor_exits_30d.ipset) (~5 min)
- [TorProject.org list of all current TOR exit points]() (~5 min)
- [Artillery Threat Intelligence Feed and Banlist Feed ](https://www.binarydefense.com/banlist.txt) (~1 day)
- [CIArmy.com IPs with poor Rogue Packet score that have not yet been identified as malicious by the community](http://cinsscore.com/list/ci-badguys.txt) (~3 hours)

### Domain Names

- [DNS Blocklists](https://github.com/hagezi/dns-blocklists#pro)

### IP to ASN

- [IPv4 prefixes and their origin ASNs](https://thyme.apnic.net/current/data-raw-table) - This file includes the mapping of all IPv4 Addresses to ASNs
- [IPv6 prefixes and their origin ASNs](https://thyme.apnic.net/current/ipv6-raw-table) - This file includes the mapping of all IPv6 Addresses to ASNs
- [ASN to name mapping for ASNs visible on the Internet today](https://thyme.apnic.net/current/data-used-autnums) - This file maps the ASN to it's stringified version, which basically is the humanly readable version of the ASN (descriptive name, usually includes information about the responsible organization).
