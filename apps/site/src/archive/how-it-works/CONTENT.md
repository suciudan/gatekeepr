\## How It Works page copy



\*\*Eyebrow\*\*  

How it works



\*\*H1\*\*  

Stop fake signups in one API call



\*\*Subhead\*\*  

Gatekeepr helps SaaS teams prevent free-trial abuse, block disposable emails, and reduce bot signups before accounts are created. Send the signup data you already collect, and Gatekeepr returns a clear decision your product can use instantly: \*\*allow\*\*, \*\*challenge\*\*, or \*\*block\*\*.



\*\*Primary CTA\*\*  

Start Free



\*\*Secondary CTA\*\*  

View API Docs



\*\*Support line\*\*  

Real-time signup protection for modern SaaS products



\* \* \*



\### Step 1



\*\*Heading\*\*  

Send the signup data you already have



\*\*Body\*\*  

Add Gatekeepr to your signup flow, free-trial flow, waitlist, onboarding, or invite flow. Pass the email address, IP address, and user agent from the request. No complex setup. No heavy fraud system. Just one API call inside the flow you already own.



Bash



curl \\-X POST "https://api.gatekeepr.io" \\\\  

&#x20; \\-H "Authorization: \\\[API\\\_KEY\\]" \\\\  

&#x20; \\-H "Content-Type: application/json" \\\\  

&#x20; \\-d '{  

&#x20;   "email": "user@example.com",  

&#x20;   "ip": "203.0.113.10",  

&#x20;   "user\\\_agent": "Mozilla/5.0 ..."  

&#x20; }'



\*\*Microcopy\*\*  

Use Gatekeepr anywhere a user can create an account or claim free product value.



\* \* \*



\### Step 2



\*\*Heading\*\*  

Gatekeepr checks the signals bad signups leave behind



\*\*Intro\*\*  

A fake signup rarely looks bad in just one place. Gatekeepr evaluates multiple signals together so you can make a better decision than email validation alone.



\*\*Card title\*\*  

Email checks



\*\*Card body\*\*  

Detect disposable and temporary email providers, suspicious aliases, role accounts, malformed addresses, and patterns that look auto-generated instead of human.



\*\*Card title\*\*  

Domain checks



\*\*Card body\*\*  

Verify that the domain is real, registered, and able to receive mail. Catch newly created, expired, invalid, or low-trust domains before they turn into fake accounts.



\*\*Card title\*\*  

IP checks



\*\*Card body\*\*  

Inspect network reputation and infrastructure signals such as Tor exits, abuse blocklists, hosting ranges, anonymized traffic, and other risky signup sources.



\*\*Card title\*\*  

User-agent checks



\*\*Card body\*\*  

Flag headless browsers, automation tools, scripted clients, and non-human request patterns that often show up in bot signup campaigns.



\* \* \*



\### Step 3



\*\*Heading\*\*  

Get a decision your product can act on instantly



\*\*Intro\*\*  

Gatekeepr returns a simple decision instead of forcing your team to interpret a raw risk score.



\*\*Decision\*\*  

Allow



\*\*Decision body\*\*  

Create the account normally. Good users move through signup without extra friction.



\*\*Decision\*\*  

Challenge



\*\*Decision body\*\*  

Ask for one more proof point when risk is uncertain. Trigger email verification, CAPTCHA, OTP, or limited access until the user proves intent.



\*\*Decision\*\*  

Block



\*\*Decision body\*\*  

Stop the signup before free credits, infrastructure, analytics, or support time are wasted.



JSON



{  

&#x20; "status": "allow",  

&#x20; "threats": \\\[\\],  

&#x20; "trust": \\\["email\\\_passes\\\_rfc5322"\\],  

&#x20; "blocklists": \\\[\\],  

&#x20; "info": {  

&#x20;   "email\\\_known\\\_provider": "gmail"  

&#x20; }  

}



\*\*Microcopy\*\*  

Use `status` for the product decision. Use `threats` and `trust` for visibility and internal rules.



\* \* \*



\### Why this works



\*\*Heading\*\*  

More than a disposable email checker API



\*\*Body\*\*  

Blocking temporary email addresses is useful, but it is not enough. Repeat trial abusers also use fresh domains, risky IP infrastructure, anonymized traffic, and automated browsers to create fake accounts at scale. Gatekeepr combines those signals into one real-time signup abuse prevention layer built for SaaS products.



\*\*Callout\*\*  

Email validation tells you whether an address looks real. Gatekeepr helps you decide whether the signup should be trusted.



\* \* \*



\### Built for SaaS signup protection



\*\*Heading\*\*  

Protect the metrics that actually matter



\*\*Item title\*\*  

Stop free-trial abuse



\*\*Item body\*\*  

Make it harder for users to create multiple accounts just to keep accessing your free plan or credits.



\*\*Item title\*\*  

Block disposable emails



\*\*Item body\*\*  

Keep throwaway inboxes out of your funnel before they inflate signups and lower lead quality.



\*\*Item title\*\*  

Reduce bot signups



\*\*Item body\*\*  

Catch automated signup attempts before they burn infrastructure, trigger noisy support work, or create junk accounts.



\*\*Item title\*\*  

Keep analytics clean



\*\*Item body\*\*  

Protect activation, conversion, and retention metrics from fake accounts that distort product decisions.



\* \* \*



\### Where to use Gatekeepr



\*\*Heading\*\*  

Add protection anywhere users can claim value



\*\*Body\*\*  

Use Gatekeepr on account creation, free-trial signup, waitlists, invite flows, onboarding forms, and high-risk self-serve entry points. If a flow creates an account, provisions credits, or opens product access, it is a good place to run a check.



\* \* \*



\### FAQ



\*\*Question\*\*  

What data does Gatekeepr need to evaluate a signup?



\*\*Answer\*\*  

Email is required. IP address and user agent make the decision stronger by adding network and browser context.



\*\*Question\*\*  

What does a challenge decision mean?



\*\*Answer\*\*  

A challenge means Gatekeepr found suspicious or incomplete signals, but not enough for a hard block. It gives you room to add smart friction only when needed.



\*\*Question\*\*  

Is Gatekeepr just for disposable email detection?



\*\*Answer\*\*  

No. Gatekeepr is built for signup abuse prevention. It combines email, domain, IP, and user-agent checks to help stop fake signups and repeat free-trial abuse.



\*\*Question\*\*  

Can I use Gatekeepr with my existing backend?



\*\*Answer\*\*  

Yes. Gatekeepr is designed to fit into existing signup and onboarding flows through a simple API call.



\* \* \*



\### Final CTA



\*\*Heading\*\*  

Protect your signup flow before abuse becomes a growth tax



\*\*Body\*\*  

Stop fake signups, block disposable emails, and slow repeat trial abuse before bad accounts reach your product.



\*\*Primary CTA\*\*  

Start Free



\*\*Secondary CTA\*\*  

Explore Docs





