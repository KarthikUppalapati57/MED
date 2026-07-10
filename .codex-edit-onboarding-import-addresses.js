const fs = require('fs');
const path = 'code/src/modules/setup/pages/OnboardingPage.jsx';
let text = fs.readFileSync(path, 'utf8');
const replace = (from, to) => {
  if (!text.includes(from)) throw new Error(`Missing expected text: ${from.slice(0, 160)}`);
  text = text.replace(from, to);
};
const afterRequired = String.raw`      if (!locationName) throw new Error(\`Row \${rowIdx + 2}: location_name is required.\`);

      const locationAddress = addressFromRow(row, 'location_address');
      const locationAddressError = addressError(locationAddress, \`Row \${rowIdx + 2} location business/service address\`);
      if (locationAddressError) throw new Error(locationAddressError);

      const orgKey = normalizeKey(valueFor(row, 'organization_slug') || orgName);
      if (!orgMap.has(orgKey)) {
        const orgAddressEnabled = hasAddressValues(row, 'organization_address');
        orgMap.set(orgKey, {
          ...createOrganization(),
          name: orgName,
          slug: slugify(valueFor(row, 'organization_slug') || orgName),
          slugManual: Boolean(valueFor(row, 'organization_slug')),
          addressEnabled: orgAddressEnabled,
          address: orgAddressEnabled ? addressFromRow(row, 'organization_address') : emptyAddress(),
          brands: [],
        });
      }`.replaceAll('\\`', '`').replaceAll('\\${', '${');
const newAfterRequired = String.raw`      if (!locationName) throw new Error(\`Row \${rowIdx + 2}: location_name is required.\`);

      const orgBusinessAddress = addressFromRow(row, 'organization_address');
      const orgAddressError = addressError(orgBusinessAddress, \`Row \${rowIdx + 2} organization business/service address\`);
      if (orgAddressError) throw new Error(orgAddressError);

      const orgMailingSameAsBusiness = parseCsvBoolean(valueFor(row, 'organization_mailing_same_as_business'), true);
      const orgMailingAddress = orgMailingSameAsBusiness ? emptyAddress() : addressFromRow(row, 'organization_mailing_address');
      if (!orgMailingSameAsBusiness) {
        const orgMailingAddressError = addressError(orgMailingAddress, \`Row \${rowIdx + 2} organization mailing address\`);
        if (orgMailingAddressError) throw new Error(orgMailingAddressError);
      }

      const locationAddress = addressFromRow(row, 'location_address');
      const locationAddressError = addressError(locationAddress, \`Row \${rowIdx + 2} location business/service address\`);
      if (locationAddressError) throw new Error(locationAddressError);

      const orgKey = normalizeKey(valueFor(row, 'organization_slug') || orgName);
      if (!orgMap.has(orgKey)) {
        orgMap.set(orgKey, {
          ...createOrganization(),
          name: orgName,
          slug: slugify(valueFor(row, 'organization_slug') || orgName),
          slugManual: Boolean(valueFor(row, 'organization_slug')),
          businessAddress: orgBusinessAddress,
          mailingSameAsBusiness: orgMailingSameAsBusiness,
          mailingAddress: orgMailingAddress,
          brands: [],
        });
      }`.replaceAll('\\`', '`').replaceAll('\\${', '${');
replace(afterRequired, newAfterRequired);
fs.writeFileSync(path, text);
