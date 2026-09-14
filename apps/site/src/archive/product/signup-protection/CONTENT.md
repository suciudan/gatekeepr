# Signup Protection — Final Copy Deck

**Field value**  
203.0.113.42

**Field label**  
User agent

**Field value**  
Mozilla/5.0 ...

### Card 2

**Card label**  
Decision

**Primary status**  
Challenge

**Supporting text**  
Suspicious signup detected. Require email verification before account creation.

### Card 3

**Card label**  
Signals

**Group label**  
Threats

**Threat item**  
Disposable email

**Threat item**  
Datacenter IP

**Group label**  
Trust signals

**Trust item**  
Valid email syntax

* * *

# 3) Problem / Impact Section

**Section label**  
Why it matters

**Section headline (H2)**  
Fake signups become a growth tax fast

**Section description**  
Bad accounts do more than create noise. They waste free accounts, distort funnel metrics, and add cost before you even realize they should not exist.

### Impact card 1

**Card title**  
Wasted free accounts

**Card description**  
Fake users consume trials, freemium access, and onboarding resources without real intent.

### Impact card 2

**Card title**  
Inflated signup numbers

**Card description**  
Top-of-funnel volume looks healthy while actual user quality drops.

### Impact card 3

**Card title**  
Polluted activation metrics

**Card description**  
Bad signups distort activation, conversion, and onboarding data across your product.

### Impact card 4

**Card title**  
Support and infrastructure waste

**Card description**  
Fake accounts trigger emails, hit your app, and create cleanup work for your team.

**Bottom support line**  
The best time to stop signup abuse is before the account gets created.

* * *

# 4) Abuse Patterns Section

**Section label**  
What teams are dealing with

**Section headline (H2)**  
Common abuse patterns at signup

**Section description**  
Gatekeepr is built to catch the patterns that show up most often in fake signup protection and account creation abuse.

### Pattern card 1

**Card title**  
Disposable emails

**Card description**  
Block throwaway addresses before they create low-quality accounts.

### Pattern card 2

**Card title**  
Suspicious email structure

**Card description**  
Catch patterns often linked to generated or low-trust signup attempts.

### Pattern card 3

**Card title**  
Bot signup traffic

**Card description**  
Detect scripted signups and suspicious client behavior early.

### Pattern card 4

**Card title**  
Datacenter, VPN, and Tor traffic

**Card description**  
Spot infrastructure commonly associated with suspicious signup activity.

### Pattern card 5

**Card title**  
Repeat signups and multi-account abuse

**Card description**  
Reduce recycled trials, repeated account creation, and freemium abuse.

* * *

# 5) What Gatekeepr Checks Section

**Section label**  
How it works

**Section headline (H2)**  
What Gatekeepr checks during signup

**Section description**  
Gatekeepr evaluates the signals your product already collects and turns them into one clear decision.

### Feature card 1

**Feature title**  
Email signals

**Feature description**  
Analyze disposability, suspicious structure, and other indicators tied to fake or low-trust signups.

### Feature card 2

**Feature title**  
IP and network signals

**Feature description**  
Check blocklists and infrastructure patterns linked to risky signup traffic.

### Feature card 3

**Feature title**  
User agent and request context

**Feature description**  
Use request-level context to spot abnormal clients, automation, and suspicious signup patterns.

**Closing line**  
Instead of relying on one weak signal, Gatekeepr evaluates email, network, and request context together.

**Inline text link**  
Email Intelligence

**Inline text link**  
How It Works

* * *

# 6) Decision Section

**Section label**  
Decisioning

**Section headline (H2)**  
Allow, challenge, or block

**Section description**  
Keep good users moving, apply friction only when needed, and stop obvious abuse before account creation.

### Decision card 1

**Card label**  
Allow

**Card title**  
Let legitimate users glide through

**Card description**  
If the signup looks normal, create the account and keep onboarding friction low.

### Decision card 2

**Card label**  
Challenge

**Card title**  
Add friction only to suspicious signups

**Card description**  
Trigger email verification, temporary friction, or manual review for traffic that looks risky but not clearly abusive.

### Decision card 3

**Card label**  
Block

**Card title**  
Stop clear abuse at the door

**Card description**  
Reject signups that show strong signs of disposable email abuse, automation, or suspicious infrastructure.

* * *

## Rollout callout

**Callout label**  
Safe rollout

**Callout title**  
Start in shadow mode first

**Callout description**  
Log Gatekeepr decisions in your signup flow, review threats and trust signals, and switch to enforcement when you are ready.

* * *

# 7) Comparison Section

**Section label**  
Why this approach

**Section headline (H2)**  
More complete than CAPTCHA-only or email-validation-only approaches

**Section description**  
Useful tools solve part of the problem. Signup fraud prevention needs a broader view of the request.

### Comparison card 1

