# RestOps-360 Azure Communication Services SMS Implementation Packet

**Prepared:** July 24, 2026  
**Purpose:** Website implementation, Azure toll-free verification, and launch QA  
**Program:** RestOps-360 Security Codes  
**Business:** Mindful Tech Solutions Inc.  
**Website:** `https://restops-360.com`

> Internal implementation document. Do not publish this entire file as a public policy page.

## 1. Approved Program Positioning

RestOps-360 uses SMS only for user-requested transactional security codes supporting registration, login, phone verification, multi-factor authentication, and account recovery.

This campaign must not send marketing, promotional offers, restaurant promotions, lead-generation content, payment solicitations, or unrelated product announcements.

## 2. Website Routes Required Before Submission

| Route | Public page |
|---|---|
| `/privacy` | Privacy Policy |
| `/terms` | Terms of Service |
| `/sms-terms` | SMS Terms and Conditions |
| `/acceptable-use` | Acceptable Use Policy |
| `/cookies` | Cookie Policy |
| `/security` | Security Overview |
| `/dpa` | Data Processing Addendum |
| `/sla` | Service Level Agreement |
| `/subprocessors` | Subprocessor List |

All pages must be publicly accessible without login, render on mobile, use HTTPS, and be linked from the site footer.

## 3. Required Disclosure Beside the Phone Field

Use this disclosure immediately adjacent to the phone-number field and the **Send Verification Code** button:

> By selecting **Send Verification Code**, you request a one-time SMS from **RestOps-360, operated by Mindful Tech Solutions Inc.**, containing a security code for registration, login, phone verification, multi-factor authentication, or account recovery. Message frequency varies based on your requests. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase. See our [SMS Terms](/sms-terms) and [Privacy Policy](/privacy).

Implementation requirements:

- The disclosure must be visible before the button is selected.
- Do not pre-check a consent checkbox.
- Do not send a message merely because the number field is completed.
- Log the exact disclosure version accepted.
- Use a separate optional checkbox and separate consent record for any future marketing texts.
- Marketing consent must never be bundled with account creation or security-code consent.

## 4. Recommended UI Pattern

**Mobile number**  
`[ +1 | (___) ___-____ ]`

`[ ] I confirm this is my mobile number and I am authorized to receive security texts at this number.`

Disclosure text from Section 3.

**Button:** `Send Verification Code`

For an OTP-only flow, the affirmative button can be the consent action if the disclosure is conspicuous. The confirmation checkbox adds stronger evidence and reduces wrong-number risk.

## 5. Initial OTP Message Template

> RestOps-360 security code: {CODE}. Expires in {MINUTES} minutes. Do not share this code. Msg & data rates may apply. Reply HELP for help or STOP to opt out.

Recommended expiration: 5–10 minutes.

Do not include invoice totals, bank details, tax identifiers, passwords, restaurant financial data, or other sensitive business information in SMS.

## 6. STOP Response

> RestOps-360: You have opted out of security text messages. No further texts will be sent unless you re-enroll. SMS verification may be unavailable. Contact +1 (865) 666-7690 or contact@mindfultechsol.com for help.

System behavior:

- immediately suppress future messages to the number;
- record date, time, sending number, recipient number, keyword, campaign, and confirmation status;
- prevent sending through alternate numbers for the same campaign;
- allow re-enrollment only through START where supported or a new verified web consent flow.

## 7. HELP Response

> RestOps-360 Security Codes: For help, visit restops-360.com or contact +1 (865) 666-7690 / contact@mindfultechsol.com. Msg & data rates may apply. Reply STOP to opt out.

## 8. START Response

> RestOps-360 Security Codes: You are re-enrolled for user-requested account security texts. Message frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.

Require any additional account-security verification needed to prevent unauthorized re-enrollment.

## 9. Azure Toll-Free Verification — Program Description

Use the following in the Azure application, adjusting only for the field limit:

> Mindful Tech Solutions Inc. operates RestOps-360, a restaurant-operations SaaS platform. RestOps-360 sends user-requested transactional SMS security codes for account registration, login, phone verification, multi-factor authentication, and account recovery. Recipients are RestOps-360 business users who enter their own mobile number and select Send Verification Code after seeing the SMS disclosure. One message is generally sent per request. No marketing or promotional content is sent.

## 10. Azure Toll-Free Verification — Opt-In Description

