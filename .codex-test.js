const fs = require('fs');
const path = 'code/src/modules/setup/pages/OnboardingPage.jsx';
let text = fs.readFileSync(path, 'utf8');
const replace = (from, to) => {
  if (!text.includes(from)) throw new Error(`Missing expected text: ${from.slice(0, 160)}`);
  text = text.replace(from, to);
};
replace(`      const locationAddress = addressFromRow(row, 'location_address');
      const locationAddressError = addressError(locationAddress, [96mRow ${rowIdx + 2} location business/service address[39m);
      if (locationAddressError) throw new Error(locationAddressError);
`, `__IMPOSSIBLE__`);