**Card title**  
CAPTCHA-only

**Mini label**  
Good for

**Mini text**  
Basic bot friction

**Mini label**  
Misses

**Mini text**  
Disposable emails, repeat signups, and signup quality

### Comparison card 2

**Card title**  
Email-validation-only

**Mini label**  
Good for

**Mini text**  
Checking email format or validity

**Mini label**  
Misses

**Mini text**  
IP reputation, suspicious infrastructure, and request context

### Comparison card 3

**Card title**  
Gatekeepr

**Mini label**  
Built for

**Mini text**  
Protecting the signup flow with multi-signal decisions

**Mini label**  
Adds

**Mini text**  
Real-time allow, challenge, or block decisions with explainable signals

**Bottom support line**  
Use CAPTCHA where it helps. Use email validation where it helps. Use Gatekeepr when you need to protect the signup flow itself.

**Inline text link**  
Free-Trial Abuse Prevention

* * *

# 8) API Section

**Section label**  
Developer experience

**Section headline (H2)**  
One API call in your signup flow

**Section description**  
Send the core signup signals you already collect. Get a real-time decision your backend can act on immediately.

### Left-side bullets

**Bullet**  
Send email, IP, and user agent

**Bullet**  
Get allow, challenge, or block in real time

**Bullet**  
Inspect threats, trust signals, and blocklists

**Bullet**  
Roll out in shadow mode before enforcement

**Inline text link**  
API Docs

**Inline text link**  
Pricing

* * *

## Code block tabs

**Tab label**  
Request

http

POST /v1/signup/check  
Content-Type: application/json  
Authorization: Bearer YOUR\_API\_KEY  
  
{  
  "email": "user@example.com",  
  "ip": "203.0.113.42",  
  "user\_agent": "Mozilla/5.0 ..."  
}

**Tab label**  
Response

JSON

{  
  "status": "challenge",  
  "threats": \[  
    "disposable\_email",  
    "datacenter\_ip"  
  \],  
  "trust\_signals": \[  
    "valid\_email\_syntax"  
  \],  
  "blocklists": \[  
    "known\_disposable\_provider"  
  \],  
  "info": {  
    "email\_domain": "examplemail.co",  
    "network\_type": "datacenter",  
    "recommended\_action": "require\_email\_verification"  
  }  
}

* * *

# 9) Use Cases Section

**Section label**  
Use cases

**Section headline (H2)**  
Built for SaaS signup flows with abuse risk

**Section description**  
Gatekeepr fits anywhere account creation quality matters.

### Use case card 1

**Card title**  
Free-trial signup protection

**Card description**  
Reduce repeat signups, disposable emails, and low-intent trial abuse before accounts are created.

### Use case card 2

**Card title**  
Freemium abuse prevention

**Card description**  
Stop fake users from consuming product resources without real product intent.

### Use case card 3

**Card title**  
Waitlist protection

**Card description**  
Keep launch and beta lists cleaner by filtering suspicious signups early.

### Use case card 4

**Card title**  
Self-serve SaaS onboarding

**Card description**  
Protect onboarding without adding unnecessary friction for legitimate users.

### Use case card 5

**Card title**  
B2B signup quality control

**Card description**  
Improve account quality when signup intent matters more than raw signup volume.

* * *

# 10) FAQ Section

**Section label**  
FAQ

**Section headline (H2)**  
Questions teams ask before rollout

* * *

### FAQ item 1

**Question**  
What data does Gatekeepr need to evaluate a signup?

**Answer**  
Gatekeepr uses the core signals already available in most signup flows: email, IP, and user agent. That keeps the integration lightweight while still giving you strong coverage for signup fraud prevention and account creation abuse.

### FAQ item 2

**Question**  
What does challenge mean in practice?

**Answer**  
Challenge means the signup looks suspicious, but not suspicious enough to block immediately. You can use it to trigger email verification, temporary friction, or manual review without slowing down every user.

### FAQ item 3

**Question**  
Can I use Gatekeepr with my existing backend or auth flow?

**Answer**  
Yes. Gatekeepr is built to plug into existing signup flows. Make the API call from your backend, inspect the result, and decide whether to allow, challenge, or block before account creation completes.

### FAQ item 4

**Question**  
Can I run Gatekeepr in shadow mode before blocking users?

**Answer**  
Yes. You can log decisions first, review how Gatekeepr classifies signup traffic, and move to enforcement later.

* * *

# 11) Final CTA Section

**Section label**  
Ready to protect your signup flow?

**Headline**  
Stop fake signups before they become product noise

**Subheadline**  
Block disposable emails, challenge suspicious traffic, and keep legitimate users moving with one simple API.

**Primary CTA**  
Start Free

**Secondary CTA**  
View API Docs

**Support links**  
Email Intelligence  
Free-Trial Abuse Prevention  
How It Works  
Pricing

