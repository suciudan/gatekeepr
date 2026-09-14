SEO Metadata



Title Tag

Disposable Email Detection API | Gatekeepr



Meta Description

Detect temporary, risky, and suspicious email addresses in real time. Gatekeepr helps you block fake signups and improve signup quality before account creation.



Landing Page Copy Structure

Section 1 — Hero



Section Type: Hero



Eyebrow

Email Intelligence



Title (H1)

Disposable Email Detection \& Email Intelligence



Subtitle

Detect risky emails before fake signups get in.



Description

Most teams only validate email format. Gatekeepr goes further with real-time email intelligence that helps you detect disposable, suspicious, and low-quality email addresses at signup — and decide whether to allow, challenge, or block the registration.



Primary CTA

Start Free



Secondary CTA

Explore Docs



Supporting Text / Trust Bar

Detect disposable domains · Flag role accounts · Catch suspicious aliases · Explain every decision



Section 2 — Value Proposition



Section Type: Intro / Problem-Solution



Section Title (H2)

Email is the earliest trust signal in signup



Section Description

Before a new user verifies, upgrades, invites teammates, or consumes product resources, their email already tells you a lot. Gatekeepr helps you use that signal early — not just to check formatting, but to screen for throwaway signups, suspicious patterns, and low-intent accounts.



Feature Highlight 1 — Card Title

Go beyond syntax checks



Feature Highlight 1 — Card Description

A valid-looking email can still be disposable, abusive, or low quality. Gatekeepr helps you detect the difference.



Feature Highlight 2 — Card Title

Make signup decisions in real time



Feature Highlight 2 — Card Description

Use email signals during registration to decide whether to allow, challenge, or block before account creation.



Feature Highlight 3 — Card Title

Understand why a decision happened



Feature Highlight 3 — Card Description

Get threats, trust signals, blocklists, and contextual info in the API response so your team can act with confidence.



Section 3 — Positioning Comparison



Section Type: Comparison / Product Positioning



Section Title (H2)

More useful than validation. More focused than generic fraud tools.



Section Description

Gatekeepr’s Email Intelligence layer sits between basic email validation and full signup protection.



Column 1



Column Title

Email Validation



Column Description

Checks whether an email looks structurally valid.



Column Bullets



Syntax checks



Basic domain checks



MX checks



Column Footer

Useful for formatting. Not enough for signup risk.



Column 2



Column Title

Email Intelligence



Column Description

Checks whether an email should be trusted at signup.



Column Bullets



Disposable email detection



Role-based email detection



Suspicious +tag usage



Separator abuse



Local-part pattern analysis



Domain and provider context



Column Footer

Built for signup quality and abuse prevention.



Column 3



Column Title

Signup Protection



Column Description

Combines email, IP, and user agent signals into a broader signup decision.



Column Bullets



Email intelligence



IP signals



User agent analysis



Final signup decision



Column Footer

Best for teams that want full registration protection.



Supporting Links

See also: Signup Protection · Free-Trial Abuse Prevention · How It Works



Section 4 — What Gatekeepr Checks



Section Type: Feature Grid



Section Title (H2)

What Gatekeepr checks inside an email



Section Description

Gatekeepr is built for real-time email screening during signup, not list cleaning or deliverability workflows.



Feature Card 1 — Title

Disposable domains



Feature Card 1 — Description

Detect temporary email domains and throwaway inbox providers before they create fake accounts.



Feature Card 2 — Title

Role-based addresses



Feature Card 2 — Description

Flag shared inboxes like admin@, info@, sales@, or support@ that often signal lower-intent signups.



Feature Card 3 — Title

Suspicious plus aliases



Feature Card 3 — Description

Identify +tag patterns that may be used to create repeated accounts or bypass trial limits.



Feature Card 4 — Title

Separator abuse



Feature Card 4 — Description

Catch excessive punctuation, repeated separators, or unnatural structure in the local part.



Feature Card 5 — Title

Artificial local-part patterns



Feature Card 5 — Description

Detect usernames that look randomly generated, manipulated, or unusually constructed.



Feature Card 6 — Title

Domain and MX context



Feature Card 6 — Description

Return useful email-related context, including provider and domain signals, to support better decisions.



Section 5 — Pattern Examples



Section Type: Examples / Visual Proof



Section Title (H2)

Examples of risky email patterns



Section Description

Not every suspicious email should be blocked. But these patterns often indicate fake signups, low intent, or account abuse.



Example Row 1 — Pattern Title

Disposable inbox



Example Row 1 — Example Text

newaccount847@temporarymail.example



Example Row 1 — Explanation

Common in throwaway signups and fake account creation.



Example Row 2 — Pattern Title

Role account



Example Row 2 — Example Text

admin@company.com



Example Row 2 — Explanation

Often shared, generic, or lower intent for self-serve product signup.



Example Row 3 — Pattern Title

Suspicious plus alias



Example Row 3 — Example Text

jane+trial-7+new@provider.com



Example Row 3 — Explanation

Can indicate repeated trial creation or signup manipulation.



Example Row 4 — Pattern Title

Separator abuse



