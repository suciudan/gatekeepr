---
order: 100
icon: mail
meta:
  title: "Email Address | Gatekeepr"
---

# Email Address

## RFC 5322 Check

This check verifies that the email address is syntactically correct according to the 
[RFC 5322](https://datatracker.ietf.org/doc/html/rfc5322) standard, which defines the proper format for internet email 
addresses. It ensures the address has a valid local part and domain, no forbidden characters or sequences (such as 
consecutive dots), and uses correct placement of symbols like @ and .. By enforcing these rules, the system filters out 
clearly invalid emails before running more advanced checks.

Examples of emails that will fail this check:

{.compact}
Email   | Reason
---    | ---
`jane..doe@example.com` | Double dot in local part
`.john@example.com` | Leading dot
`john@.com` | Invalid domain
`john@` | Missing domain
`john doe@example.com` | Unescaped space

## Disposable Domain

This check identifies whether the email address uses a disposable or temporary email service, such as Mailinator, 
10MinuteMail, or Guerrilla Mail. Disposable emails are often used to bypass free tier limits or create fraudulent 
accounts because they allow users to quickly generate throwaway inboxes. The system compares the domain part of the 
email (example.com) against a maintained list of known disposable domains and providers.

This is the exact-domain disposable check. Gatekeepr also performs a separate domain MX verification step that can block
custom domains whose MX hostnames or MX IPs overlap with active disposable-mail infrastructure, even when the exact
domain is not listed here.

Examples of emails that will fail this check:

- `user@mailinator.com`
- `temp@guerrillamail.com`
- `signup@10minutemail.com`
- `fake@trashmail.com`
- `quick@dispostable.com`

## Role-Based Address Check

This check detects whether the email address is a generic role-based account instead of belonging to an individual user. 
Addresses like `admin@`, `support@`, and `info@` are commonly shared by teams or used for automated communication rather 
than personal sign-ups. Blocking or flagging these helps prevent abuse, ensures accountability, and reduces the risk of 
low-quality registrations.

Examples of emails that will fail this check:

- `support@example.com`
- `info@example.com`
- `admin@example.com`
- `contact@example.com`
- `sales@example.com`

## Known Provider Check

This check detects whether the email address belongs to a well-known email provider, such as Gmail, Outlook, Yahoo, etc. 
These domains are widely trusted and consistently configured, so when a known provider is detected, domain-related 
checks (like MX records and domain age) are skipped to avoid redundant checks. This check does not affect the final
`status` by itself.

## Separator Check

This check analyzes the use of separators in the local part of the email address to detect patterns often associated 
with fraudulent or auto-generated accounts. It performs three validations:

1. Identifies whether the local part is split into fragments by dots (`.`) or hyphens (`-`), such as `j.o.h.n.d.o.e` or 
`j-o-h-n-d-o-e`.
2. Detects consecutive separators, for example `..`, `--`, or `__`, which are commonly used to evade filters.
3. Calculates the overall separator density and flags the address if separators exceed 30% of the local part's length.

## Tag Check

This check now treats any `+` alias in the local part of the email address as suspicious. If the local part contains a
plus sign anywhere, the API raises `email_suspicious_tag`. On its own, this pushes the final decision to `challenge`
instead of `block`.

For example, the following emails will be flagged by this check:

- `user+3f9xQz8p@gmail.com`
- `admin+internal@company.org`
- `test_user+alias@example.com`
- `signup+promo@domain.net`

## Composition Check

The Composition Check validates whether an email address's local part (everything before the "@") is likely to be 
artificial, suspicious, or non-human. It enforces several rules to ensure the local part is well-formed and 
natural-looking. Specifically, the check fails if the local part is too short (<2 chars) or too long (>30 chars), if it 
consists only of digits, or if more than 50% of its characters are numeric. 

It also flags addresses containing five consecutive digits, no vowels at all, or unusually high entropy (>4), which 
suggests random or automated generation. Additional validations include rejecting addresses with repeated characters 
(like "aaaaaa"), mixed writing scripts (Latin, Greek, Cyrillic combined), or emojis in the local part.

Below are examples of email addresses that will fail the Composition Check:

{.compact}
Email   | Reason
---    | ---
`1@domain.com` | Too short
`1234567890@domain.com` | Only digits
`john123456@domain.com` | Five digits in a row
`x9q2z5k1v8s4d0@domain.com` | High entropy
`bcd@domain.com` | No vowels
`aaaaaaaaaaa@domain.com` | Repeated characters
`μαθήματα@domain.com` | Mixed scripts (Greek + Latin)
`smile😊@domain.com` | Contains emoji
