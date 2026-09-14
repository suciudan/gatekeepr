SEO Metadata

Title Tag: Free-Trial Abuse Prevention for SaaS | Gatekeepr
Meta Description: Stop repeat signups, disposable emails, and multi-account abuse before they drain your free plan. Gatekeepr returns a clear allow, challenge, or block decision in real time.

Section 1: Hero

Section Type: Hero

Eyebrow:
Free-Trial Abuse Prevention

Title (H1):
Prevent Free-Trial Abuse at Signup

Subtitle:
Stop repeat trials, fake accounts, and disposable emails before they drain free credits, waste infrastructure, and distort your growth metrics.

Description:
Gatekeepr analyzes email, IP, and user agent during signup and returns a clear decision: allow, challenge, or block. You get immediate enforcement plus the context behind every decision.

Primary CTA:
Start Free

Secondary CTA:
View API Docs

Supporting Proof Bar / Microcopy:
Built for SaaS teams with free trials, free credits, freemium plans, and self-serve signup flows.

Section 2: Business Pain

Section Type: Problem / Value Framing

Section Label:
Why it matters

Section Title (H2):
Free-trial abuse becomes a growth tax fast

Section Subtitle:
Bad signups do more than inflate account counts. They create real cost and make your funnel harder to trust.

Card 1 Title:
Wasted free credits

Card 1 Description:
Repeat signups and fake users consume trial credits, onboarding perks, and free usage meant for real prospects.

Card 2 Title:
Higher infrastructure cost

Card 2 Description:
For AI and usage-based products, abusive signups can trigger compute, storage, API, and email costs immediately.

Card 3 Title:
Polluted product analytics

Card 3 Description:
Fake accounts skew activation, conversion, and top-of-funnel performance, making growth decisions less reliable.

Card 4 Title:
More support noise

Card 4 Description:
Abusive self-serve signups create extra tickets, edge cases, and operational cleanup your team should not have to handle.

Section 3: Abuse Patterns

Section Type: Use-Case / Pattern Recognition

Section Label:
Common abuse patterns

Section Title (H2):
What free-trial abuse usually looks like

Intro Line:
Most repeat signup abuse follows a few common patterns that show up before the account is even created.

Pattern 1 Title:
Disposable emails

Pattern 1 Description:
Throwaway inboxes used to reset access and avoid long-term identity.

Pattern 2 Title:
Repeat signups

Pattern 2 Description:
The same person creating multiple accounts to reclaim free trials or credits.

Pattern 3 Title:
VPN, Tor, and anonymous IPs

Pattern 3 Description:
Traffic routed through anonymous networks to hide origin and scale account creation.

Pattern 4 Title:
Suspicious email structure

Pattern 4 Description:
Low-trust email patterns that often appear in automated or abusive signups.

Pattern 5 Title:
Multi-account abuse

Pattern 5 Description:
One user generating multiple identities to exploit freemium limits, waitlists, or onboarding incentives.

Section 4: Why Existing Defenses Fail

Section Type: Competitive Framing / Objection Handling

Section Label:
Why common defenses fall short

Section Title (H2):
CAPTCHA and basic email validation are not enough

Comparison Row 1 Title:
CAPTCHA-only

Comparison Row 1 Description:
Useful against simple automation, but weak against repeat trial users, manual abuse, and multi-account signups.

Comparison Row 2 Title:
Basic email validation

Comparison Row 2 Description:
Checks if an email looks valid or deliverable, but does not help decide whether the signup should be allowed, challenged, or blocked.

Comparison Row 3 Title:
Manual review

Comparison Row 3 Description:
Slow, inconsistent, and expensive. It adds friction after abuse has already entered the funnel.

Closing Line:
Gatekeepr is built to make a clear decision at signup, before free access is granted.

Section 5: Product Explanation

Section Type: How It Works

Section Label:
How Gatekeepr works

Section Title (H2):
A clear signup decision your team can enforce immediately

Description:
Gatekeepr evaluates email, IP, and user agent in real time and returns a final status: allow, challenge, or block.

Decision Block 1 Title:
Allow

Decision Block 1 Description:
The signup looks legitimate. Let the user continue with no added friction.

Decision Block 2 Title:
Challenge

Decision Block 2 Description:
The signup looks suspicious. Add step-up verification, require email confirmation, or apply extra friction before access is granted.

Decision Block 3 Title:
Block

Decision Block 3 Description:
The signup should be rejected before the account is created.