Example Row 4 — Example Text

john....doe---2026@provider.com



Example Row 4 — Explanation

Excessive separators can signal automated or artificially generated accounts.



Example Row 5 — Pattern Title

Artificial local part



Example Row 5 — Example Text

x9t4q7m2@provider.com



Example Row 5 — Explanation

High-randomness usernames may indicate low-quality or bot-created signups.



Section 6 — Decisioning



Section Type: Outcome / Decision Logic



Section Title (H2)

Turn email signals into allow, challenge, or block



Section Description

Gatekeepr helps you act on email risk in a practical way. Not every suspicious address should be blocked. Some should simply be challenged before account creation.



Decision Card 1 — Title

Allow



Decision Card 1 — Description

Use when the email looks normal and no meaningful abuse signals are present.



Decision Card 2 — Title

Challenge



Decision Card 2 — Description

Use when the email is questionable but not clearly abusive. Add verification, CAPTCHA, OTP, or another friction step.



Decision Card 3 — Title

Block



Decision Card 3 — Description

Use when the email strongly indicates throwaway or abusive signup intent, such as known temporary domains.



Supporting Note

This is where email intelligence becomes more useful than validation alone: it helps you respond proportionally, instead of treating every signup the same way.



Section 7 — API Example



Section Type: Product / API Proof



Section Title (H2)

Run email intelligence during signup



Section Description

Check an email in real time before creating the account.



Code Block Label

Example Request



POST /v1/signup/check

Content-Type: application/json

Authorization: Bearer sk\_live\_xxx



{

&nbsp; "email": "jane+trial-7@tempmail.io",

&nbsp; "ip": "203.0.113.10",

&nbsp; "user\_agent": "Mozilla/5.0 ..."

}



Code Block Label

Example Response



{

&nbsp; "status": "challenge",

&nbsp; "threats": \[

&nbsp;   "disposable\_email",

&nbsp;   "suspicious\_plus\_alias"

&nbsp; ],

&nbsp; "trust\_signals": \[

&nbsp;   "known\_provider\_context"

&nbsp; ],

&nbsp; "blocklists": \[

&nbsp;   "temporary\_email\_domains"

&nbsp; ],

&nbsp; "info": {

&nbsp;   "email": {

&nbsp;     "domain": "tempmail.io",

&nbsp;     "is\_disposable": true,

&nbsp;     "is\_role\_based": false,

&nbsp;     "has\_plus\_tag": true,

&nbsp;     "has\_separator\_abuse": false,

&nbsp;     "local\_part\_pattern": "suspicious"

&nbsp;   }

&nbsp; }

}



Supporting Text

Get a final decision plus explainability fields your product and ops team can actually use.



CTA Link

Explore API Docs



Section 8 — Use Cases



Section Type: Use Cases Grid



Section Title (H2)

Built for teams that care about signup quality



Use Case 1 — Title

Block disposable email signups



Use Case 1 — Description

Stop temporary email domains before they create fake or throwaway accounts.



Use Case 2 — Title

Improve free-trial signup quality



Use Case 2 — Description

Reduce low-intent trial users and repeated account creation early in the funnel.



Use Case 3 — Title

Protect waitlists and lead capture forms



Use Case 3 — Description

Filter low-quality or suspicious emails before they enter your pipeline.



Use Case 4 — Title

Reduce fake users in self-serve onboarding



Use Case 4 — Description

Screen signups before provisioning, onboarding flows, or workspace creation.



Use Case 5 — Title

Filter suspicious accounts earlier



Use Case 5 — Description

Use email signals as an early layer before stronger abuse controls are needed.



Section 9 — FAQs



Section Type: FAQ



FAQ 1 — Question

What is the difference between email validation and email intelligence?



FAQ 1 — Answer

Email validation checks whether an address is formatted correctly and whether the domain appears usable. Email intelligence goes further by detecting signup risk signals such as disposable domains, role-based addresses, suspicious aliases, separator abuse, and artificial local-part patterns.



FAQ 2 — Question

Do you detect disposable and role-based email addresses?



FAQ 2 — Answer

Yes. Gatekeepr supports disposable email detection and role-based email detection in real time during signup. It also flags suspicious +tag usage, separator abuse, and other risky email patterns.



FAQ 3 — Question

Can I use Gatekeepr before account creation?



FAQ 3 — Answer

Yes. Gatekeepr is designed to run during registration so you can screen emails and make a decision before the account is created.



FAQ 4 — Question

What should I do when an email is marked challenge?



FAQ 4 — Answer

Challenge is useful when the email looks suspicious but not clearly abusive. Most teams use it to trigger email verification, CAPTCHA, OTP, or another extra step before allowing the signup to continue.



Section 10 — Final CTA



Section Type: Closing CTA



Title (H2)

Stop treating email like a formatting check



Description

Gatekeepr helps you use email as a real trust signal at signup. Detect disposable and suspicious addresses in real time, improve signup quality, and decide when to allow, challenge, or block.



Primary CTA

Start Free



Secondary CTA

Explore Docs



Supporting Links

Pricing · How It Works · Signup Protection

