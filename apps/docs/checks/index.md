---
order: 50
icon: telescope
meta:
  title: "Checks | Gatekeepr"
---

# Checks

To prevent abuse, Gatekeepr performs a series of checks across three primary signals: Email, IP Address, and User Agent. 

Each signal goes through multiple layers of inspection to determine potential abuse or fraud.

## Email Checks

We analyze the submitted email address for formatting, legitimacy, and potential risk indicators. [View email checks](/checks/email/).

## Domain Checks

We extract and validate the domain from the email to assess age, existence, MX availability, and MX infrastructure
overlap with disposable providers. [View domain checks](/checks/domain/).

## IP Address Checks

The IP address is checked for network type, anonymization services, and reserved ranges. [View IP checks](/checks/ip/).

## User Agent Checks

We evaluate the user agent string to detect suspicious patterns and outdated or automated browsers. [View User Agent Checks](/checks/user-agent/).