Supporting Line:
Each response also includes threats, trust signals, blocklists, and supporting info so your team can understand why the decision happened.

Trust Line / Microcopy:
Start in monitor mode first, then move to enforcement when you are ready.

Section 6: Enforcement Policies

Section Type: Practical Implementation

Section Label:
Example enforcement policies

Section Title (H2):
Simple ways to apply Gatekeepr in production

Policy 1 Title:
Allow → Continue signup

Policy 1 Description:
Create the account and let legitimate users move through the flow normally.

Policy 2 Title:
Challenge → Verify or add friction

Policy 2 Description:
Require email verification, slow down access to free credits, or route the signup into a lightweight review step.

Policy 3 Title:
Block → Reject signup

Policy 3 Description:
Stop obvious abuse before an account, workspace, or trial is created.

Rollout Note Title:
Recommended rollout

Rollout Note Description:
Start in shadow mode, review outcomes, then enforce block for clear abuse while sending uncertain cases to challenge.

Section 7: API Example

Section Type: Developer Proof

Section Label:
API example

Section Title (H2):
Built to fit directly into your signup flow

Intro Line:
Call Gatekeepr during account creation and map the result to your enforcement logic.

Code Block Title:
Request

POST /v1/signup/check

{
  "email": "user@example.com",
  "ip": "203.0.113.24",
  "user_agent": "Mozilla/5.0"
}

Code Block Title:
Response

{
  "status": "challenge",
  "threats": ["disposable_email", "anonymous_ip"],
  "trust": ["valid_email_syntax"],
  "blocklists": ["known_disposable_provider"],
  "info": {
    "ip_type": "vpn",
    "email_domain": "examplemail.co"
  }
}

Implementation Note:
Use allow to continue signup, challenge to add verification, and block to reject the account before free access is granted.

Secondary CTA:
View API Docs

Section 8: Use Cases

Section Type: Use Cases Grid

Section Label:
Use cases

Section Title (H2):
Built for self-serve SaaS where abuse has real cost

Use Case 1 Title:
Free trials

Use Case 1 Description:
Stop users from resetting trial access through repeat signups.

Use Case 2 Title:
Free credits

Use Case 2 Description:
Prevent bad users from farming usage-based credits across multiple accounts.

Use Case 3 Title:
Freemium products

Use Case 3 Description:
Reduce fake accounts that inflate user numbers but never convert.

Use Case 4 Title:
Abuse-prone waitlists

Use Case 4 Description:
Keep bots and duplicates from corrupting waitlist quality and launch signals.

Use Case 5 Title:
AI products

Use Case 5 Description:
Protect expensive free usage before abusive accounts trigger model or infrastructure cost.

Section 9: Internal Navigation / Supporting Links

Section Type: Internal Links

Section Label:
Explore more

Link 1:
Signup Protection

Link 2:
Email Intelligence

Link 3:
How It Works

Link 4:
Pricing

Link 5:
API Docs

Section 10: FAQs

Section Type: FAQ

Section Title (H2):
Frequently asked questions

FAQ 1 Question:
What data does Gatekeepr need to evaluate a trial signup?

FAQ 1 Answer:
Gatekeepr uses the signals already available at signup: email, IP, and user agent. From those inputs, it returns allow, challenge, or block, along with threats, trust signals, blocklists, and supporting info.

FAQ 2 Question:
What does challenge mean for a suspicious signup?

FAQ 2 Answer:
Challenge means the signup should not be treated as a normal pass. You can require email verification, add extra friction before granting free access, or send the signup through a lightweight review step.

FAQ 3 Question:
Can I run Gatekeepr in shadow mode before blocking users?

FAQ 3 Answer:
Yes. Teams can start in monitor mode, observe decisions in production, and turn on enforcement later. This makes rollout safer and easier to tune operationally.

FAQ 4 Question:
How is this different from basic email validation?

FAQ 4 Answer:
Basic email validation checks whether an address looks valid. Gatekeepr is built for free trial abuse prevention by evaluating signup context and returning a usable decision that helps stop repeat signups, disposable emails, and multi-account abuse.

Section 11: Final CTA

Section Type: Bottom CTA

Section Title (H2):
Stop free-trial abuse before it drains your free plan

Subtitle:
Protect free credits, reduce signup waste, and keep legitimate users moving with a clear allow, challenge, or block decision at signup.

Primary CTA:
Start Free

Secondary CTA:
View API Docs

Closing Microcopy:
For SaaS teams that want cleaner growth data, lower abuse cost, and better control over self-serve signup.