> The user accesses a RestOps-360 registration, login, phone-verification, multi-factor authentication, or account-recovery screen at https://restops-360.com. The user manually enters their own mobile number. At collection, the page displays the RestOps-360/Mindful Tech Solutions sender identity, security-message purpose, variable frequency, message/data rate notice, STOP and HELP instructions, consent-not-a-condition-of-purchase statement, and links to the SMS Terms and Privacy Policy. No SMS is sent merely because a number is entered. The user must select Send Verification Code. The system records the number, timestamp, disclosure version, user/account, IP/session metadata where appropriate, and resulting delivery/opt-out status.

## 11. Azure Verification Screenshot Checklist

Submit clear, publicly accessible screenshots showing:

1. RestOps-360 branding and website domain.
2. The registration/login/MFA/account-recovery purpose.
3. The mobile-number field.
4. The full SMS disclosure beside the field.
5. The unchecked authorization checkbox, if used.
6. The **Send Verification Code** button.
7. Links to `/sms-terms` and `/privacy`.
8. A successful code-entry screen.
9. The SMS Terms page.
10. The Privacy Policy page with the SMS section.

Do not submit a screenshot that requires Azure reviewers to create an account or sign in.

## 12. Azure Sample Message Categories

**Authentication / registration**

> RestOps-360 security code: 123456. Expires in 10 minutes. Do not share this code. Msg & data rates may apply. Reply HELP for help or STOP to opt out.

**Account recovery**

> RestOps-360 account recovery code: 123456. Expires in 10 minutes. If you did not request this, ignore this message and contact support. Reply HELP or STOP.

**Phone verification**

> RestOps-360 phone verification code: 123456. Expires in 10 minutes. Msg & data rates may apply. Reply HELP for help or STOP to opt out.

## 13. Consent Record Minimum Fields

Retain evidence sufficient to demonstrate consent and program compliance:

| Field | Purpose |
|---|---|
| consent_record_id | Unique audit identifier |
| user_id / account_id | Links request to the requesting user |
| mobile_number | Recipient |
| normalized_mobile_hash | Search and suppression support with reduced exposure |
| program_name | RestOps-360 Security Codes |
| message_purpose | Registration, login, MFA, verification, or recovery |
| disclosure_version | Exact disclosure accepted |
| consent_action | Send Verification Code / checkbox / START |
| consent_timestamp_utc | Evidence of timing |
| source_page | URL or application route |
| session_id | Evidence of session |
| ip_address / user_agent | Additional evidence where legally and operationally appropriate |
| sending_number | Toll-free or other approved sender |
| message_template_version | Exact template sent |
| delivery_status | Submitted, delivered, failed, or blocked |
| opt_out_status | Active, opted out, or re-enrolled |
| opt_out_timestamp_utc | Compliance evidence |
| evidence_snapshot | Screenshot or immutable copy of disclosure |

Recommended retention: at least four years after consent or last message, subject to counsel-approved legal retention requirements.

## 14. Technical Enforcement Controls

- Normalize telephone numbers to E.164 format.
- Validate U.S. mobile eligibility before sending where practical.
- Require a fresh user action for every code.
- Rate limit by user, number, IP, device, and tenant.
- Limit code attempts and expire codes quickly.
- Do not log plaintext OTP values.
- Encrypt mobile numbers at rest where appropriate.
- Restrict access to consent and delivery records.
- Process STOP before any outbound send.
- Maintain a centralized suppression list across all sending numbers used for this campaign.
- Configure and test STOP, START, HELP, CANCEL, END, QUIT, REVOKE, OPT OUT, and UNSUBSCRIBE.
- Monitor delivery failures, complaints, opt-out rates, and suspicious request patterns.
- Separate production, test, and development traffic.
- Never use production recipients for unapproved testing.
- Re-submit the Azure campaign if the brand, use case, opt-in flow, number, message type, or material program details change.

## 15. Launch QA Test Cases

| Test | Expected result |
|---|---|
| Enter number without selecting Send Verification Code | No SMS |
| Select Send Verification Code | One OTP sent and consent record created |
| Repeated rapid requests | Rate limited |
| Wrong or expired code | Rejected without exposing account details |
| Reply STOP | Suppression recorded; future sends blocked |
| Attempt send after STOP | Blocked before ACS call |
| Reply HELP | Approved HELP response |
| Reply START | Re-enrollment only after approved flow |
| Marketing template through OTP campaign | Blocked |
| Consent page without policy links | Release blocked |
| SMS Terms or Privacy page requires login | Release blocked |
| Sensitive data included in template | Release blocked |
| Azure delivery failure | Status recorded; no false “delivered” UI |
