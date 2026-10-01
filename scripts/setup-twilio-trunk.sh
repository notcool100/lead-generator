#!/usr/bin/env bash
# One-time Twilio setup for Retell calling:
#   - allows calls to Nepal (geo permission)
#   - creates Elastic SIP trunk "retell" with a credential list (login for Retell)
#   - points inbound (origination) to sip:sip.retellai.com
#   - attaches the Twilio number to the trunk
# Saves the SIP login to .env (gitignored) for the Retell import step.
#
# Usage: TW_AUTH="SKxxx:secret" TW_ACCOUNT=ACxxx TW_NUMBER=+1xxx bash scripts/setup-twilio-trunk.sh
set -euo pipefail

: "${TW_AUTH:?set TW_AUTH=APIKEY_SID:APIKEY_SECRET}"
: "${TW_ACCOUNT:?set TW_ACCOUNT=AC...}"
: "${TW_NUMBER:?set TW_NUMBER=+1...}"
DOMAIN="${TW_TRUNK_DOMAIN:-ubuck-retell.pstn.twilio.com}"
SIP_USER="${TW_SIP_USER:-retelluser}"
SIP_PASS="$(python3 -c 'import secrets,string; a=string.ascii_letters+string.digits; p="".join(secrets.choice(a) for _ in range(22)); print("Aa1"+p)')"

api() { curl -sS --fail-with-body -u "$TW_AUTH" "$@"; }
field() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)"; }

echo "→ Allowing calls to Nepal"
if ! out=$(api -X POST https://voice.twilio.com/v1/DialingPermissions/BulkCountryUpdates \
  --data-urlencode 'UpdateRequest=[{"iso_code":"NP","low_risk_numbers_enabled":"true","high_risk_special_numbers_enabled":"false","high_risk_tollfraud_numbers_enabled":"false"}]'); then
  echo "  ⚠ Couldn't change Nepal permission via API: $out"
  echo "  → Do it in the console: Voice → Settings → Geo permissions → tick Nepal → Save. Continuing."
fi

echo "→ Creating SIP trunk $DOMAIN"
TRUNK=$(api -X POST https://trunking.twilio.com/v1/Trunks -d FriendlyName=retell -d "DomainName=$DOMAIN" | field "['sid']")

echo "→ Creating SIP credentials ($SIP_USER)"
CL=$(api -X POST "https://api.twilio.com/2010-04-01/Accounts/$TW_ACCOUNT/SIP/CredentialLists.json" -d FriendlyName=retell | field "['sid']")
api -X POST "https://api.twilio.com/2010-04-01/Accounts/$TW_ACCOUNT/SIP/CredentialLists/$CL/Credentials.json" \
  -d "Username=$SIP_USER" --data-urlencode "Password=$SIP_PASS" >/dev/null
api -X POST "https://trunking.twilio.com/v1/Trunks/$TRUNK/CredentialLists" -d "CredentialListSid=$CL" >/dev/null

echo "→ Origination → sip:sip.retellai.com"
api -X POST "https://trunking.twilio.com/v1/Trunks/$TRUNK/OriginationUrls" \
  -d FriendlyName=retell -d SipUrl=sip:sip.retellai.com -d Priority=10 -d Weight=10 -d Enabled=true >/dev/null

echo "→ Attaching $TW_NUMBER to the trunk"
PN=$(api "https://api.twilio.com/2010-04-01/Accounts/$TW_ACCOUNT/IncomingPhoneNumbers.json" --data-urlencode "PhoneNumber=$TW_NUMBER" -G | field "['incoming_phone_numbers'][0]['sid']")
api -X POST "https://trunking.twilio.com/v1/Trunks/$TRUNK/PhoneNumbers" -d "PhoneNumberSid=$PN" >/dev/null

ENV_FILE="$(dirname "$0")/../.env"
{
  echo ""
  echo "# Twilio SIP trunk login (for importing the number into Retell)"
  echo "TWILIO_SIP_TERMINATION_URI=$DOMAIN"
  echo "TWILIO_SIP_USERNAME=$SIP_USER"
  echo "TWILIO_SIP_PASSWORD=$SIP_PASS"
  echo "RETELL_FROM_NUMBER=$TW_NUMBER"
} >> "$ENV_FILE"

echo "✔ Done. Trunk $TRUNK. SIP login saved to .env (TWILIO_SIP_*); RETELL_FROM_NUMBER set."
